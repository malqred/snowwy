import { useEffect, useRef, useState } from 'react';

import type { Coord } from './lines';
import type { Analysis, Segment, TrackPoint } from './types';

/** Сколько секунд длится повтор самого короткого спуска */
const TARGET_SECONDS = 20;
/** Минимальное ускорение повтора */
const MIN_RATE = 4;

export type Replay = {
  playing: boolean;
  /** Повтор начат (идёт или остановлен посередине) */
  active: boolean;
  toggle: () => void;
  /** Доля пройденного пути, 0…1 */
  progress: number;
  /** Сколько секунд спуска пройдено */
  seconds: number;
  /** Во сколько раз повтор быстрее реального времени */
  rate: number;
  coord: Coord;
  /** Скорость, м/с, и высота, м, в текущей точке */
  speed: number;
  alt: number;
};

/** Проигрывает спуск: точка едет по треку быстрее реального времени. */
export function useReplay(points: TrackPoint[], analysis: Analysis, run: Segment): Replay {
  const duration = points[run.to].t - points[run.from].t;
  const rate = Math.max(MIN_RATE, Math.round(duration / 1000 / TARGET_SECONDS));
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let prev: number | null = null;
    const tick = (now: number) => {
      if (prev != null) {
        const next = Math.min(duration, timeRef.current + (now - prev) * rate);
        timeRef.current = next;
        setTime(next);
        if (next >= duration) {
          setPlaying(false);
          return;
        }
      }
      prev = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, rate]);

  const toggle = () => {
    if (!playing && timeRef.current >= duration) {
      timeRef.current = 0;
      setTime(0);
    }
    setPlaying((v) => !v);
  };

  // Находим две соседние точки трека вокруг текущего момента
  const target = points[run.from].t + time;
  let lo = run.from;
  let hi = run.to;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= target) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const k = b.t > a.t ? Math.min(1, Math.max(0, (target - a.t) / (b.t - a.t))) : 0;
  const mix = (x: number, y: number) => x + (y - x) * k;

  return {
    playing,
    active: playing || time > 0,
    toggle,
    progress: duration > 0 ? time / duration : 0,
    seconds: time / 1000,
    rate,
    coord: { latitude: mix(a.lat, b.lat), longitude: mix(a.lon, b.lon) },
    speed: mix(analysis.speed[lo], analysis.speed[hi]),
    alt: mix(analysis.alt[lo], analysis.alt[hi]),
  };
}
