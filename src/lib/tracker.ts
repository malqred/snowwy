import { isRunningInExpoGo } from 'expo';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { Barometer } from 'expo-sensors';
import * as TaskManager from 'expo-task-manager';
import { useSyncExternalStore } from 'react';

import { analyze, EMPTY_ANALYSIS, haversine } from './analyze';
import * as db from './db';
import { endRideActivity, startRideActivity, updateRideActivity } from './live-activity';
import { cancelNotify, ensureNotifyPermission, notifyLater, notifyNow } from './notify';
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
/** Смещение дальше этого от места остановки считается движением, м */
const MOVE_RADIUS = 60;
/** Без движения дольше этого — напоминаем, что запись идёт, мс */
const REMIND_AFTER = 30 * 60 * 1000;
/** Без движения дольше этого — завершаем запись сами, мс */
const AUTO_STOP_AFTER = 2 * 60 * 60 * 1000;
/** Через сколько напомнить о катании, поставленном на паузу, с */
const PAUSE_REMIND_AFTER = 60 * 60;
/** Показания барометра старше этого не используем, мс */
const BARO_FRESH = 5000;
/** Скорость подстройки барометра под высоту GPS (доля за одну точку) */
const BARO_BLEND = 0.01;

export type TrackerState = {
  recording: boolean;
  /** Запись приостановлена вручную */
  paused: boolean;
  pausedAt: number | null;
  /** Сколько всего запись простояла на паузе, мс */
  pausedTotal: number;
  sessionId: number | null;
  startedAt: number | null;
  /** Запись продолжается при заблокированном экране */
  background: boolean;
  /** Высота уточняется по барометру */
  barometer: boolean;
  analysis: Analysis;
  last: TrackPoint | null;
  /** Число точек в треке; меняется при каждом пересчёте */
  pointCount: number;
};

const IDLE: TrackerState = {
  recording: false,
  paused: false,
  pausedAt: null,
  pausedTotal: 0,
  sessionId: null,
  startedAt: null,
  background: false,
  barometer: false,
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

// Отслеживание простоя: где и когда последний раз было движение
let anchor: { lat: number; lon: number; t: number } | null = null;
let reminded = false;
let pauseReminder: string | null = null;

// Барометр: последнее показание и поправка к высоте GPS
let baroSub: { remove: () => void } | null = null;
let baroAlt: number | null = null;
let baroAt = 0;
let baroOffset: number | null = null;

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

/** Начало отсчёта для таймера: время старта, сдвинутое на все паузы. */
function timerOrigin(): number {
  return (state.startedAt ?? Date.now()) + state.pausedTotal;
}

/** Высота точки: по барометру, привязанному к GPS, или просто GPS. */
function fuseAltitude(gpsAlt: number): number {
  if (baroAlt == null || Date.now() - baroAt > BARO_FRESH) return gpsAlt;
  const diff = gpsAlt - baroAlt;
  // Барометр точно ловит изменения высоты, но не знает абсолютную — её берём у GPS,
  // подстраиваясь медленно, чтобы не переносить шум GPS и учитывать смену погоды.
  baroOffset = baroOffset == null ? diff : baroOffset + (diff - baroOffset) * BARO_BLEND;
  return baroAlt + baroOffset;
}

/** Следит за простоем: напоминает о забытой записи и завершает её сама. */
function checkIdle(point: TrackPoint) {
  if (!anchor || haversine(anchor.lat, anchor.lon, point.lat, point.lon) > MOVE_RADIUS) {
    anchor = { lat: point.lat, lon: point.lon, t: point.t };
    reminded = false;
    return;
  }
  if (!getSettings().remind) return;
  const idle = point.t - anchor.t;
  if (idle > AUTO_STOP_AFTER) {
    const endedAt = anchor.t;
    stopRecording(endedAt).then((id) => {
      if (id != null) {
        notifyNow('Катание завершено', 'Вы два часа не двигались, запись сохранена в истории.');
      }
    });
  } else if (idle > REMIND_AFTER && !reminded) {
    reminded = true;
    notifyNow('Запись катания всё ещё идёт', 'Вы полчаса на одном месте. Если закончили — завершите катание.');
  }
}

function ingest(locations: Location.LocationObject[]) {
  if (!state.recording || state.paused) return;
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
      alt: fuseAltitude(c.altitude ?? prev?.alt ?? 0),
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
  updateRideActivity(timerOrigin(), state.analysis, last, false);
  checkIdle(last);
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

/** Включает получение геопозиции. Возвращает false, если не удалось. */
async function startLocation(): Promise<boolean> {
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
      return false;
    }
  }
  return true;
}

