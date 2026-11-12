import type { Analysis, LiveState, Segment, SegmentKind, Totals, TrackPoint } from './types';

/** Смена направления по высоте, после которой фиксируется новый участок, м */
const REVERSAL = 5;
/**
 * Смена направления меньше этой может оказаться не новым участком, а неровностью:
 * контруклоном посреди спуска или провалом на линии подъёмника (см. isBump), м
 */
const BUMP = 15;
/** Дольше этого по инерции в горку не едут: такой подъём уже не контруклон, с */
const BUMP_CLIMB = 20;
/** Подъёмник идёт с ровной скоростью: разброс не больше этого, м/с */
const STEADY_SPREAD = 1.5;
/** Минимальные параметры спуска и подъёма */
const MIN_RUN_VERTICAL = 5;
const MIN_LIFT_VERTICAL = 25;
const MIN_RUN_DISTANCE = 15;
const MIN_RUN_DURATION = 4;
/** Спуск, на котором ни разу не ехали быстрее, — это прогулка пешком, м/с */
const MIN_RUN_TOP_SPEED = 2.5;
/**
 * Пологий спуск: перепад от метра, но ехали не медленнее 15 км/ч. Так считаются выкаты,
 * пологие трассы и переезды между подъёмниками — пешком и на ковре так быстро не ездят.
 */
const GLIDE_SPEED = 15 / 3.6;
const MIN_GLIDE_VERTICAL = 1;
/** Пологий отрезок короче этого — не спуск, а случайный разгон, с и м */
const MIN_GLIDE_DURATION = 8;
const MIN_GLIDE_DISTANCE = 30;
/** На сколько пологий выкат может подняться над концом спуска и всё ещё быть его частью, м */
const GLIDE_RISE = 1.5;
const MIN_LIFT_DURATION = 30;
/** Ниже этой скорости считаем, что человек стоит, м/с */
const MOVING_SPEED = 0.6;
/** Ниже этой скорости обрезаем начало и конец участка (очередь, сборы), м/с */
const TRIM_SPEED = 1.5;
/** Остановка или разрыв сигнала дольше этого делит спуск на два, с */
const SPLIT_STOP = 240;
/** Разрыв между точками дольше этого считается дырой в записи, с */
const MAX_GAP = 30;
/** Высота сглаживается по окну ± столько вокруг каждой точки, мс */
const ALT_SMOOTH = 4000;
/** Длина отрезка по горизонтали, на котором считается максимальный уклон, м */
const SLOPE_WINDOW = 40;

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

/**
 * Убирает одиночные всплески скорости: значение, которое намного выше соседних,
 * заменяется их медианой. Настоящий разгон так не выглядит — соседние точки растут вместе с ним.
 */
export function despike(points: TrackPoint[]): number[] {
  const n = points.length;
  const out = points.map((p) => p.speed);
  const around = [0, 0, 0, 0, 0];
  for (let i = 2; i < n - 2; i++) {
    // Соседи должны быть рядом по времени, иначе сравнивать не с чем
    if (points[i + 2].t - points[i - 2].t > 10000) continue;
    for (let k = 0; k < 5; k++) around[k] = points[i - 2 + k].speed;
    around.sort((a, b) => a - b);
    const median = around[2];
    if (points[i].speed - median > Math.max(4, median * 0.5)) out[i] = median;
  }
  return out;
}

