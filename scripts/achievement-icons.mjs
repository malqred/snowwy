// Значки достижений Snowwy. Рисует каждый значок в SVG и собирает страницу-превью:
//   node scripts/achievement-icons.mjs
// Результат — в design/achievements/: по файлу на значок и preview.html со всеми сразу.
//
// Устройство значка:
// - форма — шестиугольник, как знак Snowwy из шести «галочек»;
// - категория — линейная иконка из того же набора, что в приложении (Lucide, толщина 1.75);
// - уровень — материал: бронза, серебро, золото, лёд, хвоя, аметист и северное сияние;
//   у последних уровней за числом проступает кристалл Snowwy.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'design', 'achievements');

/** Иконки категорий — те же, что в приложении: Gauge, Timer, Route, TrendingDown, Map */
const ICONS = {
  speed: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  avg: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
  length:
    '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  vertical: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  day: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
};

/** Материалы уровней: светлый и тёмный тон заливки, кромка, цвет иконки и числа */
const TIERS = [
  { name: 'Бронза', top: '#E9B48A', bottom: '#9A5B33', edge: '#FBE0C8', ink: '#3A1E0C' },
  { name: 'Серебро', top: '#EEF2F6', bottom: '#93A2B2', edge: '#FFFFFF', ink: '#1F2B38' },
  { name: 'Золото', top: '#FBE39A', bottom: '#C48A1E', edge: '#FFF4CF', ink: '#3D2A05' },
  { name: 'Лёд', top: '#D6EEFF', bottom: '#4D86B8', edge: '#F2FAFF', ink: '#0A2238' },
  { name: 'Хвоя', top: '#B7E6E5', bottom: '#317978', edge: '#E6FAF9', ink: '#082524' },
  { name: 'Аметист', top: '#E6D4FF', bottom: '#7552C2', edge: '#F6EEFF', ink: '#1E0E3D' },
  { name: 'Сияние', top: '#7CF5D8', mid: '#5AA8F5', bottom: '#9A5CF0', edge: '#FFFFFF', ink: '#0A1523', glow: true },
];

const km = (m) => {
  const v = m / 1000;
  return Number.isInteger(v) ? `${v}` : `${v}`.replace('.', ',');
};

/** Категории и пороги — как попросил автор */
const CATEGORIES = [
  {
    id: 'speed',
    title: 'Максимальная скорость',
    short: 'Скорость',
    levels: [40, 60, 80, 100, 120, 140],
    show: (v) => ({ value: `${v}`, unit: 'км/ч' }),
    label: (v) => `Разогнаться до ${v} км/ч`,
  },
  {
    id: 'avg',
    title: 'Средняя скорость за спуск',
    short: 'Средняя',
    levels: [20, 30, 40, 50, 60, 70, 100],
    show: (v) => ({ value: `${v}`, unit: 'км/ч' }),
    label: (v) => `Спуск со средней скоростью от ${v} км/ч`,
  },
  {
    id: 'length',
    title: 'Длина спуска',
    short: 'Длина',
    levels: [500, 1000, 2000, 3000, 4000, 5000, 6000],
    show: (v) => (v < 1000 ? { value: `${v}`, unit: 'м' } : { value: km(v), unit: 'км' }),
    label: (v) => `Спуск длиной от ${v < 1000 ? `${v} м` : `${km(v)} км`}`,
  },
  {
    id: 'vertical',
    title: 'Перепад за спуск',
    short: 'Перепад',
    levels: [50, 100, 200, 400, 600, 800, 1000, 1500, 2000, 3000, 4000],
    show: (v) => ({ value: v >= 1000 ? `${v}`.replace(/(\d)(\d{3})$/, '$1 $2') : `${v}`, unit: 'м' }),
    label: (v) => `Спуск с перепадом от ${v} м`,
  },
  {
    id: 'day',
    title: 'Расстояние за день',
    short: 'За день',
    levels: [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 50000, 60000, 70000, 80000, 90000, 100000],
    show: (v) => ({ value: km(v), unit: 'км' }),
    label: (v) => `Проехать за день ${km(v)} км`,
  },
];

