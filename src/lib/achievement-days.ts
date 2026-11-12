// Достижения по записям на телефоне. Старые дни, в итогах которых нет средней скорости
// спусков, один раз разбираются заново по точкам; результат запоминается.
import Storage from 'expo-sqlite/kv-store';

import { achievementsFromDays, dayBestFromTotals, type Achievement, type DayBest } from './achievements';
import { analyze } from './analyze';
import { getPoints } from './db';
import type { Session } from './types';

const CACHE = (id: number) => `ach.day.${id}`;

/**
 * Лучшие показатели дня.
 * quick — не разбирать старый день заново, взять что есть (для сводки друзьям в фоне).
 */
export async function dayBest(s: Session, quick = false): Promise<DayBest | null> {
  if (!s.totals) return null;
  const direct = dayBestFromTotals(s.totals);
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

/** Все достижения по записям: полученные — с датой первого раза, остальные — с лучшим результатом. */
export async function computeAchievements(sessions: Session[], quick = false): Promise<Achievement[]> {
  const days: { id: number; startedAt: number; best: DayBest }[] = [];
  for (const s of sessions) {
    const best = await dayBest(s, quick);
    if (best) days.push({ id: s.id, startedAt: s.startedAt, best });
  }
  return achievementsFromDays(days);
}
