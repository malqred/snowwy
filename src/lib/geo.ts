// Где человек относительно меня: расстояние, сторона света и разница высот.
// Без зависимостей от телефона — проверяется тестами (tests/geo.test.mjs).

export type Spot = { lat: number; lon: number; alt?: number | null };

export type Relative = {
  /** По прямой, м */
  distance: number;
  /** Направление от меня, градусы от севера по часовой */
  bearing: number;
  /** Насколько он выше меня, м; null — высота неизвестна */
  above: number | null;
};

const R = 6371000;
const RAD = Math.PI / 180;

/** Расстояние по поверхности Земли, м (та же формула, что в analyze.ts). */
function distanceBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function relative(me: Spot, other: Spot): Relative {
  const y = Math.sin((other.lon - me.lon) * RAD) * Math.cos(other.lat * RAD);
  const x =
    Math.cos(me.lat * RAD) * Math.sin(other.lat * RAD) -
    Math.sin(me.lat * RAD) * Math.cos(other.lat * RAD) * Math.cos((other.lon - me.lon) * RAD);
  const bearing = (Math.atan2(y, x) / RAD + 360) % 360;
  const above = me.alt != null && other.alt != null ? other.alt - me.alt : null;
  return { distance: distanceBetween(me.lat, me.lon, other.lat, other.lon), bearing, above };
}

const SIDES = [
  ['на север', '↑'],
  ['на северо-восток', '↗'],
  ['на восток', '→'],
  ['на юго-восток', '↘'],
  ['на юг', '↓'],
  ['на юго-запад', '↙'],
  ['на запад', '←'],
  ['на северо-запад', '↖'],
] as const;

/** «на северо-восток» и стрелка для направления. */
export function side(bearing: number): { word: string; arrow: string } {
  const [word, arrow] = SIDES[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
  return { word, arrow };
}

/** Расстояние словами: 80 м, 350 м, 1,2 км. */
export function far(m: number): string {
  if (m < 995) return `${Math.max(10, Math.round(m / 10) * 10)} м`;
  return `${(m / 1000).toFixed(m < 9950 ? 1 : 0).replace('.', ',')} км`;
}

/** Ближе этого — «рядом с вами», м */
const NEAR = 15;
/** Разница высот меньше этой не упоминается, м */
const SAME_HEIGHT = 10;

/** «350 м ↗ · выше на 120 м» — коротко, для списка. */
export function relativeShort(r: Relative): string {
  if (r.distance < NEAR) return 'рядом с вами';
  const { arrow } = side(r.bearing);
  const height =
    r.above == null || Math.abs(r.above) < SAME_HEIGHT ? '' : ` · ${r.above > 0 ? 'выше' : 'ниже'} на ${Math.round(Math.abs(r.above))} м`;
  return `${far(r.distance)} ${arrow}${height}`;
}

/** «350 м на северо-восток, выше вас на 120 м» — подробно, для карточки. */
export function relativeLong(r: Relative): string {
  if (r.distance < NEAR) return 'Рядом с вами';
  const height =
    r.above == null
      ? ''
      : Math.abs(r.above) < SAME_HEIGHT
        ? ', на той же высоте'
        : `, ${r.above > 0 ? 'выше' : 'ниже'} вас на ${Math.round(Math.abs(r.above))} м`;
  return `${far(r.distance)} ${side(r.bearing).word}${height}`;
}

/** Цвет заряда: красный — почти сел, оранжевый — меньше половины, зелёный — хватит. */
export function batteryColor(level: number): string {
  if (level <= 20) return '#E5484D';
  if (level <= 50) return '#F0A23B';
  return '#4CB05A';
}