/** Уровень значка: ступени категории растягиваются на все семь материалов */
const tierOf = (i, n) => TIERS[Math.min(TIERS.length - 1, Math.floor((i * TIERS.length) / n))];

// Шестиугольник остриём вверх со скруглёнными углами
function hexPath(cx, cy, r, round) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const a = ((-90 + k * 60) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  let d = '';
  for (let k = 0; k < 6; k++) {
    const p = pts[k];
    const prev = pts[(k + 5) % 6];
    const next = pts[(k + 1) % 6];
    const towards = (from, to, t) => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    const t = round / r;
    const a = towards(p, prev, t);
    const b = towards(p, next, t);
    d += `${k === 0 ? 'M' : 'L'}${a[0].toFixed(2)} ${a[1].toFixed(2)} Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${b[0].toFixed(2)} ${b[1].toFixed(2)} `;
  }
  return d + 'Z';
}

// Кристалл Snowwy: шесть «галочек» остриём к центру
function crystal(cx, cy, scale, color, opacity) {
  const chevron = [
    [-64, -302],
    [0, -152],
    [64, -302],
  ];
  let paths = '';
  for (let k = 0; k < 6; k++) {
    const t = (k * 60 * Math.PI) / 180;
    const d = chevron
      .map(([x, y], i) => {
        const px = cx + (x * Math.cos(t) - y * Math.sin(t)) * scale;
        const py = cy + (x * Math.sin(t) + y * Math.cos(t)) * scale;
        return `${i === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)}`;
      })
      .join(' ');
    paths += `<path d="${d}"/>`;
  }
  return `<g fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${(54 * scale).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
}

const W = 120;
const H = 132;
const CX = W / 2;
const CY = H / 2;

/** Один значок. locked — ещё не получен: серый, без блеска. */
function badge(cat, value, i, locked = false) {
  const tier = tierOf(i, cat.levels.length);
  const id = `${cat.id}-${value}${locked ? '-l' : ''}`;
  const { value: big, unit } = cat.show(value);
  const top = locked ? '#3A4654' : tier.top;
  const bottom = locked ? '#1E2732' : tier.bottom;
  const edge = locked ? '#5B6876' : tier.edge;
  const ink = locked ? '#7F8C99' : tier.ink;
  const outer = hexPath(CX, CY, 62, 14);
  const inner = hexPath(CX, CY, 54, 11);
  const fontSize = big.length >= 5 ? 24 : big.length === 4 ? 28 : 32;
  const showCrystal = !locked && i >= cat.levels.length - 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${cat.title}: ${big} ${unit}">
  <defs>
    <linearGradient id="f-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/>
      ${tier.mid && !locked ? `<stop offset="0.5" stop-color="${tier.mid}"/>` : ''}
      <stop offset="1" stop-color="${bottom}"/>
    </linearGradient>
    <linearGradient id="s-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="${locked ? 0.06 : 0.55}"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${tier.glow && !locked ? `<path d="${hexPath(CX, CY, 64, 15)}" fill="none" stroke="${tier.top}" stroke-opacity="0.45" stroke-width="5"/>` : ''}
  <path d="${outer}" fill="${bottom}"/>
  <path d="${outer}" fill="none" stroke="${edge}" stroke-opacity="${locked ? 0.5 : 0.9}" stroke-width="2"/>
  <path d="${inner}" fill="url(#f-${id})"/>
  <path d="${inner}" fill="url(#s-${id})"/>
  <path d="${inner}" fill="none" stroke="${edge}" stroke-opacity="${locked ? 0.25 : 0.6}" stroke-width="1"/>
  ${showCrystal ? crystal(CX, CY + 6, 0.105, '#FFFFFF', 0.3) : ''}
  <g transform="translate(${CX - 13} 24) scale(${26 / 24})" fill="none" stroke="${ink}" stroke-width="${(1.75 * 24) / 26 + 0.25}" stroke-linecap="round" stroke-linejoin="round">${ICONS[cat.id]}</g>
  <text x="${CX}" y="${CY + 16}" text-anchor="middle" font-family="-apple-system, 'SF Pro Display', Roboto, 'Segoe UI', sans-serif" font-weight="800" font-size="${fontSize}" letter-spacing="-0.5" fill="${ink}">${big}</text>
  <text x="${CX}" y="${CY + 33}" text-anchor="middle" font-family="-apple-system, 'SF Pro Text', Roboto, 'Segoe UI', sans-serif" font-weight="700" font-size="11" letter-spacing="0.6" fill="${ink}" fill-opacity="0.75">${unit.toUpperCase()}</text>
</svg>`;
}

