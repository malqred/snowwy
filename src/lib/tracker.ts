import { isRunningInExpoGo } from 'expo';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { Barometer } from 'expo-sensors';
import * as TaskManager from 'expo-task-manager';
import { useSyncExternalStore } from 'react';

import { analyze, EMPTY_ANALYSIS, haversine } from './analyze';
import { autoBackup } from './backup';
import * as db from './db';
import { sharePause, shareStop, shareTick } from './friends/store';
import { bindRideActions, endRideActivity, startRideActivity, updateRideActivity } from './live-activity';
import { cancelNotify, ensureNotifyPermission, notifyLater, notifyNow } from './notify';
import { getSettings } from './settings';
import { createSpeedFilter, displaySpeed } from './speed';
import type { Analysis, TrackPoint } from './types';
import { dayPhrase, liftPhrase, runPhrase, say } from './voice';
import { fetchWeather } from './weather';

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
/** Показание барометра годится для точки, если снято не дальше этого по времени, мс */
const BARO_FRESH = 5000;
/** Сколько последних показаний барометра помнить */
const BARO_KEEP = 180;
/** Точка намного хуже предыдущей по точности — это подмешалась позиция по Wi‑Fi или вышкам, м */
const COARSE_ACCURACY = 25;
/** В режиме экономии при заблокированном экране точки приходят пачками раз в столько мс */
const ECONOMY_BATCH = 10000;
/** Погода: сколько раз пробовать и как часто, мс */
const WEATHER_TRIES = 6;
const WEATHER_RETRY = 5 * 60 * 1000;
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
  /** Текущая скорость для показа, м/с: сглажена, на месте равна нулю */
  speed: number;
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
  speed: 0,
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

// Барометр: последние показания со временем и поправка к высоте GPS
let baroSub: { remove: () => void } | null = null;
let baroLog: { t: number; alt: number }[] = [];
let baroOffset: number | null = null;

// Очистка скорости и последние значения для показа
const speedFilter = createSpeedFilter();
let recentSpeeds: number[] = [];

// Сколько завершённых спусков и подъёмов уже названо голосом
let announced = 0;
let announcedLifts = 0;

// Погода: сколько попыток сделано и когда следующая
let weatherTries = 0;
let weatherNextAt = 0;

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

/** Показание барометра на момент времени t (между соседними — по прямой) или null. */
function baroAt(t: number): number | null {
  let after: { t: number; alt: number } | null = null;
  for (let i = baroLog.length - 1; i >= 0; i--) {
    const sample = baroLog[i];
    if (sample.t <= t) {
      if (after && after.t > sample.t && after.t - sample.t <= BARO_FRESH) {
        return sample.alt + ((after.alt - sample.alt) * (t - sample.t)) / (after.t - sample.t);
      }
      return t - sample.t <= BARO_FRESH ? sample.alt : null;
    }
    after = sample;
  }
  return after && after.t - t <= BARO_FRESH ? after.alt : null;
}

/** Высота точки: по барометру, привязанному к GPS, или просто GPS. */
function fuseAltitude(gpsAlt: number, t: number): number {
  // Точки могут прийти пачкой с опозданием, поэтому берём показание на время самой точки
  const baroAlt = baroAt(t);
  if (baroAlt == null) return gpsAlt;
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
    const acc = c.accuracy ?? 999;
    if (acc > MAX_ACCURACY) continue;
    if (prev && loc.timestamp <= prev.t) continue;
    // Грубая точка сразу после точной — позиция по Wi‑Fi или вышкам, а не по спутникам.
    // Она «прыгает» в сторону и портит и трек, и скорость.
    if (prev && acc > COARSE_ACCURACY && acc > prev.acc * 2 && loc.timestamp - prev.t < 5000) continue;

    // Скорость сверяется с реальным смещением: на месте она не «скачет»
    const speed = speedFilter.push({
      t: loc.timestamp,
      lat: c.latitude,
      lon: c.longitude,
      acc,
      speed: c.speed,
    });
    if (speed > MAX_SPEED) continue;

    const point: TrackPoint = {
      t: loc.timestamp,
      lat: c.latitude,
      lon: c.longitude,
      alt: fuseAltitude(c.altitude ?? prev?.alt ?? 0, loc.timestamp),
      speed,
      acc,
    };
    points.push(point);
    pending.push(point);
    recentSpeeds.push(speed);
    if (recentSpeeds.length > 3) recentSpeeds.shift();
    added = true;
  }
  if (!added) return;
  if (pending.length >= FLUSH_EVERY) flush();

  const last = points[points.length - 1];
  const speed = displaySpeed(recentSpeeds);
  const now = Date.now();
  if (now - analyzedAt >= ANALYZE_EVERY) {
    analyzedAt = now;
    set({ last, speed, analysis: analyze(points), pointCount: points.length });
    announceRuns();
  } else {
    set({ last, speed });
  }
  refreshActivity();
  loadWeather(last);
  shareTick(last);
  checkIdle(last);
}

