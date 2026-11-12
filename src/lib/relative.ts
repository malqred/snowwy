// Где человек относительно меня: расстояние, сторона света и разница высот.
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { haversine } from './analyze';
import { useTracker } from './tracker';

export type Spot = { lat: number; lon: number; alt?: number | null };

export type Relative = {
  /** По прямой, м */
  distance: number;
  /** Направление от меня, градусы от севера по часовой */
  bearing: number;
  /** Насколько он выше меня, м; null — высота неизвестна */
  above: number | null;
};

const RAD = Math.PI / 180;

export function relative(me: Spot, other: Spot): Relative {
  const y = Math.sin((other.lon - me.lon) * RAD) * Math.cos(other.lat * RAD);
  const x =
    Math.cos(me.lat * RAD) * Math.sin(other.lat * RAD) -
    Math.sin(me.lat * RAD) * Math.cos(other.lat * RAD) * Math.cos((other.lon - me.lon) * RAD);
  const bearing = ((Math.atan2(y, x) / RAD) + 360) % 360;
  const above = me.alt != null && other.alt != null ? other.alt - me.alt : null;
  return { distance: haversine(me.lat, me.lon, other.lat, other.lon), bearing, above };
}

const SIDES = [
  ['на север', '↑'],
  ['на северо-восток', '↗'],
  ['на восток', '→'],
  ['на юго-восток', '↘'],
  ['на юг', '↓'],
  ['на юго-запад', '↙'],
  ['на запад', '←'],
  ['на северо-запад', '↖'],
] as const;

/** «на северо-восток» и стрелка для направления. */
export function side(bearing: number): { word: string; arrow: string } {
  const [word, arrow] = SIDES[Math.round(bearing / 45) % 8];
  return { word, arrow };
}

/** Расстояние словами: 80 м, 350 м, 1,2 км. */
export function far(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} м`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} км`;
}

/** «350 м ↗ · выше на 120 м» — коротко, для списка. */
export function relativeShort(r: Relative): string {
  if (r.distance < 15) return 'рядом с вами';
  const { arrow } = side(r.bearing);
  const height = r.above == null || Math.abs(r.above) < 10 ? '' : ` · ${r.above > 0 ? 'выше' : 'ниже'} на ${Math.round(Math.abs(r.above))} м`;
  return `${far(r.distance)} ${arrow}${height}`;
}

/** «350 м на северо-восток, выше вас на 120 м» — подробно, для карточки. */
export function relativeLong(r: Relative): string {
  if (r.distance < 15) return 'Рядом с вами';
  const height =
    r.above == null
      ? ''
      : Math.abs(r.above) < 10
        ? ', на той же высоте'
        : `, ${r.above > 0 ? 'выше' : 'ниже'} вас на ${Math.round(Math.abs(r.above))} м`;
  return `${far(r.distance)} ${side(r.bearing).word}${height}`;
}

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
