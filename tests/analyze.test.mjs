// Запуск: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyze } from '../src/lib/analyze.ts';
import { generateDemoTrack } from '../src/lib/demo.ts';

const START = Date.UTC(2026, 0, 15, 7, 0, 0);

test('находит все спуски и подъёмы демо-дня', () => {
  const points = generateDemoTrack(START, 7);
  const { segments, totals } = analyze(points);
  const runs = segments.filter((s) => s.kind === 'run');
  const lifts = segments.filter((s) => s.kind === 'lift');

  assert.equal(runs.length, 7);
  assert.equal(lifts.length, 7);
  assert.equal(totals.runs, 7);

  for (const r of runs) {
    assert.ok(r.vertical > 430 && r.vertical < 580, `перепад ${r.vertical}`);
    assert.ok(r.distance > 1500 && r.distance < 3200, `дистанция ${r.distance}`);
    assert.ok(r.maxSpeed > 12 && r.maxSpeed < 25, `макс. скорость ${r.maxSpeed}`);
    assert.ok(r.avgSpeed > 8 && r.avgSpeed <= r.maxSpeed, `ср. скорость ${r.avgSpeed}`);
    assert.ok(r.minSpeed >= 0 && r.minSpeed <= r.avgSpeed, `мин. скорость ${r.minSpeed}`);
    assert.ok(r.duration >= r.movingTime);
    assert.ok(r.startAlt > r.endAlt);
  }
  for (const l of lifts) {
    assert.ok(l.vertical > 430 && l.vertical < 580, `подъём ${l.vertical}`);
    // очередь и сборы наверху не должны попадать во время подъёма
    assert.ok(l.duration > 280 && l.duration < 380, `время подъёма ${l.duration}`);
  }
});

test('сегменты идут по порядку и не пересекаются', () => {
  const { segments } = analyze(generateDemoTrack(START, 5, 3));
  for (let i = 1; i < segments.length; i++) {
    assert.ok(segments[i].from >= segments[i - 1].to);
  }
});

test('обеденный перерыв посреди склона делит спуск на два', () => {
  const points = [];
  let t = START;
  let alt = 2000;
  let lat = 43.6;
  const step = (speed, drop, seconds) => {
    for (let i = 0; i < seconds; i++) {
      alt -= drop;
      lat += (speed / 111320);
      points.push({ t, lat, lon: 40.3, alt, speed, acc: 5 });
      t += 1000;
    }
  };
  step(0, 0, 20);
  step(12, 3, 60);
  step(0, 0, 600);
  step(12, 3, 60);
  step(0, 0, 20);
  const runs = analyze(points).segments.filter((s) => s.kind === 'run');
  assert.equal(runs.length, 2);
  assert.ok(Math.abs(runs[0].vertical - 180) < 15);
  assert.ok(runs[0].duration < 75);
});

test('прогулка по ровному месту не считается спуском', () => {
  const points = [];
  for (let i = 0; i < 600; i++) {
    points.push({
      t: START + i * 1000,
      lat: 43.6 + (i * 1.2) / 111320,
      lon: 40.3,
      alt: 1500 + Math.sin(i / 20) * 4,
      speed: 1.2,
      acc: 8,
    });
  }
  const { segments, totals } = analyze(points);
  assert.equal(segments.length, 0);
  assert.equal(totals.runs, 0);
});

test('во время записи определяет текущее состояние', () => {
  const points = generateDemoTrack(START, 1);
  const liftMid = points.findIndex((p) => p.alt > 1400);
  assert.equal(analyze(points.slice(0, liftMid)).state, 'lift');
  const top = points.reduce((best, p, i) => (p.alt > points[best].alt ? i : best), 0);
  const runMid = points.findIndex((p, i) => i > top && p.alt < 1400);
  const live = analyze(points.slice(0, runMid));
  assert.equal(live.state, 'run');
  assert.equal(live.totals.runs, 1);
  assert.ok(live.segments.at(-1).open);
  assert.equal(analyze(points.slice(0, 30)).state, 'pause');
});

