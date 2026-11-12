// Запуск: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readInfo } from '../src/lib/friends/summary.ts';

test('сводка друга: пустая и полная', () => {
  assert.equal(readInfo(null), null);
  const info = readInfo({
    bat: 38.6,
    chg: true,
    day: { date: '2026-11-12', runs: 5, vertical: 2140, distance: 11800, maxSpeed: 17.2, runTime: 2460, longest: 2650 },
    rec: { maxSpeed: 21.4, longestRun: 3100, biggestRunVertical: 690, dayVertical: 4210 },
    ach: { speed: 3, avg: 3, length: 4, vertical: 5, day: 4 },
  });
  assert.deepEqual(info, {
    bat: 39,
    chg: true,
    day: { date: '2026-11-12', runs: 5, vertical: 2140, distance: 11800, maxSpeed: 17.2, runTime: 2460, longest: 2650 },
    rec: { maxSpeed: 21.4, longestRun: 3100, biggestRunVertical: 690, dayVertical: 4210 },
    ach: { speed: 3, avg: 3, length: 4, vertical: 5, day: 4 },
  });
});

test('сводка друга: мусор и старые версии не ломают карточку', () => {
  const info = readInfo({
    bat: 140,
    chg: 'да',
    day: { runs: 3 },
    rec: { maxSpeed: 'быстро', longestRun: Infinity },
  });
  assert.equal(info.bat, 100, 'заряд не больше 100%');
  assert.equal(info.chg, false, 'зарядка — только явное true');
  assert.equal(info.day, null, 'итоги без даты не показываются');
  assert.deepEqual(info.rec, { maxSpeed: 0, longestRun: 0, biggestRunVertical: 0, dayVertical: 0 });
  assert.equal(info.ach, null, 'версия до 1.0.4 не присылает достижений');

  assert.equal(readInfo({ bat: -5 }).bat, 0);
  assert.equal(readInfo({}).bat, null, 'заряд неизвестен');
  assert.equal(readInfo({ ach: { speed: 99, day: -1 } }).ach.speed, 6, 'ступеней не больше, чем есть');
});
