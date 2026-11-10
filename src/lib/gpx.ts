import { File, Paths } from 'expo-file-system';

import { dateIso } from './format';
import type { Segment, TrackPoint } from './types';

function trkseg(points: TrackPoint[]): string {
  const rows = points.map(
    (p) =>
      `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${p.alt.toFixed(1)}</ele><time>${new Date(
        p.t
      ).toISOString()}</time></trkpt>`
  );
  return `<trkseg>\n${rows.join('\n')}\n</trkseg>`;
}

/** Собирает GPX: весь день одним треком и каждый спуск отдельным. */
export function buildGpx(points: TrackPoint[], segments: Segment[], startedAt: number): string {
  const runs = segments
    .filter((s) => s.kind === 'run')
    .map((s) => `<trk><name>Спуск ${s.n}</name>\n${trkseg(points.slice(s.from, s.to + 1))}\n</trk>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Snowwy" xmlns="http://www.topografix.com/GPX/1/1">',
    `<metadata><time>${new Date(startedAt).toISOString()}</time></metadata>`,
    `<trk><name>Катание ${dateIso(startedAt)}</name>\n${trkseg(points)}\n</trk>`,
    ...runs,
    '</gpx>',
  ].join('\n');
}

/** Записывает GPX во временный файл и возвращает его адрес. */
export async function writeGpx(points: TrackPoint[], segments: Segment[], startedAt: number): Promise<string> {
  const file = new File(Paths.cache, `snowwy-${dateIso(startedAt)}.gpx`);
  if (file.exists) file.delete();
  file.create();
  await file.write(buildGpx(points, segments, startedAt));
  return file.uri;
}
