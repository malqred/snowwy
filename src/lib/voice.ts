import SnowwyVoice from '../../modules/snowwy-voice';

import { plural } from './format';
import type { Segment, Totals } from './types';

/** Голос доступен только в отдельной сборке для iPhone. */
export const voiceAvailable = SnowwyVoice != null;

/** Фраза об итогах спуска: номер, максимальная скорость, перепад. */
export function runPhrase(run: Segment): string {
  const speed = Math.round(run.maxSpeed * 3.6);
  const vertical = Math.round(run.vertical);
  return (
    `Спуск ${run.n}. ` +
    `Максимальная скорость ${speed} ${plural(speed, 'километр', 'километра', 'километров')} в час. ` +
    `Перепад ${vertical} ${plural(vertical, 'метр', 'метра', 'метров')}.`
  );
}

const meters = (n: number) => `${n} ${plural(n, 'метр', 'метра', 'метров')}`;

/** Фраза на вершине: подъём закончился, на какой высоте оказались. */
export function liftPhrase(lift: Segment): string {
  return `Подъём окончен. Высота ${meters(Math.round(lift.endAlt))}.`;
}

/** Итог дня при завершении катания. */
export function dayPhrase(totals: Totals): string {
  if (totals.runs === 0) return 'Катание завершено.';
  const speed = Math.round(totals.maxSpeed * 3.6);
  const km = (totals.distance / 1000).toFixed(1).replace('.', ',');
  return (
    `Катание завершено. ${totals.runs} ${plural(totals.runs, 'спуск', 'спуска', 'спусков')}, ` +
    `${km} километра, перепад ${meters(Math.round(totals.vertical))}. ` +
    `Максимальная скорость ${speed} ${plural(speed, 'километр', 'километра', 'километров')} в час.`
  );
}

/**
 * Произносит фразу, если подключены наушники; без наушников молчит.
 * Возвращает true, если фраза ушла в наушники.
 */
export async function say(text: string): Promise<boolean> {
  if (!SnowwyVoice) return false;
  try {
    return await SnowwyVoice.speak(text, 'ru-RU');
  } catch {
    return false;
  }
}

/** Есть ли в телефоне русский голос. Если узнать нельзя — считаем, что есть. */
export function russianVoiceInstalled(): boolean {
  try {
    return SnowwyVoice?.hasVoice?.('ru-RU') ?? true;
  } catch {
    return true;
  }
}

/** Отладка на эмуляторе: произносит фразу без наушников. В готовой сборке не используется. */
export async function sayForDebug(text: string): Promise<boolean> {
  if (!__DEV__ || !SnowwyVoice?.speakAnywhere) return false;
  try {
    return await SnowwyVoice.speakAnywhere(text, 'ru-RU');
  } catch {
    return false;
  }
}

export function headphonesConnected(): boolean {
  try {
    return SnowwyVoice?.headphonesConnected() ?? false;
  } catch {
    return false;
  }
}
