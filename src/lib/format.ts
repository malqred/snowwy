const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** Число с запятой в качестве десятичного разделителя. */
export function num(value: number, digits = 0): string {
  return value.toFixed(digits).replace('.', ',');
}

/** Скорость: м/с → км/ч. */
export function kmh(ms: number, digits = 0): string {
  return num(ms * 3.6, digits);
}

/** Расстояние в километрах (без единицы). */
export function km(m: number): string {
  return num(m / 1000, m >= 100000 ? 0 : 1);
}

/** Расстояние с подходящей единицей. */
export function distance(m: number): { value: string; unit: string } {
  if (m < 1000) return { value: num(m), unit: 'м' };
  return { value: num(m / 1000, m >= 100000 ? 0 : 1), unit: 'км' };
}

/** Целое число с разделением тысяч: 12 480. */
export function int(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Длительность: 3:42 или 1:02:15. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Длительность словами: 4 ч 12 мин. */
export function span(seconds: number): string {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/** «через 25 мин», «через 1 ч 10 мин» */
export function inTime(ms: number): string {
  const total = Math.round(ms / 60000);
  if (total <= 0) return 'сейчас';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `через ${m} мин` : m === 0 ? `через ${h} ч` : `через ${h} ч ${m} мин`;
}

/** Время суток: 10:42. */
export function time(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

/** Дата: 15 января, чт. */
export function date(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`;
}

const WEEKDAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Части даты для плитки дня: число, короткий месяц, день недели. */
export function dateParts(ts: number): { day: string; month: string; weekday: string } {
  const d = new Date(ts);
  return { day: `${d.getDate()}`, month: MONTHS_SHORT[d.getMonth()], weekday: WEEKDAYS_FULL[d.getDay()] };
}

/** Короткая дата: 15 янв 2026. */
export function dateShort(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** Дата с годом: 15 января 2026. */
export function dateLong(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Дата для имени файла: 2026-01-15. */
export function dateIso(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Склонение: plural(3, 'спуск', 'спуска', 'спусков') → «спуска». */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const runsWord = (n: number) => plural(n, 'спуск', 'спуска', 'спусков');
export const daysWord = (n: number) => plural(n, 'день', 'дня', 'дней');

/** Сезон катания: с июля по июнь. Возвращает год начала сезона. */
export function seasonOf(ts: number): number {
  const d = new Date(ts);
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

/** Название сезона: «Сезон 2026/27». */
export function seasonTitle(startYear: number): string {
  return `Сезон ${startYear}/${pad((startYear + 1) % 100)}`;
}
