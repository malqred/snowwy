import type { Analysis, LiveState, Segment, SegmentKind, Totals, TrackPoint } from './types';

/** Смена направления по высоте, после которой фиксируется новый участок, м */
const REVERSAL = 15;
/** Минимальные параметры спуска и подъёма */
const MIN_VERTICAL = 25;
const MIN_RUN_DISTANCE = 80;
const MIN_RUN_DURATION = 15;
const MIN_LIFT_DURATION = 30;
/** Ниже этой скорости считаем, что человек стоит, м/с */
const MOVING_SPEED = 0.6;
/** Ниже этой скорости обрезаем начало и конец участка (очередь, сборы), м/с */
const TRIM_SPEED = 1.5;
/** Остановка или разрыв сигнала дольше этого делит спуск на два, с */
const SPLIT_STOP = 240;

const R = 6371000;
const RAD = Math.PI / 180;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Скользящее среднее по окну времени ±halfMs вокруг каждой точки. */
function smooth(points: TrackPoint[], pick: (p: TrackPoint) => number, halfMs: number): number[] {
  const n = points.length;
  const out = new Array<number>(n);
  let lo = 0;
  let hi = -1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = points[i].t;
    while (hi + 1 < n && points[hi + 1].t <= t + halfMs) {
      hi++;
      sum += pick(points[hi]);
    }
    while (points[lo].t < t - halfMs) {
      sum -= pick(points[lo]);
      lo++;
    }
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

type Leg = { dir: -1 | 1; from: number; to: number; open: boolean };

/** Делит трек на участки «вниз» и «вверх» по сглаженной высоте (зигзаг с порогом). */
function findLegs(alt: number[]): { legs: Leg[]; dir: -1 | 0 | 1; extreme: number } {
  const legs: Leg[] = [];
  const n = alt.length;
  let dir: -1 | 0 | 1 = 0;
  let hi = 0;
  let lo = 0;
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (alt[i] > alt[hi]) hi = i;
    if (alt[i] < alt[lo]) lo = i;
    if (dir === 0) {
      if (alt[hi] - alt[i] >= REVERSAL) {
        dir = -1;
        start = hi;
        lo = i;
      } else if (alt[i] - alt[lo] >= REVERSAL) {
        dir = 1;
        start = lo;
        hi = i;
      }
    } else if (dir === -1) {
      if (alt[i] - alt[lo] >= REVERSAL) {
        legs.push({ dir: -1, from: start, to: lo, open: false });
        dir = 1;
        start = lo;
        hi = i;
      }
    } else if (alt[hi] - alt[i] >= REVERSAL) {
      legs.push({ dir: 1, from: start, to: hi, open: false });
      dir = -1;
      start = hi;
      lo = i;
    }
  }
  const extreme = dir === -1 ? lo : hi;
  if (dir !== 0) legs.push({ dir, from: start, to: extreme, open: true });
  return { legs, dir, extreme };
}

/** Делит участок на части по долгим остановкам и разрывам сигнала. */
function splitByStops(points: TrackPoint[], speed: number[], from: number, to: number): [number, number][] {
  const parts: [number, number][] = [];
  let partStart = from;
  let stopStart = -1;
  for (let i = from + 1; i <= to; i++) {
    const gap = (points[i].t - points[i - 1].t) / 1000;
    if (gap >= SPLIT_STOP) {
      parts.push([partStart, i - 1]);
      partStart = i;
      stopStart = -1;
      continue;
    }
    if (speed[i] < MOVING_SPEED) {
      if (stopStart < 0) stopStart = i;
    } else {
      if (stopStart >= 0 && (points[i].t - points[stopStart].t) / 1000 >= SPLIT_STOP) {
        parts.push([partStart, stopStart]);
        partStart = i;
      }
      stopStart = -1;
    }
  }
  parts.push([partStart, to]);
  return parts;
}