mkdirSync(out, { recursive: true });
let total = 0;
const sections = [];
for (const cat of CATEGORIES) {
  const cells = cat.levels
    .map((v, i) => {
      const svg = badge(cat, v, i);
      writeFileSync(join(out, `${cat.id}-${v}.svg`), svg);
      total++;
      const tier = tierOf(i, cat.levels.length);
      return `<figure>${svg}<figcaption><b>${cat.label(v).replace(/ (км\/ч|км|м)$/, '&nbsp;$1')}</b><span>${tier.name}</span></figcaption></figure>`;
    })
    .join('');
  sections.push(`<section><h2>${cat.title} <small>${cat.levels.length}</small></h2><div class="grid">${cells}</div></section>`);
}

const lockedRow = CATEGORIES.map((c) => `<figure>${badge(c, c.levels[1], 1, true)}<figcaption><b>${c.short}</b><span>ещё не получено</span></figcaption></figure>`).join('');
const tierRow = TIERS.map(
  (t, i) =>
    `<figure>${badge({ ...CATEGORIES[0], levels: TIERS.map((_, k) => k), show: () => ({ value: `${i + 1}`, unit: 'уровень' }) }, i, i)}<figcaption><b>${t.name}</b></figcaption></figure>`
).join('');

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Значки достижений Snowwy</title>
<style>
  :root { --bg: #0A1523; --top: #1A3048; --card: #14273B; --text: #CADCEA; --sub: #8FB1C9; --line: rgba(202,220,234,.14); }
  * { box-sizing: border-box; }
  body { margin: 0; background: linear-gradient(180deg, var(--top), var(--bg) 60%) fixed; color: var(--text);
    font: 15px/1.45 -apple-system, "SF Pro Text", Roboto, "Segoe UI", sans-serif; }
  main { max-width: 1100px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 30px; margin: 0 0 6px; letter-spacing: -.3px; }
  .lead { color: var(--sub); margin: 0 0 28px; max-width: 760px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: var(--sub); margin: 34px 0 14px; font-weight: 700; }
  h2 small { font-size: 12px; margin-left: 6px; padding: 2px 8px; border-radius: 10px; background: var(--card); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  figure { margin: 0; padding: 16px 10px 14px; border-radius: 20px; background: rgba(20,39,59,.75); border: 1px solid var(--line);
    display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
  figcaption b { display: block; font-size: 13px; font-weight: 600; }
  figcaption span { display: block; font-size: 12px; color: var(--sub); margin-top: 2px; }
  .note { margin-top: 36px; color: var(--sub); font-size: 13px; }
</style>
</head>
<body>
<main>
  <h1>Значки достижений</h1>
  <p class="lead">${total} значков в пяти категориях. Форма — шестиугольник, как знак Snowwy; иконка категории — та же, что в приложении; материал показывает уровень: от бронзы до северного сияния. У двух старших уровней каждой категории за числом проступает кристалл.</p>
  <section><h2>Уровни</h2><div class="grid">${tierRow}</div></section>
  ${sections.join('\n')}
  <section><h2>Ещё не получены</h2><div class="grid">${lockedRow}</div></section>
  <p class="note">Файлы значков: design/achievements/*.svg. В приложении они будут рисоваться тем же кодом, поэтому выглядят одинаково на iPhone и Android.</p>
</main>
</body>
</html>`;
writeFileSync(join(out, 'preview.html'), html);
console.log(`Готово: ${total} значков, design/achievements/preview.html`);
