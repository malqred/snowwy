// Запуск: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  achievementsFromDays,
  achievementTitle,
  AVG_MIN_RUN,
  badgeText,
  CATEGORIES,
  dayBestFromTotals,
  earnedFromLevels,
  formatValue,
  levelsOf,
  progressOf,
  progressText,
  readLevels,
  TOTAL_ACHIEVEMENTS,
} from '../src/lib/achievements.ts';
import { analyze } from '../src/lib/analyze.ts';
import { generateDemoTrack } from '../src/lib/demo.ts';

const DAY = 24 * 3600 * 1000;
const START = Date.UTC(2026, 0, 15, 7, 0, 0);
const day = (n, best) => ({ id: n, startedAt: START + n * DAY, best });
const best = (patch = {}) => ({ maxSpeed: 0, bestAvg: 0, longest: 0, vertical: 0, distance: 0, ...patch });
const find = (list, category, value) => list.find((a) => a.category.id === category && a.value === value);

test('пороги достижений — ровно те, что заданы', () => {
  const levels = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.levels]));
  assert.deepEqual(levels, {
    speed: [40, 60, 80, 100, 120, 140],
    avg: [20, 30, 40, 50, 60, 70, 100],
    length: [500, 1000, 2000, 3000, 4000, 5000, 6000],
    vertical: [50, 100, 200, 400, 600, 800, 1000, 1500, 2000, 3000, 4000],
    day: [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 50000, 60000, 70000, 80000, 90000, 100000],
  });
  assert.equal(TOTAL_ACHIEVEMENTS, 45);
  for (const c of CATEGORIES) {
    assert.deepEqual([...c.levels].sort((a, b) => a - b), c.levels, `${c.id}: пороги по возрастанию`);
  }
});

test('подписи на значках', () => {
  assert.deepEqual(badgeText('speed', 120), { value: '120', unit: 'км/ч' });
  assert.deepEqual(badgeText('avg', 30), { value: '30', unit: 'км/ч' });
  assert.deepEqual(badgeText('length', 500), { value: '500', unit: 'м' });
  assert.deepEqual(badgeText('length', 2000), { value: '2', unit: 'км' });
  assert.deepEqual(badgeText('vertical', 400), { value: '400', unit: 'м' });
  assert.deepEqual(badgeText('vertical', 1500), { value: '1 500', unit: 'м' });
  assert.deepEqual(badgeText('day', 15000), { value: '15', unit: 'км' });
  assert.deepEqual(badgeText('day', 100000), { value: '100', unit: 'км' });
});

test('что нужно сделать для значка', () => {
  assert.equal(achievementTitle('speed', 60), 'Разогнаться до 60 км/ч');
  assert.equal(achievementTitle('avg', 40), 'Спуск со средней скоростью от 40 км/ч');
  assert.equal(achievementTitle('length', 500), 'Спуск длиной от 500 м');
  assert.equal(achievementTitle('length', 3000), 'Спуск длиной от 3 км');
  assert.equal(achievementTitle('vertical', 1000), 'Спуск с перепадом от 1 000 м');
  assert.equal(achievementTitle('day', 25000), 'Проехать за день 25 км');
});

test('показатели словами', () => {
  assert.equal(formatValue('speed', 74.24), '74,2 км/ч');
  assert.equal(formatValue('speed', 104.6), '105 км/ч');
  assert.equal(formatValue('vertical', 829.6), '830 м');
  assert.equal(formatValue('vertical', 1520), '1520 м');
  assert.equal(formatValue('length', 640), '640 м');
  assert.equal(formatValue('day', 12440), '12,4 км');
});

test('достижение засчитывается в первый день, когда порог взят, и ровно на пороге', () => {
  const list = achievementsFromDays([
    // Дни намеренно не по порядку
    day(3, best({ maxSpeed: 85, distance: 20000 })),
    day(1, best({ maxSpeed: 40, distance: 4999 })),
    day(2, best({ maxSpeed: 61, distance: 5000 })),
  ]);
  assert.equal(list.length, 45);
  assert.equal(find(list, 'speed', 40).earnedAt, START + DAY, '40 км/ч ровно на пороге — первый день');
  assert.equal(find(list, 'speed', 60).earnedAt, START + 2 * DAY);
  assert.equal(find(list, 'speed', 80).earnedAt, START + 3 * DAY);
  assert.equal(find(list, 'speed', 100).earnedAt, null);
  assert.equal(find(list, 'speed', 80).sessionId, 3);
  assert.equal(find(list, 'day', 5000).earnedAt, START + 2 * DAY, '4999 м — ещё не 5 км');
  assert.equal(find(list, 'day', 20000).earnedAt, START + 3 * DAY);
  assert.equal(find(list, 'day', 25000).earnedAt, null);
  // Лучший результат категории — по всем дням
  for (const a of list.filter((x) => x.category.id === 'speed')) assert.equal(a.best, 85);
});

test('без дней катания ничего не получено, лучший результат нулевой', () => {
  const list = achievementsFromDays([]);
  assert.equal(list.length, 45);
  assert.ok(list.every((a) => a.earnedAt == null && a.best === 0));
  assert.deepEqual(levelsOf(list), {});
});