function buildSegment(
  points: TrackPoint[],
  alt: number[],
  speed: number[],
  speedFast: number[],
  kind: SegmentKind,
  from: number,
  to: number,
  open: boolean
): Segment | null {
  while (from < to && speed[from] < TRIM_SPEED) from++;
  while (to > from && speed[to] < TRIM_SPEED) to--;
  if (to - from < 2) return null;

  let distance = 0;
  let movingTime = 0;
  let maxSpeed = 0;
  for (let i = from + 1; i <= to; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (speedFast[i] > maxSpeed) maxSpeed = speedFast[i];
    if (speed[i] < MOVING_SPEED) continue;
    const flat = haversine(a.lat, a.lon, b.lat, b.lon);
    const dAlt = alt[i] - alt[i - 1];
    distance += Math.sqrt(flat * flat + dAlt * dAlt);
    movingTime += (b.t - a.t) / 1000;
  }

  // Минимальная скорость — без разгона в начале и торможения в конце
  const edge = Math.floor((to - from) * 0.1);
  let minSpeed = Infinity;
  for (let i = from + edge; i <= to - edge; i++) {
    if (speed[i] < minSpeed) minSpeed = speed[i];
  }
  if (!isFinite(minSpeed)) minSpeed = 0;

  const duration = (points[to].t - points[from].t) / 1000;
  const vertical = Math.abs(alt[from] - alt[to]);

  if (vertical < MIN_VERTICAL) return null;
  if (kind === 'run' && (distance < MIN_RUN_DISTANCE || duration < MIN_RUN_DURATION)) return null;
  if (kind === 'lift' && duration < MIN_LIFT_DURATION) return null;

  return {
    kind,
    n: 0,
    from,
    to,
    startedAt: points[from].t,
    endedAt: points[to].t,
    duration,
    movingTime,
    distance,
    vertical,
    startAlt: alt[from],
    endAlt: alt[to],
    avgSpeed: movingTime > 0 ? distance / movingTime : 0,
    maxSpeed,
    minSpeed,
    open,
  };
}

export const EMPTY_TOTALS: Totals = {
  runs: 0,
  lifts: 0,
  distance: 0,
  vertical: 0,
  maxSpeed: 0,
  avgSpeed: 0,
  runTime: 0,
  liftTime: 0,
  maxAlt: 0,
  minAlt: 0,
};

export const EMPTY_ANALYSIS: Analysis = {
  segments: [],
  totals: EMPTY_TOTALS,
  state: 'move',
  alt: [],
  speed: [],
};

/** Находит в треке спуски и подъёмы и считает статистику. */
export function analyze(points: TrackPoint[]): Analysis {
  const n = points.length;
  if (n < 3) return { ...EMPTY_ANALYSIS, alt: points.map((p) => p.alt), speed: points.map((p) => p.speed) };

  const alt = smooth(points, (p) => p.alt, 4000);
  const speed = smooth(points, (p) => p.speed, 2500);
  const speedFast = smooth(points, (p) => p.speed, 1000);

  const { legs, dir, extreme } = findLegs(alt);
  const segments: Segment[] = [];
  let runs = 0;
  let lifts = 0;

  for (const leg of legs) {
    if (leg.dir === -1) {
      const parts = splitByStops(points, speed, leg.from, leg.to);
      parts.forEach(([from, to], idx) => {
        const seg = buildSegment(points, alt, speed, speedFast, 'run', from, to, leg.open && idx === parts.length - 1);
        if (seg) {
          seg.n = ++runs;
          segments.push(seg);
        }
      });
    } else {
      const seg = buildSegment(points, alt, speed, speedFast, 'lift', leg.from, leg.to, leg.open);
      if (seg) {
        seg.n = ++lifts;
        segments.push(seg);
      }
    }
  }

  let distance = 0;
  let vertical = 0;
  let maxSpeed = 0;
  let runTime = 0;
  let runMoving = 0;
  let liftTime = 0;
  for (const s of segments) {
    if (s.kind === 'run') {
      distance += s.distance;
      vertical += s.vertical;
      runTime += s.duration;
      runMoving += s.movingTime;
      if (s.maxSpeed > maxSpeed) maxSpeed = s.maxSpeed;
    } else {
      liftTime += s.duration;
    }
  }
  let maxAlt = -Infinity;
  let minAlt = Infinity;
  for (let i = 0; i < n; i++) {
    if (alt[i] > maxAlt) maxAlt = alt[i];
    if (alt[i] < minAlt) minAlt = alt[i];
  }

  let state: LiveState = 'move';
  if (speed[n - 1] < 1) state = 'pause';
  else if (dir === -1 && alt[n - 1] - alt[extreme] < REVERSAL / 2) state = 'run';
  else if (dir === 1 && alt[extreme] - alt[n - 1] < REVERSAL / 2) state = 'lift';

  return {
    segments,
    totals: {
      runs,
      lifts,
      distance,
      vertical,
      maxSpeed,
      avgSpeed: runMoving > 0 ? distance / runMoving : 0,
      runTime,
      liftTime,
      maxAlt,
      minAlt,
    },
    state,
    alt,
    speed,
  };
}

/** Прореживает массив до не более чем max элементов, сохраняя первый и последний. */
export function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
}
