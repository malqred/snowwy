// Названия трасс: по каким трассам проехали спуски.
// Данные — карта OpenStreetMap, запрос через открытый сервис Overpass. Нужен интернет.

import type { RunPiste, Segment, TrackPoint } from './types';

/** Участок трассы с карты. У одной трассы таких участков обычно несколько. */
export type PisteWay = {
  name: string;
  difficulty: string;
  /** Точки линии: [широта, долгота] */
  coords: [number, number][];
};

/** Дальше этого от линии трассы точка спуска к ней не относится, м */
const NEAR = 40;
/** Какая доля спуска должна лечь на трассу, чтобы назвать его её именем */
const MIN_SHARE = 0.35;
/** Сколько точек спуска проверять */
const SAMPLES = 60;
const TIMEOUT = 15000;

// Несколько адресов одного и того же сервиса: какой-то из них может быть недоступен
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const RAD = Math.PI / 180;
const M_PER_DEG = 111320;

/** Расстояние от точки до отрезка, м (на таких расстояниях Землю считаем плоской). */
function toSegment(lat: number, lon: number, a: [number, number], b: [number, number], cos: number): number {
  const px = (lon - a[1]) * M_PER_DEG * cos;
  const py = (lat - a[0]) * M_PER_DEG;
  const bx = (b[1] - a[1]) * M_PER_DEG * cos;
  const by = (b[0] - a[0]) * M_PER_DEG;
  const len = bx * bx + by * by;
  const k = len > 0 ? Math.min(1, Math.max(0, (px * bx + py * by) / len)) : 0;
  const dx = px - bx * k;
  const dy = py - by * k;
  return Math.sqrt(dx * dx + dy * dy);
}

function toWay(lat: number, lon: number, way: PisteWay, cos: number): number {
  let best = Infinity;
  for (let i = 1; i < way.coords.length; i++) {
    const d = toSegment(lat, lon, way.coords[i - 1], way.coords[i], cos);
    if (d < best) best = d;
  }
  return best;
}

/** Определяет, по какой трассе в основном прошёл спуск. null — ни одна не подошла. */
export function matchRun(points: TrackPoint[], ways: PisteWay[]): { name: string; difficulty: string } | null {
  if (points.length < 2 || ways.length === 0) return null;
  const cos = Math.cos(points[0].lat * RAD);
  const step = Math.max(1, Math.floor(points.length / SAMPLES));
  const votes = new Map<string, { count: number; difficulty: Map<string, number> }>();
  let total = 0;
  for (let i = 0; i < points.length; i += step) {
    total++;
    const p = points[i];
    let best: PisteWay | null = null;
    let bestDistance = NEAR;
    for (const way of ways) {
      const d = toWay(p.lat, p.lon, way, cos);
      if (d < bestDistance) {
        bestDistance = d;
        best = way;
      }
    }
    if (!best) continue;
    const vote = votes.get(best.name) ?? { count: 0, difficulty: new Map<string, number>() };
    vote.count++;
    vote.difficulty.set(best.difficulty, (vote.difficulty.get(best.difficulty) ?? 0) + 1);
    votes.set(best.name, vote);
  }
  let winner: string | null = null;
  let max = 0;
  for (const [name, vote] of votes) {
    if (vote.count > max) {
      max = vote.count;
      winner = name;
    }
  }
  if (winner == null || max / total < MIN_SHARE) return null;
  let difficulty = '';
  let top = 0;
  for (const [key, count] of votes.get(winner)!.difficulty) {
    if (count > top) {
      top = count;
      difficulty = key;
    }
  }
  return { name: winner, difficulty };
}

/** Для каждого спуска находит трассу. Спуски без трассы в результат не попадают. */
export function matchRuns(points: TrackPoint[], runs: Segment[], ways: PisteWay[]): RunPiste[] {
  const out: RunPiste[] = [];
  for (const run of runs) {
    const found = matchRun(points.slice(run.from, run.to + 1), ways);
    if (!found) continue;
    out.push({
      t: run.startedAt,
      name: found.name,
      difficulty: found.difficulty,
      duration: run.duration,
      distance: run.distance,
      vertical: run.vertical,
      maxSpeed: run.maxSpeed,
      avgSpeed: run.avgSpeed,
    });
  }
  return out;
}

