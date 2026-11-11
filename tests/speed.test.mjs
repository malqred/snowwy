// Запуск: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyze, despike } from '../src/lib/analyze.ts';
import { createSpeedFilter, displaySpeed } from '../src/lib/speed.ts';

const START = Date.UTC(2026, 0, 15, 7, 0, 0);
const LAT = 43.6;
const LON = 40.3;
const M = 1 / 111320; // градусов широты в метре

/** Детерминированный «случайный» шум в пределах ±1 */
function noise(i, salt = 0) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

test('на месте скорость не скачет, когда телефон её не знает, а координаты прыгают', () => {
  const filter = createSpeedFilter();
  let max = 0;
  for (let i = 0; i < 120; i++) {
    // прыжки до 17 м в секунду — по соседним точкам это было бы до 60 км/ч
    const v = filter.push({
      t: START + i * 1000,
      lat: LAT + noise(i) * 12 * M,
      lon: LON + noise(i, 1) * 12 * M,
      acc: 25,
      speed: -1,
    });
    if (v > max) max = v;
  }
  assert.equal(max, 0);
});

test('на месте гасит всплески скорости от телефона', () => {
  const filter = createSpeedFilter();
  const shown = [];
  for (let i = 0; i < 120; i++) {
    const spike = i % 17 === 5 ? 17 : i % 17 === 6 ? 9 : 0.2;
    const v = filter.push({
      t: START + i * 1000,
      lat: LAT + noise(i) * 2 * M,
      lon: LON + noise(i, 1) * 2 * M,
      acc: 8,
      speed: spike,
    });
    shown.push(v);
  }
  // было до 17 м/с (61 км/ч); остаться может не больше шага
  assert.ok(Math.max(...shown) < 1.5, `макс. ${Math.max(...shown)}`);
});

test('ровную езду не трогает', () => {
  const filter = createSpeedFilter();
  for (let i = 0; i < 60; i++) {
    const v = filter.push({ t: START + i * 1000, lat: LAT + i * 15 * M, lon: LON, acc: 5, speed: 15 });
    assert.equal(v, 15);
  }
});

test('резкий старт после остановки виден сразу', () => {
  const filter = createSpeedFilter();
  let lat = LAT;
  for (let i = 0; i < 20; i++) filter.push({ t: START + i * 1000, lat, lon: LON, acc: 5, speed: 0 });
  const got = [];
  let speed = 0;
  for (let i = 20; i < 26; i++) {
    speed += 4;
    lat += speed * M;
    got.push(filter.push({ t: START + i * 1000, lat, lon: LON, acc: 5, speed }));
  }
  assert.deepEqual(got, [4, 8, 12, 16, 20, 24]);
});

test('змейка короткими поворотами не считается стоянием', () => {
  const filter = createSpeedFilter();
  let lat = LAT;
  let lon = LON;
  for (let i = 0; i < 60; i++) {
    // 12 м/с под углом ±45° к склону, поворот каждые 2 секунды
    const side = Math.floor(i / 2) % 2 === 0 ? 1 : -1;
    lat += 12 * Math.SQRT1_2 * M;
    lon += (side * 12 * Math.SQRT1_2 * M) / Math.cos((LAT * Math.PI) / 180);
    const v = filter.push({ t: START + i * 1000, lat, lon, acc: 6, speed: 12 });
    assert.equal(v, 12, `секунда ${i}`);
  }
});

test('скорость для показа: мелочь округляется до нуля', () => {
  assert.equal(displaySpeed([]), 0);
  assert.equal(displaySpeed([0.3, 0.2, 0.4]), 0);
  assert.equal(displaySpeed([10, 12, 14]), 12);
});

test('одиночный всплеск в старой записи не попадает в максимальную скорость', () => {
  const points = [];
  let t = START;
  let alt = 2000;
  let lat = LAT;
  const step = (speed, drop, seconds) => {
    for (let i = 0; i < seconds; i++) {
      alt -= drop;
      lat += speed * M;
      points.push({ t, lat, lon: LON, alt, speed, acc: 5 });
      t += 1000;
    }
  };
  step(0, 0, 20);
  step(12, 3, 90);
  step(0, 0, 20);
  // всплеск посреди спуска: 40 м/с при соседних 12
  points[60].speed = 40;

  const clean = despike(points);
  assert.equal(clean[60], 12);
  assert.equal(clean[59], 12);

  const { segments } = analyze(points);
  const run = segments.find((s) => s.kind === 'run');
  assert.ok(run, 'спуск найден');
  assert.ok(run.maxSpeed < 13, `макс. скорость ${run.maxSpeed}`);
});

test('настоящий разгон всплеском не считается', () => {
  const points = [];
  const speeds = [0, 0, 3, 7, 11, 15, 19, 22, 24, 25, 25, 24, 20, 12, 5, 0, 0];
  speeds.forEach((speed, i) => points.push({ t: START + i * 1000, lat: LAT, lon: LON, alt: 2000, speed, acc: 5 }));
  assert.deepEqual(despike(points), speeds);
});

// ── Трассы ───────────────────────────────────────────────────────────────────
import { favoritePistes, matchRun, parseWays } from '../src/lib/pistes.ts';

const WAYS = parseWays({
  elements: [
    {
      tags: { name: 'Каскад', 'piste:difficulty': 'intermediate' },
      geometry: [
        { lat: 43.6, lon: 40.3 },
        { lat: 43.61, lon: 40.3 },
      ],
    },
    {
      tags: { name: 'Горизонт', 'piste:difficulty': 'easy' },
      geometry: [
        { lat: 43.6, lon: 40.31 },
        { lat: 43.61, lon: 40.31 },
      ],
    },
    { tags: { 'piste:difficulty': 'easy' }, geometry: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] },
  ],
});

const along = (lon, shift = 0) =>
  Array.from({ length: 100 }, (_, i) => ({ t: i * 1000, lat: 43.6 + i * 0.0001, lon: lon + shift, alt: 0, speed: 10, acc: 5 }));

test('безымянные участки трасс не учитываются', () => {
  assert.equal(WAYS.length, 2);
});

test('спуск вдоль трассы получает её название и сложность', () => {
  // 15 метров в сторону от линии — в пределах ширины трассы
  assert.deepEqual(matchRun(along(40.3, 0.00018), WAYS), { name: 'Каскад', difficulty: 'intermediate' });
  assert.deepEqual(matchRun(along(40.31), WAYS), { name: 'Горизонт', difficulty: 'easy' });
});

test('спуск вне трасс названия не получает', () => {
  assert.equal(matchRun(along(40.305), WAYS), null);
});

test('любимые трассы: считает проезды, лучшее время и среднюю скорость', () => {
  const run = (name, duration, avgSpeed) => ({ t: 0, name, difficulty: 'easy', duration, distance: 0, vertical: 0, maxSpeed: avgSpeed + 5, avgSpeed });
  const top = favoritePistes([[run('А', 100, 10), run('Б', 90, 12)], [run('А', 80, 14)]]);
  assert.equal(top[0].name, 'А');
  assert.equal(top[0].count, 2);
  assert.equal(top[0].best, 80);
  assert.equal(top[0].avgSpeed, 12);
  assert.equal(top[1].name, 'Б');
});
