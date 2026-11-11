import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { listSessions } from './db';
import { dateIso, seasonOf } from './format';
import type { Session, Weather } from './types';
import { fetchWeather } from './weather';

export type StartInfo = {
  /** Погода сейчас. null — нет интернета или ещё не разрешена геопозиция */
  weather: Weather | null;
  /** Прошлое катание */
  last: Session | null;
  /** Текущий сезон: дни и спуски. null — в этом сезоне ещё не катались */
  season: { year: number; days: number; runs: number } | null;
};

/** Последнее известное место годится для погоды, если ему не больше этого, мс */
const PLACE_MAX_AGE = 12 * 60 * 60 * 1000;

/** Данные для экрана «Старт»: погода, прошлое катание, счётчик сезона. */
export function useStartInfo(): StartInfo {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listSessions()
        .then((list) => {
          if (active) setSessions(list);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [])
  );

  // Погоду показываем, только если геопозиция уже разрешена: сами доступ здесь не просим
  useEffect(() => {
    let active = true;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) return;
      const place = await Location.getLastKnownPositionAsync({ maxAge: PLACE_MAX_AGE });
      if (!place) return;
      const { latitude, longitude, altitude } = place.coords;
      const result = await fetchWeather(latitude, longitude, altitude ?? 0);
      if (active && result) setWeather(result);
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const last = sessions[0] ?? null;
  const [year] = useState(() => seasonOf(Date.now()));
  const current = sessions.filter((s) => seasonOf(s.startedAt) === year);
  const season =
    current.length > 0
      ? {
          year,
          days: new Set(current.map((s) => dateIso(s.startedAt))).size,
          runs: current.reduce((sum, s) => sum + (s.totals?.runs ?? 0), 0),
        }
      : null;

  return { weather, last, season };
}
