// Запросы к посреднику группы.

/** Ошибка посредника. code: network — нет связи, остальные приходят от посредника. */
export class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const TIMEOUT = 15000;

async function request(url: string, init: RequestInit, timeout = TIMEOUT): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);
  const started = Date.now();
  try {
    return await fetch(url, { ...init, signal: abort.signal });
  } catch (e) {
    // При проверке в Expo Go причина обрыва видна в журнале на компьютере
    if (__DEV__) {
      const why = abort.signal.aborted ? `нет ответа за ${timeout} мс` : String(e);
      console.warn('[friends] запрос не прошёл:', why, `(${Date.now() - started} мс)`);
    }
    throw new ApiError('network');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Один запрос к посреднику. Бросает ApiError.
 * retries — сколько раз повторить, если запрос оборвался (через VPN и на слабой связи такое бывает).
 * Повторять можно только запросы, которые безопасно выполнить дважды.
 * timeout — сколько ждать ответа на одну попытку, мс.
 */
export async function call<T>(
  url: string,
  body: Record<string, unknown>,
  retries = 0,
  timeout = TIMEOUT
): Promise<T> {
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  let res: Response | null = null;
  for (let attempt = 0; res == null; attempt++) {
    try {
      res = await request(url, init, timeout);
    } catch (e) {
      if (attempt >= retries) throw e;
      await new Promise((done) => setTimeout(done, 800));
    }
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // ниже разберёмся по коду ответа
  }
  if (!res.ok) {
    const code = (data as { error?: unknown } | null)?.error;
    throw new ApiError(typeof code === 'string' ? code : res.status === 429 ? 'limit' : 'server');
  }
  if (!data) throw new ApiError('server');
  return data as T;
}

/** Проверка связи: версия посредника или null, если он не отвечает. */
export async function ping(url: string, timeout = 8000): Promise<number | null> {
  try {
    const res = await request(url, { method: 'GET' }, timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { snowwy?: unknown };
    return typeof data.snowwy === 'number' ? data.snowwy : null;
  } catch {
    return null;
  }
}

/** Понятный текст ошибки для человека. */
export function errorText(error: unknown): string {
  const code = error instanceof ApiError ? error.code : '';
  switch (code) {
    case 'network':
      return 'Нет связи с сервером группы. Проверьте интернет и попробуйте ещё раз.';
    case 'invite':
      return 'Это приглашение больше не действует. Попросите у создателя группы новое.';
    case 'nogroup':
      return 'Такой группы больше нет.';
    case 'full':
      return 'В группе уже 50 человек — больше не помещается.';
    case 'groups':
      return 'На этом сервере уже 20 групп. Удалите ненужную и попробуйте снова.';
    case 'exists':
      return 'Вы уже состоите в этой группе.';
    case 'owner':
      return 'Сервер не принял ключ владельца. Подключите аккаунт Cloudflare заново.';
    case 'limit':
      return 'Сервер группы исчерпал суточный лимит запросов. Он заработает после полуночи по Гринвичу.';
    default:
      return 'Сервер группы ответил ошибкой. Попробуйте ещё раз чуть позже.';
  }
}
