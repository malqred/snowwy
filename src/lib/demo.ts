import type { TrackPoint } from './types';

/** Простой детерминированный генератор случайных чисел. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const M_PER_DEG = 111320;

/**
 * Генерирует правдоподобный день катания: несколько кругов «подъёмник — спуск»
 * с очередями и остановками. Нужен для проверки приложения без выезда на склон.
 */
export function generateDemoTrack(startedAt: number, laps = 7, seed = 7): TrackPoint[] {
  const rand = rng(seed);
  const points: TrackPoint[] = [];

  // Нижняя станция (Роза Хутор) и направление подъёмника
  const baseLat = 43.6565;
  const baseLon = 40.3115;
  const baseAlt = 1170;
  const cosLat = Math.cos((baseLat * Math.PI) / 180);

  let t = startedAt;
  let x = 0; // м на восток от базы
  let y = 0; // м на север от базы
  let alt = baseAlt;

  let px = 0;
  let py = 0;
  let pAlt = baseAlt;

  // Скорость считаем по фактическому смещению, как это делает GPS
  const push = (nominal: number) => {
    const moved = Math.sqrt((x - px) ** 2 + (y - py) ** 2 + (alt - pAlt) ** 2);
    const speed = nominal < 1 ? nominal : moved;
    px = x;
    py = y;
    pAlt = alt;
    points.push({
      t,
      lat: baseLat + (y + (rand() - 0.5) * 3) / M_PER_DEG,
      lon: baseLon + (x + (rand() - 0.5) * 3) / (M_PER_DEG * cosLat),
      alt: alt + (rand() - 0.5) * 2.5,
      speed: Math.max(0, speed + (rand() - 0.5) * 0.4),
      acc: 5 + rand() * 4,
    });
    t += 1000;
  };

  const stand = (seconds: number) => {
    for (let i = 0; i < seconds; i++) push(rand() * 0.3);
  };

  for (let lap = 0; lap < laps; lap++) {
    // Очередь на подъёмник
    stand(40 + Math.floor(rand() * 80));

    // Подъёмник: по прямой вверх
    const liftLen = 1500 + rand() * 300;
    const liftRise = 480 + rand() * 60;
    const liftSpeed = 5;
    const liftSteps = Math.round(liftLen / liftSpeed);
    const sx = x;
    const sy = y;
    const sAlt = alt;
    for (let i = 1; i <= liftSteps; i++) {
      const k = i / liftSteps;
      x = sx + k * liftLen * 0.35;
      y = sy - k * liftLen * 0.94;
      alt = sAlt + k * liftRise;
      push(liftSpeed);
    }

    // Сборы наверху
    stand(20 + Math.floor(rand() * 40));

    // Спуск: змейкой обратно к базе
    const tx = x;
    const ty = y;
    const tAlt = alt;
    const side = (lap % 3) - 1; // три разные трассы
    const amp = 10 + rand() * 8;
    const period = 140 + rand() * 80;
    const stopAt = rand() < 0.5 ? 0.35 + rand() * 0.3 : -1;
    let k = 0;
    let stopped = false;
    while (k < 1) {
      const pitch = 0.6 + 0.4 * Math.sin(k * Math.PI);
      const speed = (6 + rand() * 2 + 7 * pitch) * (0.85 + 0.15 * Math.sin(k * 40));
      k = Math.min(1, k + speed / (liftLen * 1.25));
      const bow = Math.sin(k * Math.PI) * 260 * side;
      const wave = Math.sin((k * liftLen * 1.25) / period * 2 * Math.PI) * amp;
      x = tx + (0 - tx) * k + bow + wave;
      y = ty + (0 - ty) * k + bow * 0.2;
      alt = tAlt + (baseAlt - tAlt) * (k + 0.08 * Math.sin(k * Math.PI));
      push(speed);
      if (!stopped && stopAt > 0 && k >= stopAt) {
        stopped = true;
        stand(25 + Math.floor(rand() * 50));
      }
    }
    x = 0;
    y = 0;
    alt = baseAlt;

    // Обед после четвёртого круга
    if (lap === 3) stand(1500);
  }

  stand(30);
  return points;
}
