// Сводка, которую участник показывает группе: итоги дня, рекорды, заряд, достижения.
// Разбор присланной сводки без зависимостей от телефона — проверяется тестами (tests/summary.test.mjs).
// Расширение .ts — чтобы этот файл можно было подключить в тестах прямо в Node
import { readLevels, type AchievementLevels } from '../achievements.ts';

/** Итоги дня для карточки друга. */
export type FriendDay = {
  /** День, к которому относятся итоги: 2026-11-12 */
  date: string;
  runs: number;
  /** м */
  vertical: number;
  /** м */
  distance: number;
  /** м/с */
  maxSpeed: number;
  /** Время на спусках, с */
  runTime: number;
  /** Самый длинный спуск, м */
  longest: number;
};

/** Личные рекорды для карточки друга. */
export type FriendRecords = {
  /** м/с */
  maxSpeed: number;
  /** м */
  longestRun: number;
  /** Наибольший перепад одного спуска, м */
  biggestRunVertical: number;
  /** Наибольший перепад за день, м */
  dayVertical: number;
};

/** Сводка, которую человек показывает группе: итоги дня, рекорды, заряд. */
export type FriendInfo = {
  /** Заряд телефона, %; null — неизвестен */
  bat: number | null;
  /** Телефон заряжается */
  chg: boolean;
  day: FriendDay | null;
  rec: FriendRecords | null;
  /** Сколько ступеней каждой категории достижений получено; нет у версий до 1.0.4 */
  ach: AchievementLevels | null;
};

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

/** Разбирает сводку друга; всё лишнее и неверное отбрасывается. */
export function readInfo(raw: Partial<FriendInfo> | null): FriendInfo | null {
  if (!raw) return null;
  const day = raw.day && typeof raw.day.date === 'string' ? raw.day : null;
  const rec = raw.rec ?? null;
  return {
    bat: typeof raw.bat === 'number' ? Math.max(0, Math.min(100, Math.round(raw.bat))) : null,
    chg: raw.chg === true,
    day: day
      ? {
          date: day.date,
          runs: num(day.runs),
          vertical: num(day.vertical),
          distance: num(day.distance),
          maxSpeed: num(day.maxSpeed),
          runTime: num(day.runTime),
          longest: num(day.longest),
        }
      : null,
    rec: rec
      ? {
          maxSpeed: num(rec.maxSpeed),
          longestRun: num(rec.longestRun),
          biggestRunVertical: num(rec.biggestRunVertical),
          dayVertical: num(rec.dayVertical),
        }
      : null,
    ach: readLevels(raw.ach),
  };
}