test('пустой и очень короткий трек не ломают анализ', () => {
  assert.equal(analyze([]).segments.length, 0);
  assert.equal(analyze(generateDemoTrack(START, 1).slice(0, 2)).segments.length, 0);
});

/** Прямой спуск: step(скорость м/с, снижение м/с, секунды). */
function track() {
  const points = [];
  let t = START;
  let alt = 2000;
  let lat = 43.6;
  return {
    points,
    step(speed, drop, seconds) {
      for (let i = 0; i < seconds; i++) {
        alt -= drop;
        lat += speed / 111320;
        points.push({ t, lat, lon: 40.3, alt, speed, acc: 5 });
        t += 1000;
      }
    },
    jump(seconds, meters) {
      t += seconds * 1000;
      lat += meters / 111320;
    },
  };
}

test('считает средний и максимальный уклон', () => {
  const tr = track();
  tr.step(0, 0, 20);
  tr.step(12, 3, 60); // 14°
  tr.step(12, 6, 40); // 27°
  tr.step(0, 0, 20);
  const [run] = analyze(tr.points).segments.filter((s) => s.kind === 'run');
  assert.ok(run.maxSlope > 24 && run.maxSlope < 29, `макс. уклон ${run.maxSlope}`);
  assert.ok(run.avgSlope > 16 && run.avgSlope < 22, `ср. уклон ${run.avgSlope}`);
  assert.ok(run.maxSlope > run.avgSlope);
});

test('пауза в записи не добавляет расстояние', () => {
  const tr = track();
  tr.step(0, 0, 20);
  tr.step(12, 3, 60);
  tr.jump(60, 2000); // минута без точек и скачок на два километра
  tr.step(12, 3, 60);
  tr.step(0, 0, 20);
  const { segments, totals } = analyze(tr.points);
  const runs = segments.filter((s) => s.kind === 'run');
  assert.equal(runs.length, 1);
  assert.ok(runs[0].distance > 1300 && runs[0].distance < 1700, `дистанция ${runs[0].distance}`);
  assert.ok(runs[0].movingTime < 130, `время в движении ${runs[0].movingTime}`);
  assert.ok(totals.longestRun === runs[0].distance);
});

/** Трек из участков: [скорость м/с, набор высоты м/с (минус — вниз), секунды]. */
function route(parts) {
  const points = [];
  let t = START;
  let alt = 1500;
  let lat = 43.6;
  for (const [speed, climb, seconds] of parts) {
    for (let i = 0; i < seconds; i++) {
      alt += climb;
      lat += speed / 111320;
      points.push({ t, lat, lon: 40.3, alt, speed, acc: 5 });
      t += 1000;
    }
  }
  return points;
}

const tally = (points) => {
  const { segments } = analyze(points);
  return {
    runs: segments.filter((s) => s.kind === 'run'),
    lifts: segments.filter((s) => s.kind === 'lift'),
  };
};

test('маленький склон: спуски с перепадом 10 метров считаются', () => {
  const lap = [
    [0.8, 0.1, 100], // ковёр-подъёмник: 10 м вверх
    [0, 0, 20],
    [5, -0.5, 20], // спуск: 10 м вниз, 100 м пути
    [0, 0, 30],
  ];
  const { runs } = tally(route([[0, 0, 10], ...lap, ...lap, ...lap]));
  assert.equal(runs.length, 3);
  for (const r of runs) assert.ok(r.vertical > 7 && r.vertical < 12, `перепад ${r.vertical}`);
});

test('спуск с перепадом 6 метров считается, с перепадом 3 метра — только если ехать от 15 км/ч', () => {
  assert.equal(tally(route([[0, 0, 20], [6, -0.3, 20], [0, 0, 20]])).runs.length, 1);
  // 3 метра вниз на 22 км/ч — пологий спуск
  assert.equal(tally(route([[0, 0, 20], [6, -0.15, 20], [0, 0, 20]])).runs.length, 1);
  // те же 3 метра на 11 км/ч — нет
  assert.equal(tally(route([[0, 0, 20], [3, -0.15, 20], [0, 0, 20]])).runs.length, 0);
});

