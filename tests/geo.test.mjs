// Запуск: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { batteryColor, far, relative, relativeLong, relativeShort, side } from '../src/lib/geo.ts';
import { inTime } from '../src/lib/format.ts';

const ME = { lat: 43.65, lon: 40.31, alt: 1500 };

test('расстояние и направление до друга', () => {
  const north = relative(ME, { lat: ME.lat + 0.003, lon: ME.lon, alt: 1620 });
  assert.ok(Math.abs(north.distance - 333.6) < 2, `на север ${north.distance}`);
  assert.ok(north.bearing < 1 || north.bearing > 359, `азимут ${north.bearing}`);
  assert.equal(north.above, 120);

  const east = relative(ME, { lat: ME.lat, lon: ME.lon + 0.004 });
  assert.ok(Math.abs(east.bearing - 90) < 0.5, `на восток ${east.bearing}`);
  assert.equal(east.above, null, 'высота друга неизвестна');

  const sw = relative(ME, { lat: ME.lat - 0.002, lon: ME.lon - 0.0028 });
  assert.equal(side(sw.bearing).word, 'на юго-запад');
});

test('стороны света по азимуту', () => {
  assert.deepEqual(side(0), { word: 'на север', arrow: '↑' });
  assert.deepEqual(side(22), { word: 'на север', arrow: '↑' });
  assert.deepEqual(side(23), { word: 'на северо-восток', arrow: '↗' });
  assert.deepEqual(side(180), { word: 'на юг', arrow: '↓' });
  assert.deepEqual(side(338), { word: 'на север', arrow: '↑' });
  assert.deepEqual(side(-90), { word: 'на запад', arrow: '←' });
  assert.deepEqual(side(720 + 135), { word: 'на юго-восток', arrow: '↘' });
});

test('расстояние словами', () => {
  assert.equal(far(3), '10 м');
  assert.equal(far(84), '80 м');
  assert.equal(far(355), '360 м');
  assert.equal(far(994), '990 м');
  assert.equal(far(995), '1,0 км');
  assert.equal(far(1240), '1,2 км');
  assert.equal(far(12400), '12 км');
});

test('коротко и подробно о том, где друг', () => {
  assert.equal(relativeShort({ distance: 8, bearing: 0, above: 50 }), 'рядом с вами');
  assert.equal(relativeShort({ distance: 350, bearing: 45, above: 120 }), '350 м ↗ · выше на 120 м');
  assert.equal(relativeShort({ distance: 1200, bearing: 180, above: -87 }), '1,2 км ↓ · ниже на 87 м');
  assert.equal(relativeShort({ distance: 350, bearing: 45, above: 6 }), '350 м ↗', 'маленькая разница высот не упоминается');
  assert.equal(relativeShort({ distance: 350, bearing: 45, above: null }), '350 м ↗');

  assert.equal(relativeLong({ distance: 300, bearing: 270, above: 295 }), '300 м на запад, выше вас на 295 м');
  assert.equal(relativeLong({ distance: 300, bearing: 270, above: 4 }), '300 м на запад, на той же высоте');
  assert.equal(relativeLong({ distance: 300, bearing: 270, above: null }), '300 м на запад');
  assert.equal(relativeLong({ distance: 5, bearing: 270, above: 4 }), 'Рядом с вами');
});

test('цвет заряда', () => {
  assert.equal(batteryColor(0), '#E5484D');
  assert.equal(batteryColor(20), '#E5484D');
  assert.equal(batteryColor(21), '#F0A23B');
  assert.equal(batteryColor(50), '#F0A23B');
  assert.equal(batteryColor(51), '#4CB05A');
  assert.equal(batteryColor(100), '#4CB05A');
});

test('сколько до встречи', () => {
  assert.equal(inTime(-5000), 'сейчас');
  assert.equal(inTime(20000), 'сейчас');
  assert.equal(inTime(25 * 60000), 'через 25 мин');
  assert.equal(inTime(60 * 60000), 'через 1 ч');
  assert.equal(inTime(70 * 60000), 'через 1 ч 10 мин');
});
