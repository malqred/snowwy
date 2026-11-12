// Шкала графиков: «круглые» деления по оси значений и значение под пальцем.
// Без React — проверяется тестами в Node.

/** Деления оси: круглый шаг (1, 2, 5 × 10ⁿ) и границы, кратные шагу. */
export function niceScale(min: number, max: number, count = 4): { min: number; max: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (max - min < 1e-9) {
    // Плоская линия: раздвигаем шкалу, чтобы линия легла посередине
    const pad = Math.max(Math.abs(max) * 0.1, 1);
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(count - 1, 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * power).find((s) => s >= raw - 1e-9) ?? 10 * power;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { min: lo, max: hi, ticks };
}

/**
 * Значение линии в точке `at` (0..1 ширины графика).
 * Линия занимает долю `part` ширины: правее её конца значения нет.
 */
export function valueAt(series: number[], at: number, part = 1): number | null {
  if (series.length === 0 || part <= 0) return null;
  const f = at / part;
  if (f < 0 || f > 1 + 1e-9) return null;
  if (series.length === 1) return series[0];
  const x = Math.min(f, 1) * (series.length - 1);
  const i = Math.floor(x);
  const j = Math.min(i + 1, series.length - 1);
  return series[i] + (series[j] - series[i]) * (x - i);
}
