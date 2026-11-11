// Шифрование для вкладки «Друзья». Имена и точки шифруются на телефоне ключом группы
// (AES-256-GCM), поэтому посредник в интернете видит только набор символов.
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytes } from 'expo-crypto';

import { fromBase64, fromUtf8, toBase64, utf8 } from './codec';

const LOWER = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Случайный идентификатор: 16 символов. */
export const randomId = () => toBase64(getRandomBytes(12));
/** Случайный пароль: 32 символа. */
export const randomSecret = () => toBase64(getRandomBytes(24));
/** Ключ шифрования группы: 32 байта. */
export const randomKey = () => toBase64(getRandomBytes(32));
/** Случайное имя из строчных букв и цифр — для адресов. */
export function randomLower(length: number): string {
  let out = '';
  for (const b of getRandomBytes(length)) out += LOWER[b % LOWER.length];
  return out;
}

const keys = new Map<string, Promise<AESEncryptionKey>>();

function keyOf(key: string): Promise<AESEncryptionKey> {
  let ready = keys.get(key);
  if (!ready) {
    ready = AESEncryptionKey.import(fromBase64(key));
    keys.set(key, ready);
  }
  return ready;
}

/**
 * Шифрует значение ключом группы.
 * scope привязывает запись к месту (группа, участник, вид записи): посредник не сможет
 * выдать точку одного участника за точку другого — такая запись не расшифруется.
 */
export async function seal(key: string, scope: string, value: unknown): Promise<string> {
  const sealed = await aesEncryptAsync(utf8(JSON.stringify(value)), await keyOf(key), { additionalData: utf8(scope) });
  return toBase64(await sealed.combined());
}

/** Расшифровывает запись. null — не расшифровалась (чужой ключ, подмена, повреждение). */
export async function unseal<T>(key: string, scope: string, blob: string): Promise<T | null> {
  if (!blob) return null;
  try {
    const sealed = AESSealedData.fromCombined(fromBase64(blob));
    const bytes = await aesDecryptAsync(sealed, await keyOf(key), { additionalData: utf8(scope) });
    return JSON.parse(fromUtf8(bytes)) as T;
  } catch {
    return null;
  }
}