test('сколько осталось до неполученного значка', () => {
  const list = achievementsFromDays([day(1, best({ maxSpeed: 74.2, bestAvg: 0, distance: 12400 }))]);
  const speed80 = find(list, 'speed', 80);
  assert.equal(progressText(speed80), 'Лучший результат — 74,2 км/ч. Осталось 5,8 км/ч (93% пути).');
  assert.ok(Math.abs(progressOf(speed80) - 74.2 / 80) < 1e-9);

  const day15 = find(list, 'day', 15000);
  assert.equal(progressText(day15), 'Лучший день — 12,4 км. Осталось 2,6 км (83% пути).');

  // Средней скорости нет: ни одного спуска от 300 м
  assert.match(progressText(find(list, 'avg', 20)), new RegExp(`от ${AVG_MIN_RUN} м`));
  // Полученный значок — без подсказки и с полной полоской
  const speed60 = find(list, 'speed', 60);
  assert.equal(progressText(speed60), '');
  assert.equal(progressOf(speed60), 1);
  // Почти взятый порог не показывает 100%, пока он не взят
  assert.ok(progressOf({ best: 79.99, value: 80, earnedAt: null }) < 1);
  assert.equal(progressText(achievementsFromDays([]).find((a) => a.category.id === 'length')), 'Пока нет ни одного дня катания.');
});

test('уровни для друзей: подсчёт, разбор присланного и порядок значков', () => {
  const list = achievementsFromDays([day(1, best({ maxSpeed: 85, vertical: 450, distance: 31000 }))]);
  assert.deepEqual(levelsOf(list), { speed: 3, vertical: 4, day: 6 });

  assert.equal(readLevels(null), null);
  assert.equal(readLevels('мусор'), null);
  assert.deepEqual(readLevels({ speed: 3.4, avg: -2, length: 99, vertical: 'много', day: NaN, lol: 5 }), {
    speed: 3,
    avg: 0,
    length: 7,
  });

  const earned = earnedFromLevels({ speed: 2, day: 1 });
  assert.deepEqual(
    earned.map((e) => `${e.category.id}:${e.value}`),
    ['speed:60', 'speed:40', 'day:5000']
  );
  assert.deepEqual(earnedFromLevels({ speed: 50 }).length, 6, 'больше ступеней, чем есть, не бывает');
});

test('лучшие показатели дня из итогов: км/ч из м/с, у старых записей — нет', () => {
  assert.equal(dayBestFromTotals({ maxSpeed: 20, distance: 1000, longestRun: 500, biggestRunVertical: 100 }), null);
  const b = dayBestFromTotals({
    maxSpeed: 20,
    distance: 12000,
    longestRun: 2100,
    biggestRunVertical: 530,
    bestRunAvgSpeed: 10,
  });
  assert.deepEqual(b, { maxSpeed: 72, bestAvg: 36, longest: 2100, vertical: 530, distance: 12000 });
});

test('демо-день: значки совпадают с его настоящими итогами', () => {
  const { totals } = analyze(generateDemoTrack(START, 7));
  const b = dayBestFromTotals(totals);
  assert.ok(b, 'в итогах нового разбора есть всё для достижений');
  const list = achievementsFromDays([day(1, b)]);
  for (const a of list) {
    const value = { speed: b.maxSpeed, avg: b.bestAvg, length: b.longest, vertical: b.vertical, day: b.distance }[a.category.id];
    assert.equal(a.earnedAt != null, value >= a.value, `${a.category.id} ${a.value}: результат ${value}`);
  }
  assert.ok(b.bestAvg > 20 && b.bestAvg < b.maxSpeed, `средняя ${b.bestAvg}`);
});

test('средняя скорость спусков короче 300 м в достижения не идёт', () => {
  const START2 = Date.UTC(2026, 0, 16, 7, 0, 0);
  const points = [];
  let t = START2;
  let alt = 1500;
  let lat = 43.6;
  const leg = (speed, climb, seconds) => {
    for (let i = 0; i < seconds; i++) {
      alt += climb;
      lat += speed / 111320;
      points.push({ t, lat, lon: 40.3, alt, speed, acc: 5 });
      t += 1000;
    }
  };
  leg(0, 0, 20);
  leg(16, -4, 15); // короткий быстрый съезд: 240 м на 58 км/ч
  leg(0, 0, 60);
  leg(5, 1.5, 100); // подъёмник
  leg(0, 0, 20);
  leg(8, -1.5, 60); // спуск 480 м на 29 км/ч
  leg(0, 0, 20);
  const { totals, segments } = analyze(points);
  const runs = segments.filter((s) => s.kind === 'run');
  assert.equal(runs.length, 2);
  assert.ok(runs.some((r) => r.distance < 300 && r.avgSpeed * 3.6 > 50), 'короткий быстрый спуск есть');
  const avg = totals.bestRunAvgSpeed * 3.6;
  assert.ok(avg > 25 && avg < 35, `в зачёт идёт средняя длинного спуска, а не короткого: ${avg}`);
});
