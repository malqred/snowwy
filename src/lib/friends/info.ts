// Сводка для группы: итоги сегодняшнего катания, личные рекорды и заряд телефона.
// Подключается к хранилищу группы при запуске приложения (см. src/app/_layout.tsx).
import * as Battery from 'expo-battery';
import { useEffect, useState } from 'react';

import { computeAchievements } from '../achievement-days';
import { levelsOf, type AchievementLevels } from '../achievements';
import { listSessions } from '../db';
import { getTracker } from '../tracker';
import type { Session, Totals } from '../types';
import { setInfoProvider, type FriendDay, type FriendInfo, type FriendRecords } from './store';

/** День по местному времени: 2026-11-12. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Записи меняются только после катания: список читаем не чаще раза в пять минут. */
const SESSIONS_EVERY = 5 * 60 * 1000;
let sessions: Session[] = [];
let sessionsAt = 0;
let levels: AchievementLevels = {};

async function battery(): Promise<{ bat: number | null; chg: boolean }> {
  try {
    const [level, state] = await Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()]);
    return {
      bat: level >= 0 ? Math.round(level * 100) : null,
      chg: state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL,
    };
  } catch {
    return { bat: null, chg: false };
  }
}

function addDay(day: FriendDay, t: Totals) {
  day.runs += t.runs;
  day.vertical += t.vertical;
  day.distance += t.distance;
  day.runTime += t.runTime;
  day.maxSpeed = Math.max(day.maxSpeed, t.maxSpeed);
  day.longest = Math.max(day.longest, t.longestRun ?? 0);
}

function addRecords(rec: FriendRecords, t: Totals) {
  rec.maxSpeed = Math.max(rec.maxSpeed, t.maxSpeed);
  rec.longestRun = Math.max(rec.longestRun, t.longestRun ?? 0);
  rec.biggestRunVertical = Math.max(rec.biggestRunVertical, t.biggestRunVertical ?? 0);
  rec.dayVertical = Math.max(rec.dayVertical, t.vertical);
}

/** fresh — перечитать записи (после катания или по просьбе отправить свежую сводку). */
export async function buildFriendInfo(fresh = false): Promise<FriendInfo> {
  const now = Date.now();
  if (fresh || now - sessionsAt > SESSIONS_EVERY) {
    try {
      sessions = await listSessions();
      sessionsAt = now;
      // Достижения — только по готовым итогам, без разбора точек: сводка должна собираться быстро
      levels = levelsOf(await computeAchievements(sessions, true));
    } catch {
      // база недоступна — пошлём, что есть
    }
  }
  const today = dayKey(now);
  const tracker = getTracker();
  const day: FriendDay = { date: today, runs: 0, vertical: 0, distance: 0, maxSpeed: 0, runTime: 0, longest: 0 };
  const rec: FriendRecords = { maxSpeed: 0, longestRun: 0, biggestRunVertical: 0, dayVertical: 0 };
  let todayVertical = 0;
  for (const s of sessions) {
    // Текущая запись считается ниже, по живому разбору
    if (!s.totals || s.id === tracker.sessionId) continue;
    addRecords(rec, s.totals);
    if (dayKey(s.startedAt) === today) {
      addDay(day, s.totals);
      todayVertical += s.totals.vertical;
    }
  }
  if (tracker.recording && tracker.startedAt != null) {
    const live = tracker.analysis.totals;
    addDay(day, live);
    todayVertical += live.vertical;
    addRecords(rec, live);
  }
  // Рекорд перепада за день — с учётом всех записей сегодняшнего дня
  rec.dayVertical = Math.max(rec.dayVertical, todayVertical);
  return { ...(await battery()), day: day.runs > 0 || day.runTime > 0 ? day : null, rec, ach: levels };
}

setInfoProvider(buildFriendInfo);

/** Своя сводка для своей карточки: собирается заново при каждом открытии. 'loading' — ещё собирается. */
export function useOwnInfo(active: boolean): FriendInfo | null | 'loading' {
  const [info, setInfo] = useState<FriendInfo | null | 'loading'>('loading');
  useEffect(() => {
    if (!active) return;
    let on = true;
    buildFriendInfo(true)
      .then((next) => on && setInfo(next))
      .catch(() => on && setInfo(null));
    return () => {
      on = false;
      setInfo('loading');
    };
  }, [active]);
  return info;
}
