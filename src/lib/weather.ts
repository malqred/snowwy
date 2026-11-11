import type { Weather } from './types';

const TIMEOUT = 10000;

/**
 * Запрашивает текущую погоду в точке (бесплатный сервис Open-Meteo, без регистрации).
 * Координаты округляются примерно до километра. Нет интернета — вернёт null.
 */
export async function fetchWeather(lat: number, lon: number, alt: number): Promise<Weather | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&elevation=${Math.round(alt)}` +
      '&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,snowfall,weather_code,snow_depth' +
      '&wind_speed_unit=ms';
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const current = ((await res.json()) as { current?: Record<string, unknown> }).current;
    const value = (key: string) => (typeof current?.[key] === 'number' ? (current[key] as number) : null);
    const temp = value('temperature_2m');
    if (temp == null) return null;
    return {
      temp,
      feels: value('apparent_temperature') ?? temp,
      wind: value('wind_speed_10m') ?? 0,
      gusts: value('wind_gusts_10m') ?? 0,
      code: value('weather_code') ?? -1,
      snowfall: value('snowfall') ?? 0,
      snowDepth: value('snow_depth'),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Название погоды по коду ВМО. */
export function weatherTitle(code: number): string {
  if (code === 0) return 'Ясно';
  if (code === 1) return 'Малооблачно';
  if (code === 2) return 'Переменная облачность';
  if (code === 3) return 'Пасмурно';
  if (code === 45 || code === 48) return 'Туман';
  if (code >= 51 && code <= 57) return 'Морось';
  if (code >= 61 && code <= 67) return 'Дождь';
  if (code === 71) return 'Небольшой снег';
  if (code === 73) return 'Снег';
  if (code === 75) return 'Сильный снег';
  if (code === 77) return 'Снежная крупа';
  if (code >= 80 && code <= 82) return 'Ливень';
  if (code === 85 || code === 86) return 'Снегопад';
  if (code >= 95) return 'Гроза';
  return 'Погода';
}

/** Температура со знаком: «−6°», «+2°», «0°». */
export function degrees(value: number): string {
  const n = Math.round(value);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}°`;
}
