// Своё место для расчёта «где друг относительно меня». Сами расчёты — в geo.ts.
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { Spot } from './geo';
import { useTracker } from './tracker';

export { far, relative, relativeLong, relativeShort, side, type Relative, type Spot } from './geo';

/** Как часто уточнять своё место, когда запись не идёт, мс */
const REFRESH = 30000;

/**
 * Моё место: во время записи — последняя точка, иначе — последнее известное телефону.
 * Разрешение на геопозицию не спрашивает: если его нет, возвращает null.
 */
export function useMySpot(active: boolean): Spot | null {
  const tracker = useTracker();
  const [spot, setSpot] = useState<Spot | null>(null);
  const live = tracker.recording && tracker.last ? tracker.last : null;

  useEffect(() => {
    if (!active || live) return;
    let stopped = false;
    const load = async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return;
        // Только последнее известное место: свежий запрос на Android показывает системный
        // вопрос «включить точную геолокацию» при каждом открытии вкладки
        const loc = await Location.getLastKnownPositionAsync({ maxAge: 15 * 60 * 1000 });
        if (!stopped && loc) setSpot({ lat: loc.coords.latitude, lon: loc.coords.longitude, alt: loc.coords.altitude });
      } catch {
        // места нет — расстояния до друзей просто не покажем
      }
    };
    load();
    const timer = setInterval(load, REFRESH);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, live]);

  return live ? { lat: live.lat, lon: live.lon, alt: live.alt } : spot;
}
