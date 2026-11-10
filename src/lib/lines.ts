import { SPEED_COLORS, type Theme } from '@/theme';

import { thin } from './analyze';
import type { Segment, TrackPoint } from './types';

export type Coord = { latitude: number; longitude: number };

/** Линия для отрисовки на карте. */
export type MapLine = {
  id: string;
  coords: Coord[];
  color: string;
  width: number;
  dashed?: boolean;
};

const toCoord = (p: TrackPoint): Coord => ({ latitude: p.lat, longitude: p.lon });

/** Линии дня катания: спуски сплошной линией, подъёмы пунктиром. */
export function sessionLines(points: TrackPoint[], segments: Segment[], theme: Theme): MapLine[] {
  return segments.map((s) => ({
    id: `${s.kind}-${s.n}`,
    coords: thin(points.slice(s.from, s.to + 1), s.kind === 'run' ? 250 : 40).map(toCoord),
    color: s.kind === 'run' ? theme.text : theme.sub,
    width: s.kind === 'run' ? 3 : 2,
    dashed: s.kind === 'lift',
  }));
}

/** Один спуск, раскрашенный по скорости: от синего (медленно) к красному (быстро). */
export function speedLines(points: TrackPoint[], speed: number[], segment: Segment): MapLine[] {
  const idx = thin(
    Array.from({ length: segment.to - segment.from + 1 }, (_, i) => segment.from + i),
    500
  );
  const max = Math.max(segment.maxSpeed, 1);
  const bucket = (i: number) => Math.min(SPEED_COLORS.length - 1, Math.floor((speed[i] / max) * SPEED_COLORS.length));

  const lines: MapLine[] = [];
  let current = bucket(idx[0]);
  let coords: Coord[] = [toCoord(points[idx[0]])];
  for (let k = 1; k < idx.length; k++) {
    const b = bucket(idx[k]);
    const c = toCoord(points[idx[k]]);
    coords.push(c);
    if (b !== current) {
      lines.push({ id: `s-${lines.length}`, coords, color: SPEED_COLORS[current], width: 4 });
      coords = [c];
      current = b;
    }
  }
  if (coords.length > 1) lines.push({ id: `s-${lines.length}`, coords, color: SPEED_COLORS[current], width: 4 });
  return lines;
}

/** Переводит трек в координаты прямоугольника width × height, сохраняя пропорции. */
export function project(
  tracks: TrackPoint[][],
  width: number,
  height: number,
  padding = 8
): { x: number; y: number }[][] {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const track of tracks) {
    for (const p of track) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
  }
  if (!isFinite(minLat)) return [];
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const w = Math.max((maxLon - minLon) * cos, 1e-6);
  const h = Math.max(maxLat - minLat, 1e-6);
  const scale = Math.min((width - padding * 2) / w, (height - padding * 2) / h);
  const ox = (width - w * scale) / 2;
  const oy = (height - h * scale) / 2;
  return tracks.map((track) =>
    track.map((p) => ({
      x: ox + (p.lon - minLon) * cos * scale,
      y: oy + (maxLat - p.lat) * scale,
    }))
  );
}
