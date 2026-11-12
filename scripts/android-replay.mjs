// Проигрывает выдуманное катание в эмуляторе Android: каждую секунду подставляет ему новое место.
// Так запись проверяется без выезда на склон.
//
//   node scripts/android-replay.mjs [кругов=1] [ускорение=1]
//
// Ускорение 3 значит, что день идёт втрое быстрее: скорости в приложении тоже будут втрое выше.
// Нужен запущенный эмулятор и adb (ANDROID_HOME или стандартная папка SDK).
//
// Высота задаётся ещё и барометром эмулятора: служба геопозиции Google в эмуляторе
// запоминает высоту первой точки и дальше её не меняет.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { generateDemoTrack } from '../src/lib/demo.ts';

const laps = Number(process.argv[2] ?? 1);
const rate = Number(process.argv[3] ?? 1);

const sdk = process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
const exe = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const adb = existsSync(exe) ? exe : 'adb';

const points = generateDemoTrack(Date.now(), laps);
const total = (points[points.length - 1].t - points[0].t) / 1000 / rate;
console.log(`Точек: ${points.length}, займёт около ${Math.round(total / 60)} мин`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const began = Date.now();
let sent = 0;
for (const p of points) {
  // Ждём момента этой точки; лишние точки пропускаем, чтобы не отставать
  const due = began + (p.t - points[0].t) / rate;
  const wait = due - Date.now();
  if (wait < -500) continue;
  if (wait > 0) await sleep(wait);
  try {
    execFileSync(adb, ['emu', 'geo', 'fix', p.lon.toFixed(6), p.lat.toFixed(6), p.alt.toFixed(1)], { stdio: 'ignore' });
    // Давление по стандартной атмосфере, гПа
    const hpa = 1013.25 * Math.pow(1 - p.alt / 44330, 1 / 0.1903);
    execFileSync(adb, ['emu', 'sensor', 'set', 'pressure', hpa.toFixed(2)], { stdio: 'ignore' });
  } catch {
    console.error('Эмулятор не отвечает. Он запущен?');
    process.exit(1);
  }
  if (++sent % 60 === 0) console.log(`${sent} точек, высота ${Math.round(p.alt)} м`);
}
console.log('Готово');
