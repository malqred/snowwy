// Запуск: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { niceScale, valueAt } from '../src/lib/chart-scale.ts';

test('круглые деления оси значений', () => {
  assert.deepEqual(niceScale(0, 57), { min: 0, max: 60, ticks: [0, 20, 40, 60] });
  const alt = niceScale(1171, 1681);
  assert.equal(alt.min, 1000);
  assert.equal(alt.max, 1800);
  assert.deepEqual(alt.ticks, [1000, 1200, 1400, 1600, 1800]);
  assert.deepEqual(niceScale(0, 8.4).ticks, [0, 5, 10]);
  const flat = niceScale(1500, 1500);
  assert.ok(flat.min < 1500 && flat.max > 1500, 'плоская линия — посередине');
  for (const s of [niceScale(3, 97), niceScale(1171, 1681), niceScale(0, 0.3)]) {
    assert.equal(s.ticks[0], s.min);
    assert.equal(s.ticks.at(-1), s.max);
  }
});

test('значение под палочкой', () => {
  const v = [0, 10, 20, 30];
  assert.equal(valueAt(v, 0), 0);
  assert.equal(valueAt(v, 1), 30);
  assert.equal(valueAt(v, 0.5), 15);
  // Линия занимает половину ширины: правее её значения нет
  assert.equal(valueAt(v, 0.25, 0.5), 15);
  assert.equal(valueAt(v, 0.5, 0.5), 30);
  assert.equal(valueAt(v, 0.8, 0.5), null);
  assert.equal(valueAt([], 0.5), null);
  assert.equal(valueAt([7], 0.3), 7);
});