async function stopLocation() {
  if (usingTask) await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
  watch?.remove();
  watch = null;
}

/** Подключает барометр, если он есть и разрешён. */
async function startBarometer(): Promise<boolean> {
  baroAlt = null;
  baroOffset = null;
  try {
    if (!(await Barometer.isAvailableAsync())) return false;
    const perm = await Barometer.requestPermissionsAsync();
    if (!perm.granted) return false;
    Barometer.setUpdateInterval(1000);
    baroSub = Barometer.addListener((m) => {
      if (m.relativeAltitude == null) return;
      baroAlt = m.relativeAltitude;
      baroAt = Date.now();
    });
    return true;
  } catch {
    return false;
  }
}

function stopBarometer() {
  baroSub?.remove();
  baroSub = null;
  baroAlt = null;
  baroOffset = null;
}

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
  anchor = null;
  reminded = false;
  set({ ...IDLE, recording: true, sessionId, startedAt });

  if (!(await startLocation())) {
    await db.deleteSession(sessionId);
    set(IDLE);
    return 'Не удалось запустить определение геопозиции.';
  }
  const barometer = await startBarometer();
  set({ background: usingTask, barometer });
  startRideActivity(startedAt, EMPTY_ANALYSIS);

  if (getSettings().remind) ensureNotifyPermission();
  if (getSettings().keepAwake) activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
  return null;
}

/** Ставит запись на паузу: геопозиция выключается, точки не пишутся. */
export async function pauseRecording(): Promise<void> {
  if (!state.recording || state.paused) return;
  set({ paused: true, pausedAt: Date.now() });
  await stopLocation();
  stopBarometer();
  deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
  await flush();
  updateRideActivity(timerOrigin(), state.analysis, state.last, true);
  if (getSettings().remind) {
    pauseReminder = await notifyLater(
      'Катание на паузе',
      'Запись стоит на паузе уже час. Продолжите или завершите катание.',
      PAUSE_REMIND_AFTER
    );
  }
}

/** Снимает запись с паузы. Возвращает текст ошибки или null. */
export async function resumeRecording(): Promise<string | null> {
  if (!state.recording || !state.paused) return null;
  cancelNotify(pauseReminder);
  pauseReminder = null;
  if (!(await startLocation())) return 'Не удалось запустить определение геопозиции.';
  const barometer = await startBarometer();
  anchor = null;
  reminded = false;
  set({
    paused: false,
    pausedAt: null,
    pausedTotal: state.pausedTotal + (Date.now() - (state.pausedAt ?? Date.now())),
    background: usingTask,
    barometer,
  });
  updateRideActivity(timerOrigin(), state.analysis, state.last, false, true);
  if (getSettings().keepAwake) activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
  return null;
}

/**
 * Завершает запись. Возвращает id сохранённой записи
 * или null, если трек пустой и сохранять нечего.
 * endedAt — время окончания, если оно раньше текущего (автозавершение).
 */
export async function stopRecording(endedAt?: number): Promise<number | null> {
  if (!state.recording || state.sessionId == null) return null;
  const sessionId = state.sessionId;

  // Сначала снимаем флаг записи, чтобы опоздавшие точки не попали в трек
  const track = points;
  set({ recording: false, paused: false });

  await stopLocation();
  stopBarometer();
  cancelNotify(pauseReminder);
  pauseReminder = null;
  deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
  endRideActivity();
  await flush();

  let saved: number | null = sessionId;
  if (track.length < 5) {
    await db.deleteSession(sessionId);
    saved = null;
  } else {
    await db.finishSession(sessionId, endedAt ?? Date.now(), analyze(track).totals);
  }

  points = [];
  pending = [];
  set(IDLE);
  return saved;
}

/** Закрывает записи, оборванные закрытием приложения. */
export async function recoverUnfinished(): Promise<void> {
  if (!state.recording) endRideActivity();
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) {
    if (!state.recording) await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
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

/** Сколько секунд идёт катание без учёта пауз. */
export function elapsedSeconds(s: TrackerState, now: number): number {
  if (s.startedAt == null) return 0;
  const until = s.paused && s.pausedAt != null ? s.pausedAt : now;
  return Math.max(0, (until - s.startedAt - s.pausedTotal) / 1000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTracker(): TrackerState {
  return useSyncExternalStore(subscribe, () => state);
}
