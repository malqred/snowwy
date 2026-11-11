// Аккаунт Cloudflare создателя группы: приложение само размещает в нём посредника.
// Ключ доступа хранится только в защищённом хранилище iPhone.
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { ping } from './api';
import { randomLower, randomSecret } from './crypto';
import { WORKER_SOURCE, WORKER_VERSION } from './worker-source';

const API = 'https://api.cloudflare.com/client/v4';
const TOKEN_KEY = 'friends.account';
const SERVER_KEY = 'friends.server';
const DB_NAME = 'snowwy-friends';

/** Страница регистрации Cloudflare. */
export const SIGNUP_URL = 'https://dash.cloudflare.com/sign-up';
/** Страница, где ключи доступа создаются и удаляются. */
export const TOKENS_URL = 'https://dash.cloudflare.com/profile/api-tokens';
/** Страница создания ключа с уже выбранными правами: только Workers и база D1. */
export const NEW_TOKEN_URL =
  `${TOKENS_URL}?permissionGroupKeys=` +
  encodeURIComponent(
    JSON.stringify([
      { key: 'workers_scripts', type: 'edit' },
      { key: 'd1', type: 'edit' },
      { key: 'account_settings', type: 'read' },
    ])
  ) +
  '&accountId=*&zoneId=all&name=Snowwy';

type Account = { token: string; accountId: string; accountName: string };

/** Размещённый посредник. Остаётся в памяти телефона и после выхода из аккаунта. */
export type Server = {
  accountId: string;
  script: string;
  db: string;
  url: string;
  /** Пароль, без которого посредник не создаёт группы */
  ownerKey: string;
  version: number;
};

export type AccountState = {
  connected: boolean;
  accountName: string | null;
  server: Server | null;
};

function read<T>(key: string): T | null {
  try {
    const raw = SecureStore.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

let account = read<Account>(TOKEN_KEY);
let server = read<Server>(SERVER_KEY);
let snapshot: AccountState = { connected: !!account, accountName: account?.accountName ?? null, server };
const listeners = new Set<() => void>();

function publish() {
  snapshot = { connected: !!account, accountName: account?.accountName ?? null, server };
  listeners.forEach((l) => l());
}

async function saveAccount(next: Account | null) {
  account = next;
  if (next) await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(next));
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
  publish();
}

async function saveServer(next: Server | null) {
  server = next;
  if (next) await SecureStore.setItemAsync(SERVER_KEY, JSON.stringify(next));
  else await SecureStore.deleteItemAsync(SERVER_KEY);
  publish();
}

/** Ошибка Cloudflare с текстом для человека. network — запрос не дошёл или ответ не пришёл. */
export class CloudflareError extends Error {
  network: boolean;
  constructor(message: string, network = false) {
    super(message);
    this.network = network;
  }
}

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

type Reply<T> = { success?: boolean; result?: T; errors?: { code?: number; message?: string }[] };

/** Один запрос; обрыв связи или молчание дольше 30 секунд — CloudflareError с пометкой network. */
async function send(token: string, path: string, init: RequestInit): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 30000);
  try {
    return await fetch(API + path, {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) },
      signal: abort.signal,
    });
  } catch {
    throw new CloudflareError(
      'Нет связи с Cloudflare. Проверьте интернет; если включён VPN, попробуйте другой его сервер или выключите VPN на время подключения.',
      true
    );
  } finally {
    clearTimeout(timer);
  }
}

