import { distance, int, kmh, num } from './format';
import type { Segment, Session, Totals } from './types';

export type RecordItem = {
  key: string;
  label: string;
  value: string;
  unit: string;
  /** День катания, в который поставлен рекорд */
  sessionId: number;
  startedAt: number;
};

type Metric = {
  key: string;
  label: string;
  pick: (t: Totals) => number;
  show: (v: number) => { value: string; unit: string };
};

const METRICS: Metric[] = [
  { key: 'maxSpeed', label: 'Макс. скорость', pick: (t) => t.maxSpeed, show: (v) => ({ value: kmh(v, 1), unit: 'км/ч' }) },
  { key: 'longestRun', label: 'Самый длинный спуск', pick: (t) => t.longestRun ?? 0, show: distance },
  {
    key: 'biggestRunVertical',
    label: 'Перепад за спуск',
    pick: (t) => t.biggestRunVertical ?? 0,
    show: (v) => ({ value: int(v), unit: 'м' }),
  },
  { key: 'runs', label: 'Спусков за день', pick: (t) => t.runs, show: (v) => ({ value: num(v), unit: '' }) },
  { key: 'distance', label: 'Дистанция за день', pick: (t) => t.distance, show: distance },
  { key: 'vertical', label: 'Перепад за день', pick: (t) => t.vertical, show: (v) => ({ value: int(v), unit: 'м' }) },
];

/** Личные рекорды по всем записям. При равенстве рекорд остаётся за более ранним днём. */
export function findRecords(sessions: Session[]): RecordItem[] {
  const byDate = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const records: RecordItem[] = [];
  for (const m of METRICS) {
    let best: Session | null = null;
    let bestValue = 0;
    for (const s of byDate) {
      if (!s.totals) continue;
      const v = m.pick(s.totals);
      if (v > bestValue) {
        bestValue = v;
        best = s;
      }
    }
    if (best) {
      records.push({ key: m.key, label: m.label, ...m.show(bestValue), sessionId: best.id, startedAt: best.startedAt });
    }
  }
  return records;
}

/** Лучшие спуски дня: номер спуска → подписи («самый быстрый» и т. п.). */
export function runBadges(runs: Segment[]): Record<number, string> {
  if (runs.length < 2) return {};
  const best = (pick: (s: Segment) => number) => runs.reduce((a, b) => (pick(b) > pick(a) ? b : a)).n;
  const labels: [number, string][] = [
    [best((s) => s.maxSpeed), 'самый быстрый'],
    [best((s) => s.distance), 'самый длинный'],
    [best((s) => s.maxSlope), 'самый крутой'],
  ];
  const out: Record<number, string> = {};
  for (const [n, label] of labels) out[n] = out[n] ? `${out[n]}, ${label}` : label;
  return out;
}
