// Достижения: пороги по пяти категориям, подписи и подсчёт, какие из них получены.
// Здесь нет ничего, что зависит от телефона, — всё проверяется тестами (tests/achievements.test.mjs).
// Чтение записей и разбор старых дней — в achievement-days.ts. Рисунок значков — components/achievement-badge.tsx.
import type { Totals } from './types';

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
  /** Лучший результат в этой категории за все дни (км/ч или м) */
  best: number;
};

/** Лучшие показатели одного дня катания — по ним проверяются достижения. */
export type DayBest = {
  /** км/ч */
  maxSpeed: number;
  /** Лучшая средняя скорость одного спуска длиной от AVG_MIN_RUN, км/ч */
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

const num = (v: number, digits: number) => v.toFixed(digits).replace('.', ',');
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

/** Показатель категории словами: «74,2 км/ч», «830 м», «12,4 км». */
export function formatValue(category: AchievementCategory, value: number): string {
  if (category === 'speed' || category === 'avg') return `${num(value, value >= 100 ? 0 : 1)} км/ч`;
  if (category === 'vertical' || value < 1000) return `${Math.round(value)} м`;
  return `${num(value / 1000, 1)} км`;
}

/** Доля пути к ступени: 0…1. */
export function progressOf(a: Pick<Achievement, 'best' | 'value' | 'earnedAt'>): number {
  if (a.earnedAt != null) return 1;
  return Math.max(0, Math.min(0.99, a.best / a.value));
}

/** Сколько осталось до неполученной ступени — для подсказки по нажатию на значок. */
export function progressText(a: Achievement): string {
  const c = a.category.id;
  if (a.earnedAt != null) return '';
  if (a.best <= 0) {
    return c === 'avg'
      ? `Пока нет спусков длиной от ${AVG_MIN_RUN} м — средняя скорость считается по ним.`
      : 'Пока нет ни одного дня катания.';
  }
  const label = c === 'day' ? 'Лучший день' : 'Лучший результат';
  const left = formatValue(c, a.value - a.best);
  return `${label} — ${formatValue(c, a.best)}. Осталось ${left} (${Math.round(progressOf(a) * 100)}% пути).`;
}

/** Лучшие показатели прямо из итогов дня, если там есть всё нужное (записи с 1.0.4). */
export function dayBestFromTotals(t: Totals): DayBest | null {
  if (t.bestRunAvgSpeed == null || t.longestRun == null || t.biggestRunVertical == null) return null;
  return {
    maxSpeed: t.maxSpeed * 3.6,
    bestAvg: t.bestRunAvgSpeed * 3.6,
    longest: t.longestRun,
    vertical: t.biggestRunVertical,
    distance: t.distance,
  };
}

export const valueOf = (best: DayBest, c: AchievementCategory): number =>
  c === 'speed' ? best.maxSpeed : c === 'avg' ? best.bestAvg : c === 'length' ? best.longest : c === 'vertical' ? best.vertical : best.distance;

/** Все достижения по лучшим показателям дней: полученные — с первым днём, когда это случилось. */
export function achievementsFromDays(days: { id: number; startedAt: number; best: DayBest }[]): Achievement[] {
  const byDate = [...days].sort((a, b) => a.startedAt - b.startedAt);
  const out: Achievement[] = [];
  for (const category of CATEGORIES) {
    const best = byDate.reduce((m, d) => Math.max(m, valueOf(d.best, category.id)), 0);
    category.levels.forEach((value, index) => {
      const first = byDate.find((d) => valueOf(d.best, category.id) >= value);
      out.push({ category, index, value, earnedAt: first?.startedAt ?? null, sessionId: first?.id ?? null, best });
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

/** Уровни, присланные другом: числа вне диапазона и незнакомые категории отбрасываются. */
export function readLevels(raw: unknown): AchievementLevels | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: AchievementLevels = {};
  for (const c of CATEGORIES) {
    const v = (raw as Record<string, unknown>)[c.id];
    if (typeof v === 'number' && isFinite(v)) out[c.id] = Math.max(0, Math.min(c.levels.length, Math.round(v)));
  }
  return out;
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