type OverpassWay = {
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

/** Превращает ответ сервиса в список участков трасс. Безымянные участки пропускаются. */
export function parseWays(json: unknown): PisteWay[] {
  const elements = (json as { elements?: OverpassWay[] })?.elements;
  if (!Array.isArray(elements)) return [];
  const ways: PisteWay[] = [];
  for (const e of elements) {
    const tags = e.tags ?? {};
    const name = tags.name ?? tags['piste:name'] ?? tags.ref ?? tags['piste:ref'];
    if (!name || !Array.isArray(e.geometry) || e.geometry.length < 2) continue;
    ways.push({
      name,
      difficulty: tags['piste:difficulty'] ?? '',
      coords: e.geometry.map((g) => [g.lat, g.lon]),
    });
  }
  return ways;
}

/** Загружает трассы в прямоугольнике вокруг трека. null — не удалось (нет интернета). */
export async function fetchWays(points: TrackPoint[]): Promise<PisteWay[] | null> {
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const p of points) {
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lon < west) west = p.lon;
    if (p.lon > east) east = p.lon;
  }
  if (!isFinite(south)) return null;
  const pad = 0.002; // около 200 м
  const box = [south - pad, west - pad, north + pad, east + pad].map((v) => v.toFixed(4)).join(',');
  const body = `data=${encodeURIComponent(`[out:json][timeout:12];way["piste:type"="downhill"](${box});out tags geom;`)}`;

  for (const server of SERVERS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await fetch(server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Snowwy/1.0 (ski tracker)' },
        body,
        signal: controller.signal,
      });
      if (res.ok) return parseWays(await res.json());
    } catch {
      // пробуем следующий адрес
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

const DIFFICULTY: Record<string, { title: string; color: string }> = {
  novice: { title: 'зелёная', color: '#3FA672' },
  easy: { title: 'синяя', color: '#3D7FC2' },
  intermediate: { title: 'красная', color: '#CC3A2E' },
  advanced: { title: 'чёрная', color: '#1B1B1F' },
  expert: { title: 'чёрная', color: '#1B1B1F' },
  freeride: { title: 'фрирайд', color: '#DDB23C' },
  extreme: { title: 'фрирайд', color: '#DDB23C' },
};

/** Цвет и название сложности трассы, как на схемах курортов. */
export function difficultyInfo(difficulty: string): { title: string; color: string } {
  return DIFFICULTY[difficulty] ?? { title: 'трасса', color: '#8E9AA6' };
}

export type FavoritePiste = {
  name: string;
  difficulty: string;
  /** Сколько раз проехали */
  count: number;
  /** Лучшее время, с */
  best: number;
  /** Средняя скорость по всем проездам, м/с, и лучшая максимальная */
  avgSpeed: number;
  maxSpeed: number;
};

/** Трассы, по которым ездили чаще всего. */
export function favoritePistes(all: RunPiste[][], limit = 5): FavoritePiste[] {
  const byName = new Map<string, FavoritePiste & { speedSum: number }>();
  for (const runs of all) {
    for (const r of runs) {
      const f = byName.get(r.name) ?? {
        name: r.name,
        difficulty: r.difficulty,
        count: 0,
        best: Infinity,
        avgSpeed: 0,
        maxSpeed: 0,
        speedSum: 0,
      };
      f.count++;
      f.speedSum += r.avgSpeed;
      f.avgSpeed = f.speedSum / f.count;
      if (r.duration < f.best) f.best = r.duration;
      if (r.maxSpeed > f.maxSpeed) f.maxSpeed = r.maxSpeed;
      byName.set(r.name, f);
    }
  }
  return [...byName.values()].sort((a, b) => b.count - a.count || a.best - b.best).slice(0, limit);
}