/** Обновляет окно на экране блокировки и островок. */
function refreshActivity(force = false) {
  const last = state.last ? { ...state.last, speed: state.speed } : null;
  // На паузе время в окне стоит: сдвигаем начало отсчёта на длину текущей паузы
  const held = state.paused && state.pausedAt != null ? Date.now() - state.pausedAt : 0;
  updateRideActivity(timerOrigin() + held, state.analysis, last, state.paused, force || state.paused);
}

/** Называет голосом итоги только что законченного спуска (если подключены наушники). */
function announceRuns() {
  const { segments } = state.analysis;
  const done = segments.filter((s) => s.kind === 'run' && !s.open);
  const lifts = segments.filter((s) => s.kind === 'lift' && !s.open);
  const voice = getSettings().voice;
  if (lifts.length > announcedLifts) {
    announcedLifts = lifts.length;
    if (voice) say(liftPhrase(lifts[lifts.length - 1]));
  }
  if (done.length > announced) {
    announced = done.length;
    if (voice) say(runPhrase(done[done.length - 1]));
  }
}

/** Запоминает погоду в начале катания; без интернета пробует ещё несколько раз. */
function loadWeather(point: TrackPoint) {
  const sessionId = state.sessionId;
  if (sessionId == null || weatherTries >= WEATHER_TRIES || point.t < weatherNextAt) return;
  weatherTries++;
  weatherNextAt = point.t + WEATHER_RETRY;
  fetchWeather(point.lat, point.lon, point.alt)
    .then((weather) => {
      if (!weather) return;
      weatherTries = WEATHER_TRIES;
      return db.setWeather(sessionId, weather);
    })
    .catch(() => {});
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
 * На паузе геопозиция не выключается совсем, а переходит в самый грубый режим:
 * он почти не тратит заряд, но не даёт системе усыпить приложение, поэтому
 * кнопка «Продолжить» в островке срабатывает и при заблокированном экране.
 */
const PAUSE_OPTIONS = {
  accuracy: Location.Accuracy.Lowest,
  distanceInterval: 500,
  timeInterval: 60000,
  deferredUpdatesInterval: 60000,
} as const;

/** Настройки фоновой записи во время катания. */
function fullOptions() {
  return {
    ...WATCH_OPTIONS,
    ...TASK_OPTIONS,
    showsBackgroundLocationIndicator: true,
    // Экономия заряда: при заблокированном экране точки копятся и приходят пачкой.
    // Ни одна точка при этом не теряется, меняется только частота обработки.
    // Пока приложение открыто, точки приходят сразу.
    deferredUpdatesInterval: getSettings().economy ? ECONOMY_BATCH : 0,
  };
}

const TASK_OPTIONS = {
  activityType: Location.ActivityType.Fitness,
  pausesUpdatesAutomatically: false,
} as const;

/**
 * Включает получение геопозиции. Возвращает false, если не удалось.
 * resume — возвращаемся с паузы: фоновая запись уже идёт в грубом режиме,
 * достаточно вернуть ей полную точность (это можно и при заблокированном экране).
 */
async function startLocation(resume = false): Promise<boolean> {
  if (resume && usingTask) {
    try {
      await Location.startLocationUpdatesAsync(TASK, fullOptions());
      return true;
    } catch {
      return false;
    }
  }
  // В Expo Go фоновая геолокация недоступна — пишем только при открытом приложении
  usingTask = false;
  if (!isRunningInExpoGo()) {
    try {
      await Location.requestBackgroundPermissionsAsync();
      await Location.startLocationUpdatesAsync(TASK, fullOptions());
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

/** Переводит геопозицию в режим паузы. Не получилось — выключает совсем. */
async function idleLocation() {
  if (usingTask) {
    try {
      await Location.startLocationUpdatesAsync(TASK, {
        ...PAUSE_OPTIONS,
        ...TASK_OPTIONS,
        showsBackgroundLocationIndicator: false,
      });
      return;
    } catch {
      // ниже выключим совсем
    }
  }
  await stopLocation();
}

/** Подключает барометр, если он есть и разрешён. */
async function startBarometer(): Promise<boolean> {
  baroLog = [];
  baroOffset = null;
  try {
    if (!(await Barometer.isAvailableAsync())) return false;
    const perm = await Barometer.requestPermissionsAsync();
    if (!perm.granted) return false;
    Barometer.setUpdateInterval(1000);
    baroSub = Barometer.addListener((m) => {
      if (m.relativeAltitude == null) return;
      baroLog.push({ t: Date.now(), alt: m.relativeAltitude });
      if (baroLog.length > BARO_KEEP) baroLog.shift();
    });
    return true;
  } catch {
    return false;
  }
}

function stopBarometer() {
  baroSub?.remove();
  baroSub = null;
  baroLog = [];
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
  announced = 0;
  announcedLifts = 0;
  weatherTries = 0;
  weatherNextAt = 0;
  recentSpeeds = [];
  speedFilter.reset();
  set({ ...IDLE, recording: true, sessionId, startedAt });

  if (!(await startLocation())) {
    await db.deleteSession(sessionId);
    set(IDLE);
    return 'Не удалось запустить определение геопозиции.';
  }
  const barometer = await startBarometer();
  set({ background: usingTask, barometer });
  startRideActivity(startedAt, EMPTY_ANALYSIS);
  bindRideActions(onRideAction, () => refreshActivity(true));

  if (getSettings().remind) ensureNotifyPermission();
  if (getSettings().keepAwake) activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
  return null;
}

/** Нажатия кнопок в островке. */
function onRideAction(action: 'pause' | 'stop') {
  if (!state.recording) return;
  if (action === 'stop') stopRecording().catch(() => {});
  else if (state.paused) resumeRecording().catch(() => {});
  else pauseRecording().catch(() => {});
}

/** Ставит запись на паузу: точки не пишутся, время и расстояние не считаются. */
export async function pauseRecording(): Promise<void> {
  if (!state.recording || state.paused) return;
  set({ paused: true, pausedAt: Date.now(), speed: 0 });
  refreshActivity(true);
  sharePause(state.last);
  await idleLocation();
  stopBarometer();
  deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
  await flush();
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
  if (!(await startLocation(true))) return 'Не удалось запустить определение геопозиции.';
  const barometer = await startBarometer();
  anchor = null;
  reminded = false;
  recentSpeeds = [];
  speedFilter.reset();
  set({
    paused: false,
    pausedAt: null,
    pausedTotal: state.pausedTotal + (Date.now() - (state.pausedAt ?? Date.now())),
    background: usingTask,
    barometer,
  });
  refreshActivity(true);
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
  shareStop();

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
    const { totals } = analyze(track);
    await db.finishSession(sessionId, endedAt ?? Date.now(), totals);
    if (getSettings().voice) say(dayPhrase(totals));
  }

  points = [];
  pending = [];
  set(IDLE);
  if (saved != null && getSettings().backup) autoBackup();
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