test('пологая трасса: 2 метра перепада на 300 метров пути на 20 км/ч — спуск', () => {
  const { runs } = tally(route([[0, 0, 20], [5.5, -0.035, 55], [0, 0, 20]]));
  assert.equal(runs.length, 1);
  assert.ok(runs[0].distance > 250, `путь ${runs[0].distance}`);
});

test('переезд между подъёмниками по ровному засчитывается спуском', () => {
  const points = route([
    [0, 0, 20],
    [5, 1.5, 100], // подъёмник: 150 м вверх
    [0, 0, 15], // сошли с кресла
    [6, -0.08, 60], // переезд: 360 м по почти ровному, 5 м вниз за минуту
    [0, 0, 60], // очередь
    [5, 1.5, 100], // второй подъёмник
    [0, 0, 20],
  ]);
  const { runs, lifts } = tally(points);
  assert.equal(lifts.length, 2);
  assert.equal(runs.length, 1);
  assert.ok(runs[0].distance > 300, `путь ${runs[0].distance}`);
});

test('ровный выкат в конце спуска входит в спуск', () => {
  const points = route([
    [0, 0, 20],
    [12, -2.5, 40], // 100 м вниз, 480 м пути
    [7, 0, 30], // выкат по ровному: 210 м
    [0, 0, 30],
  ]);
  const { runs } = tally(points);
  assert.equal(runs.length, 1);
  assert.ok(runs[0].distance > 650, `путь ${runs[0].distance}`);
});

test('медленно по ровному — не спуск, даже с перепадом в пару метров', () => {
  const { runs } = tally(route([[0, 0, 20], [3.5, -0.04, 80], [0, 0, 20]]));
  assert.equal(runs.length, 0);
});

test('контруклон посреди спуска не делит его на два', () => {
  const points = route([
    [0, 0, 20],
    [12, -2.5, 40], // 100 м вниз
    [10, 1.3, 6], // по инерции 8 м вверх
    [12, -2.5, 40], // ещё 100 м вниз
    [0, 0, 20],
  ]);
  const { runs, lifts } = tally(points);
  assert.equal(runs.length, 1);
  assert.equal(lifts.length, 0);
  assert.ok(Math.abs(runs[0].vertical - 192) < 12, `перепад ${runs[0].vertical}`);
});

test('пока едешь через контруклон, спуск не считается законченным', () => {
  const live = analyze(route([[0, 0, 20], [12, -2.5, 40], [10, 1.3, 6]]));
  const runs = live.segments.filter((s) => s.kind === 'run');
  assert.equal(runs.length, 1);
  assert.ok(runs[0].open);
});

test('провал на линии подъёмника не превращается в спуск', () => {
  const points = route([
    [0, 0, 20],
    [5, 1.5, 100], // 150 м вверх
    [5, -0.2, 40], // линия проседает на 8 м, скорость та же
    [5, 1.5, 100], // ещё 150 м вверх
    [0, 0, 30],
  ]);
  const { runs, lifts } = tally(points);
  assert.equal(runs.length, 0);
  assert.equal(lifts.length, 1);
  assert.ok(lifts[0].vertical > 280, `подъём ${lifts[0].vertical}`);
});

test('пешком под горку — не спуск', () => {
  const { runs } = tally(route([[0, 0, 20], [1.8, -0.08, 100], [0, 0, 20]]));
  assert.equal(runs.length, 0);
});

test('короткий спуск: 20 метров пути и 6 метров перепада считается, 10 метров пути — нет', () => {
  assert.equal(tally(route([[0, 0, 20], [4, -1.2, 5], [0, 0, 20]])).runs.length, 1);
  assert.equal(tally(route([[0, 0, 20], [3, -2, 3], [0, 0, 20]])).runs.length, 0);
});