async function cf<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  // Через VPN и на слабой связи запросы иногда обрываются — пробуем до трёх раз.
  // Повтор безопасен: каждый запрос здесь можно выполнить дважды с тем же итогом.
  let res: Response | null = null;
  for (let attempt = 0; res == null; attempt++) {
    try {
      res = await send(token, path, init);
    } catch (e) {
      if (attempt >= 2) throw e;
      await pause(1500 * (attempt + 1));
    }
  }
  let data: Reply<T> | null = null;
  try {
    data = (await res.json()) as Reply<T>;
  } catch {
    // ниже разберёмся по коду ответа
  }
  if (res.ok && data?.success !== false) return data?.result as T;
  const first = data?.errors?.[0];
  // При проверке в Expo Go причина отказа видна в журнале на компьютере (ключ туда не попадает)
  if (__DEV__) {
    console.warn('[cloudflare]', init.method ?? 'GET', path.split('?')[0], res.status, first?.code, first?.message);
  }
  if (first?.code === 10034 || /verify your email/i.test(first?.message ?? '')) {
    throw new CloudflareError(
      'Cloudflare просит сначала подтвердить почту: откройте письмо от Cloudflare, перейдите по ссылке и повторите.'
    );
  }
  if (res.status === 429) {
    throw new CloudflareError('Cloudflare временно ограничил запросы. Подождите минуту и повторите.');
  }
  if (res.status === 401) {
    throw new CloudflareError('Cloudflare не принял ключ доступа. Проверьте, что он скопирован целиком и не удалён.');
  }
  if (res.status === 403) {
    throw new CloudflareError(
      'У ключа доступа не хватает прав. Нужны три: Workers Scripts — Edit, D1 — Edit, Account Settings — Read.'
    );
  }
  throw new CloudflareError(
    first?.message
      ? `Cloudflare ответил ошибкой ${first.code ?? res.status}: ${first.message}`
      : `Cloudflare ответил ошибкой ${res.status}.`
  );
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** Доступен ли Cloudflare из текущей сети. */
export async function cloudflareReachable(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 12000);
    try {
      // Любой ответ значит, что Cloudflare достижим
      await fetch(`${API}/ips`, { signal: abort.signal });
      return true;
    } catch {
      // попробуем ещё раз
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

/** Тело запроса из двух частей: описание и сам код посредника. */
function scriptUpload(db: string, ownerKey: string): RequestInit {
  const boundary = `----snowwy${randomLower(24)}`;
  const metadata = {
    main_module: 'worker.js',
    compatibility_date: '2025-09-01',
    bindings: [
      { type: 'd1', name: 'DB', id: db },
      { type: 'secret_text', name: 'OWNER_KEY', text: ownerKey },
    ],
  };
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="metadata"',
    'Content-Type: application/json',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
    'Content-Type: application/javascript+module',
    '',
    WORKER_SOURCE,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { method: 'PUT', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body };
}

/** Адрес вида «имя.workers.dev», общий для всего аккаунта. У нового аккаунта его ещё нет. */
async function subdomain(token: string, accountId: string): Promise<{ name: string; created: boolean }> {
  try {
    const found = await cf<{ subdomain?: string | null }>(token, `/accounts/${accountId}/workers/subdomain`);
    if (found?.subdomain) return { name: found.subdomain, created: false };
  } catch (e) {
    // У аккаунта, где Workers ещё не открывали, адреса нет — создадим ниже.
    // Нет связи — создавать нельзя: адрес может уже существовать.
    if (!(e instanceof CloudflareError) || e.network) throw e;
  }
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const name = `snowwy-${randomLower(10)}`;
      const made = await cf<{ subdomain?: string }>(token, `/accounts/${accountId}/workers/subdomain`, {
        ...json({ subdomain: name }),
        method: 'PUT',
      });
      return { name: made?.subdomain ?? name, created: true };
    } catch (e) {
      last = e;
      if (e instanceof CloudflareError && e.network) break;
    }
  }
  throw last;
}

/** Сервер Snowwy, уже размещённый в аккаунте раньше (с другого телефона или прерванной попыткой). */
async function findScript(token: string, accountId: string): Promise<string | null> {
  try {
    const scripts = await cf<{ id?: string }[]>(token, `/accounts/${accountId}/workers/scripts`);
    return scripts?.map((s) => s.id ?? '').find((id) => /^snowwy-[a-z0-9]{12}$/.test(id)) ?? null;
  } catch {
    return null;
  }
}

async function findDatabase(token: string, accountId: string): Promise<string | undefined> {
  const found = await cf<{ uuid: string; name: string }[]>(token, `/accounts/${accountId}/d1/database?name=${DB_NAME}`);
  return found?.find((d) => d.name === DB_NAME)?.uuid;
}

/**
 * Ждёт, пока адрес сервера начнёт отвечать. У нового аккаунта на это уходит до нескольких минут.
 * false — не дождались (сервер при этом размещён и заработает позже).
 */
export async function serverOnline(url: string, tries = 40): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt++) {
    if ((await ping(url, 6000)) != null) return true;
    if (attempt < tries - 1) await pause(3000);
  }
  return false;
}

/**
 * Размещает посредника в аккаунте (или обновляет уже размещённого).
 * fresh — адрес аккаунта только что создан и начнёт отвечать не сразу.
 */
