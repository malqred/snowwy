import { isRunningInExpoGo } from 'expo';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useSyncExternalStore } from 'react';

import { analyze, EMPTY_ANALYSIS, haversine } from './analyze';
import * as db from './db';
import { getSettings } from './settings';
import type { Analysis, TrackPoint } from './types';

const TASK = 'snowwy-location';
const KEEP_AWAKE_TAG = 'snowwy-recording';
/** Точки с худшей точностью отбрасываем, м */
const MAX_ACCURACY = 40;
/** Быстрее на лыжах не ездят — это выброс GPS, м/с */
const MAX_SPEED = 70;
/** Как часто пересчитывать спуски во время записи, мс */
const ANALYZE_EVERY = 3000;
/** Сколько точек копить перед записью в базу */
const FLUSH_EVERY = 10;

export type TrackerState = {
  recording: boolean;
  sessionId: number | null;
  startedAt: number | null;
  /** Запись продолжается при заблокированном экране */
  background: boolean;
  analysis: Analysis;
  last: TrackPoint | null;
  /** Число точек в треке; меняется при каждом пересчёте */
  pointCount: number;
};

const IDLE: TrackerState = {
  recording: false,
  sessionId: null,
  startedAt: null,
  background: false,
  analysis: EMPTY_ANALYSIS,
  last: null,
  pointCount: 0,
};

let state: TrackerState = IDLE;
let points: TrackPoint[] = [];
let pending: TrackPoint[] = [];
let analyzedAt = 0;
let watch: Location.LocationSubscription | null = null;
let usingTask = false;

const listeners = new Set<() => void>();

function set(patch: Partial<TrackerState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function flush() {
  if (state.sessionId == null || pending.length === 0) return Promise.resolve();
  const batch = pending;
  pending = [];
  return db.insertPoints(state.sessionId, batch).catch(() => {
    // Не теряем точки, если запись не удалась — попробуем со следующей пачкой
    pending = batch.concat(pending);
  });
}

function ingest(locations: Location.LocationObject[]) {
  if (!state.recording) return;
  let added = false;
  for (const loc of locations) {
    const c = loc.coords;
    const prev = points[points.length - 1];
    if ((c.accuracy ?? 999) > MAX_ACCURACY) continue;
    if (prev && loc.timestamp <= prev.t) continue;

    let speed = c.speed ?? -1;
    if (speed < 0) {
      speed = prev
        ? haversine(prev.lat, prev.lon, c.latitude, c.longitude) / ((loc.timestamp - prev.t) / 1000)
        : 0;
    }
    if (speed > MAX_SPEED) continue;

    const point: TrackPoint = {
      t: loc.timestamp,
      lat: c.latitude,
      lon: c.longitude,
      alt: c.altitude ?? prev?.alt ?? 0,
      speed,
      acc: c.accuracy ?? 0,
    };
    points.push(point);
    pending.push(point);
    added = true;
  }
  if (!added) return;
  if (pending.length >= FLUSH_EVERY) flush();

  const last = points[points.length - 1];
  const now = Date.now();
  if (now - analyzedAt >= ANALYZE_EVERY) {
    analyzedAt = now;
    set({ last, analysis: analyze(points), pointCount: points.length });
  } else {
    set({ last });
  }
}

// Задача должна быть объявлена на верхнем уровне модуля
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data) return;
  ingest(data.locations);
});

const WATCH_OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 0,
  timeInterval: 1000,
} as const;

/**
 * Начинает запись катания.
 * Возвращает текст ошибки, если начать не удалось, иначе null.
 */
export async function startRecording(): Promise<string | null> {
  if (state.recording) return null;

  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) {
    return 'Нет доступа к геопозиции. Разрешите его в Настройках iPhone → Snowwy → Геопозиция.';
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    return 'Службы геолокации выключены. Включите их в Настройках iPhone.';
  }

  const startedAt = Date.now();
  const sessionId = await db.createSession(startedAt);
  points = [];
  pending = [];
  analyzedAt = 0;
  set({ ...IDLE, recording: true, sessionId, startedAt });

  // В Expo Go фоновая геолокация недоступна — пишем только при открытом приложении
  usingTask = false;
  if (!isRunningInExpoGo()) {
    try {
      await Location.requestBackgroundPermissionsAsync();
      await Location.startLocationUpdatesAsync(TASK, {
        ...WATCH_OPTIONS,
        activityType: Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
      });
      usingTask = true;
    } catch {
      usingTask = false;
    }
  }
  if (!usingTask) {
    try {
      watch = await Location.watchPositionAsync(WATCH_OPTIONS, (loc) => ingest([loc]));
    } catch {
      await db.deleteSession(sessionId);
      set(IDLE);
      return 'Не удалось запустить определение геопозиции.';
    }
  }
  set({ background: usingTask });

  if (getSettings().keepAwake) activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
  return null;
}

/**
 * Завершает запись. Возвращает id сохранённой записи
 * или null, если трек пустой и сохранять нечего.
 */
export async function stopRecording(): Promise<number | null> {
  if (!state.recording || state.sessionId == null) return null;
  const sessionId = state.sessionId;

  if (usingTask) {
    await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
  }
  watch?.remove();
  watch = null;
  deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});

  // Сначала снимаем флаг записи, чтобы опоздавшие точки не попали в трек
  const track = points;
  set({ recording: false });
  await flush();

  let saved: number | null = sessionId;
  if (track.length < 5) {
    await db.deleteSession(sessionId);
    saved = null;
  } else {
    await db.finishSession(sessionId, Date.now(), analyze(track).totals);
  }

  points = [];
  pending = [];
  set(IDLE);
  return saved;
}

/** Закрывает записи, оборванные закрытием приложения. */
export async function recoverUnfinished(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
  }
  for (const session of await db.listUnfinished()) {
    if (session.id === state.sessionId) continue;
    const track = await db.getPoints(session.id);
    if (track.length < 5) {
      await db.deleteSession(session.id);
    } else {
      await db.finishSession(session.id, track[track.length - 1].t, analyze(track).totals);
    }
  }
}

/** Точки текущей записи. Массив дополняется на месте — не изменять. */
export function getLivePoints(): TrackPoint[] {
  return points;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTracker(): TrackerState {
  return useSyncExternalStore(subscribe, () => state);
}
