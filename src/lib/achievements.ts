// Достижения: пороги по пяти категориям и подсчёт, какие из них уже получены.
// Рисунок значков — src/components/achievement-badge.tsx (тот же, что в design/achievements).
import Storage from 'expo-sqlite/kv-store';

import { analyze } from './analyze';
import { getPoints } from './db';
import type { Session, Totals } from './types';

export type AchievementCategory = 'speed' | 'avg' | 'length' | 'vertical' | 'day';

export type CategoryInfo = {
  id: AchievementCategory;
  title: string;
  short: string;
  /** Пороги в км/ч (скорости) или метрах */
  levels: number[];
};

export const CATEGORIES: CategoryInfo[] = [
  { id: 'speed', title: 'Максимальная скорость', short: 'Скорость', levels: [40, 60, 80, 100, 120, 140] },
  { id: 'avg', title: 'Средняя скорость за спуск', short: 'Средняя', levels: [20, 30, 40, 50, 60, 70, 100] },
  { id: 'length', title: 'Длина спуска', short: 'Длина', levels: [500, 1000, 2000, 3000, 4000, 5000, 6000] },
  {
    id: 'vertical',
    title: 'Перепад за спуск',
    short: 'Перепад',
    levels: [50, 100, 200, 400, 600, 800, 1000, 1500, 2000, 3000, 4000],
  },
  {
    id: 'day',
    title: 'Расстояние за день',
    short: 'За день',
    levels: [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 50000, 60000, 70000, 80000, 90000, 100000],
  },
];

export const TOTAL_ACHIEVEMENTS = CATEGORIES.reduce((n, c) => n + c.levels.length, 0);

/** Сколько ступеней каждой категории получено: { speed: 2, day: 5, … } */
export type AchievementLevels = Partial<Record<AchievementCategory, number>>;

export type Achievement = {
  category: CategoryInfo;
  /** Номер ступени, с нуля */
  index: number;
  value: number;
  /** Когда получено, мс; null — ещё нет */
  earnedAt: number | null;
  sessionId: number | null;
};

const km = (m: number) => `${m / 1000}`.replace('.', ',');

/** Число и единица на значке: «60 км/ч», «500 м», «2 км», «1 500 м». */
export function badgeText(category: AchievementCategory, value: number): { value: string; unit: string } {
  if (category === 'speed' || category === 'avg') return { value: `${value}`, unit: 'км/ч' };
  if (category === 'vertical') return { value: value >= 1000 ? `${value}`.replace(/(\d)(\d{3})$/, '$1 $2') : `${value}`, unit: 'м' };
  if (category === 'length' && value < 1000) return { value: `${value}`, unit: 'м' };
  return { value: km(value), unit: 'км' };
}

/** Что нужно сделать: «Разогнаться до 60 км/ч». */
export function achievementTitle(category: AchievementCategory, value: number): string {
  const { value: v, unit } = badgeText(category, value);
  switch (category) {
    case 'speed':
      return `Разогнаться до ${v} ${unit}`;
    case 'avg':
      return `Спуск со средней скоростью от ${v} ${unit}`;
    case 'length':
      return `Спуск длиной от ${v} ${unit}`;
    case 'vertical':
      return `Спуск с перепадом от ${v} ${unit}`;
    default:
      return `Проехать за день ${v} ${unit}`;
  }
}

/** Лучшие показатели одного дня катания — по ним проверяются достижения. */
export type DayBest = {
  /** км/ч */
  maxSpeed: number;
  /** Лучшая средняя скорость одного спуска, км/ч */
  bestAvg: number;
  /** Самый длинный спуск, м */
  longest: number;
  /** Наибольший перепад одного спуска, м */
  vertical: number;
  /** Расстояние на спусках за день, м */
  distance: number;
};

/** Средняя скорость короткого съезда — случайность: такие спуски в зачёт средней не идут, м */
export const AVG_MIN_RUN = 300;

