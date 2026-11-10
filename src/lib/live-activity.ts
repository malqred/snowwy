import { isRunningInExpoGo } from 'expo';
import type { LiveActivity } from 'expo-widgets';
import { Image, Platform } from 'react-native';

import type { RideActivityProps } from '@/widgets/ride-activity';

import { clock, distance, int, kmh, runsWord } from './format';
import type { Analysis, LiveState, TrackPoint } from './types';

/** Как часто обновлять окно на экране блокировки, мс */
const UPDATE_EVERY = 5000;

const STATE_TITLE: Record<LiveState, string> = {
  run: 'Спуск',
  lift: 'Подъём',
  pause: 'Пауза',
  move: 'В движении',
};

type Factory = typeof import('@/widgets/ride-activity').default;

let factory: Factory | null | undefined;
let instance: LiveActivity<RideActivityProps> | null = null;
let shown = '';
let updatedAt = 0;
let iconUri: string | undefined;

/**
 * Адрес файла со знаком приложения внутри установленного приложения.
 * Расширение, которое рисует островок, читает картинку прямо оттуда.
 */
function getIconUri(): string {
  if (iconUri !== undefined) return iconUri;
  try {
    const uri = Image.resolveAssetSource(require('@/assets/images/island-icon.png'))?.uri ?? '';
    // При разработке картинка отдаётся по сети — такой адрес расширению не подходит
    iconUri = uri.startsWith('file://') ? uri : '';
  } catch {
    iconUri = '';
  }
  return iconUri;
}

/** Окно на экране блокировки есть только в отдельной сборке для iOS — в Expo Go модуля нет. */
function getFactory(): Factory | null {
  if (factory !== undefined) return factory;
  factory = null;
  if (Platform.OS !== 'ios' || isRunningInExpoGo()) return null;
  try {
    // Подключаем лениво: в Expo Go сам импорт модуля виджетов завершается ошибкой
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    factory = (require('@/widgets/ride-activity') as { default: Factory }).default;
  } catch {
    factory = null;
  }
  return factory;
}

function toProps(startedAt: number, analysis: Analysis, last: TrackPoint | null, paused = false): RideActivityProps {
  const { totals } = analysis;
  const state: LiveState = last ? analysis.state : 'pause';
  const d = distance(totals.distance);
  return {
    startedAt,
    frozen: paused ? clock((Date.now() - startedAt) / 1000) : '',
    icon: getIconUri(),
    state: paused ? 'На паузе' : last ? STATE_TITLE[state] : 'Ищем GPS…',
    runs: `${totals.runs}`,
    runsLabel: runsWord(totals.runs),
    speed: kmh(last && !paused && state !== 'pause' ? last.speed : 0),
    maxSpeed: kmh(totals.maxSpeed),
    distance: `${d.value} ${d.unit}`,
    vertical: `${int(totals.vertical)} м`,
  };
}

/** Показывает окно с текущим катанием на экране блокировки. */
export function startRideActivity(startedAt: number, analysis: Analysis) {
  const f = getFactory();
  if (!f) return;
  try {
    // Окна, оставшиеся от прошлого запуска, убираем
    for (const old of f.getInstances()) old.end('immediate').catch(() => {});
    const props = toProps(startedAt, analysis, null);
    instance = f.start(props, 'snowwy://');
    shown = JSON.stringify(props);
    updatedAt = Date.now();
  } catch {
    instance = null;
  }
}

/**
 * Обновляет окно, если данные изменились и с прошлого обновления прошло достаточно времени.
 * startedAt — начало отсчёта таймера (время старта, сдвинутое на паузы).
 * force — обновить сразу, не дожидаясь интервала (пауза и продолжение).
 */
export function updateRideActivity(
  startedAt: number,
  analysis: Analysis,
  last: TrackPoint | null,
  paused: boolean,
  force = paused
) {
  if (!instance) return;
  const now = Date.now();
  if (!force && now - updatedAt < UPDATE_EVERY) return;
  const props = toProps(startedAt, analysis, last, paused);
  const next = JSON.stringify(props);
  if (next === shown) return;
  shown = next;
  updatedAt = now;
  instance.update(props).catch(() => {});
}

/** Убирает окно с экрана блокировки. */
export function endRideActivity() {
  const f = getFactory();
  if (!f) return;
  try {
    for (const active of f.getInstances()) active.end('immediate').catch(() => {});
  } catch {
    // окна нет — убирать нечего
  }
  instance = null;
  shown = '';
}