async function deploy(
  token: string,
  accountId: string,
  old: Server | null,
  onStep: (text: string) => void
): Promise<{ server: Server; fresh: boolean }> {
  const reuse = old && old.accountId === accountId ? old : null;

  onStep('Создаю хранилище группы…');
  let db = reuse?.db ?? (await findDatabase(token, accountId));
  if (!db) {
    try {
      db = (await cf<{ uuid: string }>(token, `/accounts/${accountId}/d1/database`, json({ name: DB_NAME }))).uuid;
    } catch (e) {
      // Запрос мог дойти, а ответ потеряться — тогда хранилище уже создано
      db = await findDatabase(token, accountId).catch(() => undefined);
      if (!db) throw e;
    }
  }

  onStep('Размещаю сервер группы…');
  // Сервер, оставшийся от прошлого подключения, берём тот же: его адрес записан в приглашениях
  const script = reuse?.script ?? (await findScript(token, accountId)) ?? `snowwy-${randomLower(12)}`;
  const ownerKey = reuse?.ownerKey ?? randomSecret();
  await cf(token, `/accounts/${accountId}/workers/scripts/${script}`, scriptUpload(db, ownerKey));

  onStep('Включаю адрес сервера…');
  const sub = await subdomain(token, accountId);
  await cf(
    token,
    `/accounts/${accountId}/workers/scripts/${script}/subdomain`,
    json({ enabled: true, previews_enabled: false })
  );
  return {
    server: { accountId, script, db, url: `https://${script}.${sub.name}.workers.dev`, ownerKey, version: WORKER_VERSION },
    fresh: sub.created,
  };
}

/**
 * Подключает аккаунт по ключу доступа и размещает в нём посредника.
 * Бросает CloudflareError с понятным текстом.
 * Возвращает false, если всё размещено, но адрес сервера ещё не начал отвечать.
 */
export async function connectAccount(rawToken: string, onStep: (text: string) => void): Promise<boolean> {
  const token = rawToken.trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new CloudflareError('Это не похоже на ключ доступа: в нём только латинские буквы, цифры, «-» и «_».');
  }
  onStep('Проверяю ключ доступа…');
  const check = await cf<{ status?: string }>(token, '/user/tokens/verify');
  if (check?.status !== 'active') throw new CloudflareError('Этот ключ доступа выключен или просрочен.');

  const accounts = await cf<{ id: string; name: string }[]>(token, '/accounts');
  const first = accounts?.[0];
  if (!first) {
    throw new CloudflareError('Ключ не открывает ни одного аккаунта. Создайте его заново по ссылке из приложения.');
  }
  const { server: next, fresh } = await deploy(token, first.id, server, onStep);
  // Сохраняем сразу: если адрес ещё не отвечает, повторное подключение не создаст второй сервер
  await saveServer(next);
  await saveAccount({ token, accountId: first.id, accountName: first.name });

  onStep(fresh ? 'Жду, пока адрес сервера заработает. У нового аккаунта это до пары минут…' : 'Проверяю сервер…');
  // Спрашивать новый адрес слишком рано нельзя: сеть запомнит, что его нет, и будет повторять это ещё долго
  if (fresh) await pause(20000);
  return serverOnline(next.url);
}

/**
 * Посредник для новой группы. Если в приложении более новая версия посредника
 * и аккаунт подключён — сначала обновляет его.
 */
export async function ensureServer(onStep: (text: string) => void = () => {}): Promise<Server | null> {
  if (!server) return null;
  if (account && account.accountId === server.accountId && server.version < WORKER_VERSION) {
    await saveServer((await deploy(account.token, account.accountId, server, onStep)).server);
  }
  return server;
}

/** Выход: приложение забывает ключ доступа. Посредник и группы продолжают работать. */
export async function disconnectAccount(): Promise<void> {
  await saveAccount(null);
}

/** Удаляет посредника и его хранилище из аккаунта Cloudflare. Нужен подключённый аккаунт. */
export async function destroyServer(): Promise<void> {
  if (!account || !server) return;
  if (account.accountId !== server.accountId) {
    throw new CloudflareError('Сервер размещён в другом аккаунте Cloudflare. Подключите тот аккаунт и повторите.');
  }
  const { token, accountId } = account;
  await cf(token, `/accounts/${accountId}/workers/scripts/${server.script}?force=true`, { method: 'DELETE' });
  await cf(token, `/accounts/${accountId}/d1/database/${server.db}`, { method: 'DELETE' });
  await saveServer(null);
}

export function getServer(): Server | null {
  return server;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAccount(): AccountState {
  return useSyncExternalStore(subscribe, () => snapshot);
}
