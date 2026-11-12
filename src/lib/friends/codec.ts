// Кодирование для вкладки «Друзья»: байты ↔ текст и приглашения.
// Без зависимостей от телефона, чтобы всё это проверялось тестами.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET[i]] = i;
// Обычный base64 тоже читаем
LOOKUP['+'] = 62;
LOOKUP['/'] = 63;

/** Байты → base64url без знаков «=». */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (i + 1 < bytes.length) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (i + 2 < bytes.length) out += ALPHABET[c & 63];
  }
  return out;
}

/** base64 или base64url → байты. Бросает ошибку на постороннем символе. */
export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let n = 0;
  for (const ch of clean) {
    const v = LOOKUP[ch];
    if (v === undefined) throw new Error('base64');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 255;
    }
  }
  return out.slice(0, n);
}

/** Текст → байты UTF-8. */
export function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/** Байты UTF-8 → текст. */
export function fromUtf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const a = bytes[i++];
    let c = a;
    if (a >= 0xf0) c = ((a & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else if (a >= 0xe0) c = ((a & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else if (a >= 0xc0) c = ((a & 31) << 6) | (bytes[i++] & 63);
    out += String.fromCodePoint(c);
  }
  return out;
}

/** Что нужно знать, чтобы войти в группу. */
export type Invite = {
  /** Адрес посредника */
  url: string;
  /** Группа */
  gid: string;
  /** Пароль для входа; меняется, когда кого-то исключают */
  invite: string;
  /** Ключ шифрования группы */
  key: string;
};

const SCHEME = 'snowwy://friends/join?d=';
const PART = /^[A-Za-z0-9_-]+$/;
/**
 * Только в отладочной сборке: сервер группы на компьютере, к которому эмулятор Android
 * обращается по 10.0.2.2. В готовой сборке __DEV__ = false и принимается только https.
 */
const DEV_SERVER = /^http:\/\/10\.0\.2\.2:\d+$/;
const devBuild = () => typeof __DEV__ !== 'undefined' && __DEV__;

/** Приглашение одной строкой: ссылка, которая открывает приложение. */
export function inviteLink(v: Invite): string {
  return SCHEME + toBase64(utf8(JSON.stringify([1, v.url, v.gid, v.invite, v.key])));
}

/** Разбирает приглашение: ссылку целиком или только код из неё. null — это не приглашение. */
export function parseInvite(text: string): Invite | null {
  const trimmed = text.trim();
  const at = trimmed.indexOf('d=');
  const code = (at >= 0 ? trimmed.slice(at + 2) : trimmed).split(/[&#\s]/)[0];
  if (!code || !PART.test(code)) return null;
  try {
    const data: unknown = JSON.parse(fromUtf8(fromBase64(code)));
    if (!Array.isArray(data) || data[0] !== 1) return null;
    const [, url, gid, invite, key] = data;
    if (typeof url !== 'string') return null;
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(url) && !(devBuild() && DEV_SERVER.test(url))) return null;
    if (![gid, invite, key].every((p) => typeof p === 'string' && PART.test(p))) return null;
    if (fromBase64(key).length !== 32) return null;
    return { url, gid, invite, key };
  } catch {
    return null;
  }
}

/** «20 с», «5 мин», «2 ч» — сколько прошло с последнего обновления. */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} с`;
  if (s < 3600) return `${Math.floor(s / 60)} мин`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч`;
  return `${Math.floor(s / 86400)} дн`;
}