/** Лучшие показатели прямо из итогов дня, если там есть всё нужное. */
function fromTotals(t: Totals): DayBest | null {
  if (t.bestRunAvgSpeed == null || t.longestRun == null || t.biggestRunVertical == null) return null;
  return {
    maxSpeed: t.maxSpeed * 3.6,
    bestAvg: t.bestRunAvgSpeed * 3.6,
    longest: t.longestRun,
    vertical: t.biggestRunVertical,
    distance: t.distance,
  };
}

const CACHE = (id: number) => `ach.day.${id}`;

/**
 * Лучшие показатели дня. У старых записей в итогах нет средней скорости спусков —
 * тогда день один раз разбирается заново по точкам, результат запоминается.
 * quick — не разбирать заново, взять что есть (для сводки друзьям в фоне).
 */
export async function dayBest(s: Session, quick = false): Promise<DayBest | null> {
  if (!s.totals) return null;
  const direct = fromTotals(s.totals);
  if (direct) return direct;
  try {
    const cached = Storage.getItemSync(CACHE(s.id));
    if (cached) return JSON.parse(cached) as DayBest;
  } catch {
    // кэша нет — посчитаем
  }
  const partial: DayBest = {
    maxSpeed: s.totals.maxSpeed * 3.6,
    bestAvg: 0,
    longest: s.totals.longestRun ?? 0,
    vertical: s.totals.biggestRunVertical ?? 0,
    distance: s.totals.distance,
  };
  if (quick) return partial;
  try {
    const { totals } = analyze(await getPoints(s.id));
    const best: DayBest = {
      maxSpeed: partial.maxSpeed,
      bestAvg: (totals.bestRunAvgSpeed ?? 0) * 3.6,
      longest: Math.max(partial.longest, totals.longestRun ?? 0),
      vertical: Math.max(partial.vertical, totals.biggestRunVertical ?? 0),
      distance: partial.distance,
    };
    Storage.setItem(CACHE(s.id), JSON.stringify(best)).catch(() => {});
    return best;
  } catch {
    return partial;
  }
}

const valueOf = (best: DayBest, c: AchievementCategory): number =>
  c === 'speed' ? best.maxSpeed : c === 'avg' ? best.bestAvg : c === 'length' ? best.longest : c === 'vertical' ? best.vertical : best.distance;

/** Все достижения: полученные — с датой первого раза, остальные — пустые. */
export async function computeAchievements(sessions: Session[], quick = false): Promise<Achievement[]> {
  const byDate = [...sessions].filter((s) => s.totals).sort((a, b) => a.startedAt - b.startedAt);
  const days: { s: Session; best: DayBest }[] = [];
  for (const s of byDate) {
    const best = await dayBest(s, quick);
    if (best) days.push({ s, best });
  }
  const out: Achievement[] = [];
  for (const category of CATEGORIES) {
    category.levels.forEach((value, index) => {
      const first = days.find((d) => valueOf(d.best, category.id) >= value);
      out.push({ category, index, value, earnedAt: first?.s.startedAt ?? null, sessionId: first?.s.id ?? null });
    });
  }
  return out;
}

/** Сколько ступеней каждой категории получено — компактно, для карточки у друзей. */
export function levelsOf(list: Achievement[]): AchievementLevels {
  const levels: AchievementLevels = {};
  for (const a of list) {
    if (a.earnedAt != null) levels[a.category.id] = Math.max(levels[a.category.id] ?? 0, a.index + 1);
  }
  return levels;
}

/** Полученные значки по уровням друга: самые старшие в каждой категории идут первыми. */
export function earnedFromLevels(levels: AchievementLevels): { category: CategoryInfo; index: number; value: number }[] {
  const out: { category: CategoryInfo; index: number; value: number }[] = [];
  for (const category of CATEGORIES) {
    const n = Math.min(category.levels.length, Math.max(0, Math.round(levels[category.id] ?? 0)));
    for (let i = n - 1; i >= 0; i--) out.push({ category, index: i, value: category.levels[i] });
  }
  return out;
}