/** Скользящее среднее по окну времени ±halfMs вокруг каждой точки. */
function smooth(points: TrackPoint[], values: number[], halfMs: number): number[] {
  const n = points.length;
  const out = new Array<number>(n);
  let lo = 0;
  let hi = -1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = points[i].t;
    while (hi + 1 < n && points[hi + 1].t <= t + halfMs) {
      hi++;
      sum += values[hi];
    }
    while (points[lo].t < t - halfMs) {
      sum -= values[lo];
      lo++;
    }
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

type Leg = { dir: -1 | 1; from: number; to: number; open: boolean };

/** Делит трек на участки «вниз» и «вверх» по сглаженной высоте (зигзаг с порогом). */
function findLegs(alt: number[]): Leg[] {
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
  if (dir !== 0) legs.push({ dir, from: start, to: dir === -1 ? lo : hi, open: true });
  return legs;
}

/**
 * Неровность, а не настоящий участок: короткий контруклон посреди спуска
 * или провал посреди подъёма, который подъёмник проходит с ровной скоростью.
 */
function isBump(points: TrackPoint[], alt: number[], speed: number[], leg: Leg): boolean {
  if (Math.abs(alt[leg.from] - alt[leg.to]) >= BUMP) return false;
  if (leg.dir === 1) return (points[leg.to].t - points[leg.from].t) / 1000 < BUMP_CLIMB;
  // Вниз между двумя подъёмами. Перед настоящим спуском с подъёмника сходят, и скорость
  // заметно меняется; на провале линии она остаётся прежней.
  let lo = leg.from;
  let hi = leg.to;
  while (lo > 0 && points[leg.from].t - points[lo - 1].t <= 10000) lo--;
  while (hi < points.length - 1 && points[hi + 1].t - points[leg.to].t <= 10000) hi++;
  let min = Infinity;
  let max = 0;
  for (let i = lo; i <= hi; i++) {
    if (speed[i] < min) min = speed[i];
    if (speed[i] > max) max = speed[i];
  }
  return min > TRIM_SPEED && max - min < STEADY_SPREAD;
}

/** Вливает неровности в соседние участки, чтобы они не дробили спуски и подъёмы. */
function mergeBumps(points: TrackPoint[], alt: number[], speed: number[], legs: Leg[]): Leg[] {
  const out: Leg[] = [];
  for (const leg of legs) {
    out.push({ ...leg });
    while (out.length >= 3 && isBump(points, alt, speed, out[out.length - 2])) {
      const last = out[out.length - 1];
      const first = out[out.length - 3];
      out.splice(out.length - 3, 3, { dir: first.dir, from: first.from, to: last.to, open: last.open });
    }
  }
  // Запись ещё идёт, и последний участок пока похож на неровность: считаем, что прежний не закончился.
  // Иначе спуск «завершался» бы на каждом контруклоне.
  if (out.length >= 2 && out[out.length - 1].open && isBump(points, alt, speed, out[out.length - 1])) {
    out.pop();
    out[out.length - 1].open = true;
  }
  return out;
}

/** Точка, отстоящая по времени от i на ms назад (ms < 0) или вперёд, в пределах трека. */
function at(points: TrackPoint[], i: number, ms: number): number {
  let j = i;
  if (ms < 0) while (j > 0 && points[i].t - points[j - 1].t <= -ms) j--;
  else while (j < points.length - 1 && points[j + 1].t - points[i].t <= ms) j++;
  return j;
}

/**
 * Провал на линии подъёмника: до и после него человек ровно едет вверх с той же скоростью.
 * Настоящий пологий спуск после подъёмника так не выглядит — с кресла сходят, и скорость меняется.
 */
function isLiftDip(points: TrackPoint[], alt: number[], speed: number[], from: number, to: number): boolean {
  const before = at(points, from, -15000);
  const after = at(points, to, 15000);
  if (alt[from] - alt[before] < 3 || alt[after] - alt[to] < 3) return false;
  let min = Infinity;
  let max = 0;
  for (let i = before; i <= after; i++) {
    if (speed[i] < min) min = speed[i];
    if (speed[i] > max) max = speed[i];
  }
  return min > TRIM_SPEED && max - min < STEADY_SPREAD;
}

/**
 * Пологие спуски внутри отрезка [from, to], которые зигзаг по высоте не замечает: перепад
 * меньше REVERSAL, но едут быстро. Возвращает пары [верх, низ].
 */
function findGlides(points: TrackPoint[], alt: number[], speed: number[], from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  let i = from;
  while (i <= to) {
    if (speed[i] < GLIDE_SPEED) {
      i++;
      continue;
    }
    let end = i;
    while (end + 1 <= to && speed[end + 1] >= GLIDE_SPEED) end++;
    // Внутри быстрого отрезка может быть и конец подъёмника, и выкат: спуск — от самой
    // высокой точки до самой низкой после неё
    let s = i;
    while (s < end) {
      let top = s;
      for (let k = s; k <= end; k++) if (alt[k] > alt[top]) top = k;
      let low = top;
      for (let k = top; k <= end; k++) if (alt[k] < alt[low]) low = k;
      if (low <= top) break;
      let flat = 0;
      for (let k = top + 1; k <= low; k++) {
        flat += haversine(points[k - 1].lat, points[k - 1].lon, points[k].lat, points[k].lon);
      }
      const seconds = (points[low].t - points[top].t) / 1000;
      if (
        alt[top] - alt[low] >= MIN_GLIDE_VERTICAL &&
        seconds >= MIN_GLIDE_DURATION &&
        flat >= MIN_GLIDE_DISTANCE &&
        !isLiftDip(points, alt, speed, top, low)
      ) {
        out.push([top, low]);
      }
      s = low + 1;
    }
    i = end + 1;
  }
  return out;
}

/**
 * Дополняет участки зигзага пологими спусками: продлевает спуски на быстрые выкаты в начале
 * и в конце, а пологие спуски между подъёмами добавляет как отдельные.
 */
function addGlides(points: TrackPoint[], alt: number[], speed: number[], legs: Leg[]): Leg[] {
  const n = points.length;
  // Продлеваем спуски: на ровном выкате высота почти не меняется, поэтому зигзаг его отрезал
  for (let k = 0; k < legs.length; k++) {
    const leg = legs[k];
    if (leg.dir !== -1) continue;
    const prev = legs[k - 1];
    const next = legs[k + 1];
    const minFrom = prev ? prev.from + 1 : 0;
    const top = alt[leg.from];
    while (leg.from > minFrom && speed[leg.from - 1] >= GLIDE_SPEED && alt[leg.from - 1] >= top - GLIDE_RISE) {
      leg.from--;
    }
    if (prev) prev.to = leg.from;
    const maxTo = next ? next.to - 1 : n - 1;
    const bottom = alt[leg.to];
    while (leg.to < maxTo && speed[leg.to + 1] >= GLIDE_SPEED && alt[leg.to + 1] <= bottom + GLIDE_RISE) leg.to++;
    if (next) next.from = leg.to;
  }

  // Пологие спуски там, где зигзаг спуска не нашёл: на подъёмах и вне участков
  const out: Leg[] = [];
  const glideLegs = (from: number, to: number, open: boolean): Leg[] =>
    findGlides(points, alt, speed, from, to).map(([a, b]) => ({ dir: -1, from: a, to: b, open: open && b >= n - 2 }));
  let covered = 0;
  for (const leg of legs) {
    if (leg.from > covered) out.push(...glideLegs(covered, leg.from, false));
    if (leg.dir === -1) {
      out.push(leg);
    } else {
      // Подъём делится пологими спусками на части
      let start = leg.from;
      for (const g of glideLegs(leg.from, leg.to, leg.open)) {
        if (g.from > start) out.push({ dir: 1, from: start, to: g.from, open: false });
        out.push(g);
        start = g.to;
      }
      if (leg.to > start) out.push({ dir: 1, from: start, to: leg.to, open: leg.open });
    }
    covered = Math.max(covered, leg.to);
  }
  if (covered < n - 1) out.push(...glideLegs(covered, n - 1, true));
  return out;
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
  const first = from;
  const last = to;
  while (from < to && speed[from] < TRIM_SPEED) from++;
  while (to > from && speed[to] < TRIM_SPEED) to--;
  if (to - from < 2) return null;

  // Сглаживание «размазывает» высоту: в первой точке движения она уже учитывает ближайшие
  // секунды пути. Поэтому высоту начала и конца берём на ширину сглаживания раньше и позже,
  // не выходя за границы участка. Без этого короткий спуск терял бы половину перепада.
  let top = from;
  while (top > first && points[from].t - points[top - 1].t <= ALT_SMOOTH) top--;
  let bottom = to;
  while (bottom < last && points[bottom + 1].t - points[to].t <= ALT_SMOOTH) bottom++;

  let distance = 0;
  let flatDistance = 0;
  let movingTime = 0;
  let maxSpeed = 0;
  // Пройденное по горизонтали от начала участка — для расчёта уклона
  const flatAt = new Array<number>(to - from + 1).fill(0);
  for (let i = from + 1; i <= to; i++) {
    const a = points[i - 1];
    const b = points[i];
    flatAt[i - from] = flatDistance;
    if (speedFast[i] > maxSpeed) maxSpeed = speedFast[i];
    if (speed[i] < MOVING_SPEED) continue;
    // Через разрыв записи (пауза, потеря сигнала) расстояние не достраиваем
    if (b.t - a.t > MAX_GAP * 1000) continue;
    const flat = haversine(a.lat, a.lon, b.lat, b.lon);
    const dAlt = alt[i] - alt[i - 1];
    distance += Math.sqrt(flat * flat + dAlt * dAlt);
    flatDistance += flat;
    flatAt[i - from] = flatDistance;
    movingTime += (b.t - a.t) / 1000;
  }

  // Максимальный уклон — на самом крутом отрезке длиной не меньше SLOPE_WINDOW
  let maxSlope = 0;
  let lo = from;
  for (let hi = from + 1; hi <= to; hi++) {
    while (lo + 1 < hi && flatAt[hi - from] - flatAt[lo + 1 - from] >= SLOPE_WINDOW) lo++;
    const run = flatAt[hi - from] - flatAt[lo - from];
    if (run < SLOPE_WINDOW) continue;
    const slope = Math.atan2(Math.abs(alt[lo] - alt[hi]), run) / RAD;
    if (slope > maxSlope) maxSlope = slope;
  }

  // Минимальная скорость — без разгона в начале и торможения в конце
  const edge = Math.floor((to - from) * 0.1);
  let minSpeed = Infinity;
  for (let i = from + edge; i <= to - edge; i++) {
    if (speed[i] < minSpeed) minSpeed = speed[i];
  }
  if (!isFinite(minSpeed)) minSpeed = 0;

  const duration = (points[to].t - points[from].t) / 1000;
  const vertical = Math.abs(alt[top] - alt[bottom]);

  if (kind === 'run') {
    if (distance < MIN_RUN_DISTANCE || duration < MIN_RUN_DURATION) return null;
    const steep = vertical >= MIN_RUN_VERTICAL && maxSpeed >= MIN_RUN_TOP_SPEED;
    const glide = vertical >= MIN_GLIDE_VERTICAL && maxSpeed >= GLIDE_SPEED;
    if (!steep && !glide) return null;
  } else if (vertical < MIN_LIFT_VERTICAL || duration < MIN_LIFT_DURATION) {
    return null;
  }

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
    startAlt: alt[top],
    endAlt: alt[bottom],
    avgSpeed: movingTime > 0 ? distance / movingTime : 0,
    maxSpeed,
    minSpeed,
    avgSlope: flatDistance > 0 ? Math.atan2(vertical, flatDistance) / RAD : 0,
    maxSlope,
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

  const clean = despike(points);
  const alt = smooth(
    points,
    points.map((p) => p.alt),
    ALT_SMOOTH
  );
  const speed = smooth(points, clean, 2500);
  const speedFast = smooth(points, clean, 1000);

  const legs = addGlides(points, alt, speed, mergeBumps(points, alt, speed, findLegs(alt)));
  // Последний участок всегда незавершённый: его направление — то, что происходит сейчас
  const current = legs[legs.length - 1];
  const dir = current ? current.dir : 0;
  const extreme = current ? current.to : 0;
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
  let longestRun = 0;
  let biggestRunVertical = 0;
  for (const s of segments) {
    if (s.kind === 'run') {
      if (s.distance > longestRun) longestRun = s.distance;
      if (s.vertical > biggestRunVertical) biggestRunVertical = s.vertical;
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
  const lastSeg = segments[segments.length - 1];
  if (speed[n - 1] < 1) state = 'pause';
  // Едем пологим спуском, который зигзаг ещё не видит
  else if (lastSeg?.kind === 'run' && lastSeg.open && lastSeg.to >= n - 3) state = 'run';
  else if (dir === -1 && alt[n - 1] - alt[extreme] < BUMP / 2) state = 'run';
  else if (dir === 1 && alt[extreme] - alt[n - 1] < BUMP / 2) state = 'lift';

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
      longestRun,
      biggestRunVertical,
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
