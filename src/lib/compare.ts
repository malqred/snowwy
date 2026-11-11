import { haversine } from './analyze';
import type { Analysis, Segment, TrackPoint } from './types';

/** Спуск, разложенный по пройденному пути: значения через равные отрезки расстояния. */
export type Profile = {
  /** Длина спуска по горизонтали, м */
  length: number;
  /** Скорость, км/ч */
  speed: number[];
  /** Сколько высоты потеряно от старта, м */
  drop: number[];
};

const SAMPLES = 120;

/**
 * Строит профиль спуска по расстоянию от старта. По расстоянию, а не по времени,
 * потому что так два спуска по одной трассе ложатся друг на друга участок к участку.
 */
export function runProfile(points: TrackPoint[], analysis: Analysis, run: Segment): Profile {
  const at: number[] = [0];
  for (let i = run.from + 1; i <= run.to; i++) {
    const a = points[i - 1];
    const b = points[i];
    at.push(at[at.length - 1] + haversine(a.lat, a.lon, b.lat, b.lon));
  }
  const length = at[at.length - 1];
  const speed: number[] = [];
  const drop: number[] = [];
  const startAlt = analysis.alt[run.from];
  let k = 0;
  for (let s = 0; s < SAMPLES; s++) {
    const target = (length * s) / (SAMPLES - 1);
    while (k < at.length - 2 && at[k + 1] < target) k++;
    const step = at[k + 1] - at[k];
    const f = step > 0 ? Math.min(1, Math.max(0, (target - at[k]) / step)) : 0;
    const i = run.from + k;
    const j = Math.min(i + 1, run.to);
    speed.push((analysis.speed[i] + (analysis.speed[j] - analysis.speed[i]) * f) * 3.6);
    drop.push(startAlt - (analysis.alt[i] + (analysis.alt[j] - analysis.alt[i]) * f));
  }
  return { length, speed, drop };
}

export type DayParts = {
  /** Секунды на спусках, на подъёмниках и всё остальное (очереди, отдых, паузы) */
  run: number;
  lift: number;
  rest: number;
  /** Отрезки дня по порядку — для полосы времени */
  strip: { kind: 'run' | 'lift' | 'rest'; seconds: number }[];
};

/** Делит день на спуски, подъёмы и отдых. */
export function dayParts(segments: Segment[], startedAt: number, endedAt: number): DayParts {
  const strip: DayParts['strip'] = [];
  let run = 0;
  let lift = 0;
  let cursor = startedAt;
  for (const s of segments) {
    const gap = (s.startedAt - cursor) / 1000;
    if (gap > 0) strip.push({ kind: 'rest', seconds: gap });
    strip.push({ kind: s.kind, seconds: s.duration });
    if (s.kind === 'run') run += s.duration;
    else lift += s.duration;
    cursor = Math.max(cursor, s.endedAt);
  }
  const tail = (endedAt - cursor) / 1000;
  if (tail > 0) strip.push({ kind: 'rest', seconds: tail });
  const total = Math.max((endedAt - startedAt) / 1000, run + lift);
  return { run, lift, rest: Math.max(0, total - run - lift), strip };
}
