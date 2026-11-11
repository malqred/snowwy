/**
 * Посредник для вкладки «Друзья» в Snowwy. Cloudflare Worker + база D1.
 *
 * Хранит для каждой группы список участников и последнюю точку каждого.
 * Имена и точки приходят уже зашифрованными на телефоне: ключа шифрования
 * здесь нет, прочитать их посредник не может. Вместо паролей хранятся их хэши.
 *
 * Приложение само размещает этот файл в аккаунте создателя группы.
 * После правки запустите `node scripts/embed-worker.mjs` и увеличьте VERSION.
 */
const VERSION = 1;

/** Самое длинное тело запроса, байт */
const MAX_BODY = 4096;
/** Самая длинная зашифрованная запись (имя или точка), символов */
const MAX_BLOB = 700;
const MAX_MEMBERS = 50;
const MAX_GROUPS = 20;
/** Точку старше этого не отдаём: человек давно не на склоне, мс */
const POS_TTL = 12 * 3600 * 1000;

const ID = /^[A-Za-z0-9_-]{8,64}$/;
const SECRET = /^[A-Za-z0-9_-]{16,128}$/;
const BLOB = /^[A-Za-z0-9_+/=-]*$/;

const isId = (v) => typeof v === 'string' && ID.test(v);
const isSecret = (v) => typeof v === 'string' && SECRET.test(v);
const isBlob = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_BLOB && BLOB.test(v);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

const fail = (error, status) => json({ error }, status);

async function sha(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

let ready = false;

/** Таблицы создаются при первом запросе. */
async function prepare(db) {
  if (ready) return;
  await db.batch([
    db.prepare(
      'CREATE TABLE IF NOT EXISTS grp (id TEXT PRIMARY KEY, admin TEXT NOT NULL, invite TEXT NOT NULL, owner TEXT NOT NULL, created INTEGER NOT NULL)'
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS member (gid TEXT NOT NULL, id TEXT NOT NULL, token TEXT NOT NULL, name TEXT NOT NULL, pos TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL DEFAULT 0, joined INTEGER NOT NULL, PRIMARY KEY (gid, id))"
    ),
  ]);
  ready = true;
}

/** Ответ со списком участников группы. */
async function list(db, gid, owner, now) {
  const { results } = await db
    .prepare('SELECT id, name, pos, at FROM member WHERE gid = ? ORDER BY joined, id')
    .bind(gid)
    .all();
  return json({
    now,
    owner,
    members: results.map((m) => ({ id: m.id, name: m.name, pos: m.at > now - POS_TTL ? m.pos : '', at: m.at })),
  });
}

/** Проверяет участника. Возвращает владельца группы или готовый ответ с ошибкой. */
async function member(db, b) {
  if (!isId(b.gid) || !isId(b.id) || !isSecret(b.token)) return { error: fail('bad', 400) };
  const row = await db
    .prepare('SELECT g.owner AS owner, m.token AS token FROM grp g LEFT JOIN member m ON m.gid = g.id AND m.id = ? WHERE g.id = ?')
    .bind(b.id, b.gid)
    .first();
  if (!row) return { error: fail('nogroup', 404) };
  if (!row.token) return { error: fail('kicked', 403) };
  if (row.token !== (await sha(b.token))) return { error: fail('auth', 403) };
  return { owner: row.owner };
}

/** Проверяет создателя группы. */
async function admin(db, b) {
  if (!isId(b.gid) || !isSecret(b.admin)) return { error: fail('bad', 400) };
  const row = await db.prepare('SELECT admin, owner FROM grp WHERE id = ?').bind(b.gid).first();
  if (!row) return { error: fail('nogroup', 404) };
  if (row.admin !== (await sha(b.admin))) return { error: fail('auth', 403) };
  return { owner: row.owner };
}

async function handle(request, env) {
  if (request.method === 'GET') return json({ ok: true, snowwy: VERSION });
  if (request.method !== 'POST') return fail('method', 405);

  const text = await request.text();
  if (text.length > MAX_BODY) return fail('size', 413);
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    return fail('bad', 400);
  }
  if (!b || typeof b !== 'object') return fail('bad', 400);

  const db = env.DB;
  await prepare(db);
  const now = Date.now();

  switch (b.op) {
    // Новая группа. Создавать группы может только владелец аккаунта.
    case 'create': {
      if (!isSecret(b.owner) || !env.OWNER_KEY || (await sha(b.owner)) !== (await sha(env.OWNER_KEY))) {
        return fail('owner', 403);
      }
      if (!isId(b.gid) || !isSecret(b.admin) || !isSecret(b.invite)) return fail('bad', 400);
      if (!isId(b.id) || !isSecret(b.token) || !isBlob(b.name)) return fail('bad', 400);
      const count = await db.prepare('SELECT COUNT(*) AS n FROM grp').first();
      if (count.n >= MAX_GROUPS) return fail('groups', 409);
      if (await db.prepare('SELECT id FROM grp WHERE id = ?').bind(b.gid).first()) return fail('exists', 409);
      await db.batch([
        db
          .prepare('INSERT INTO grp (id, admin, invite, owner, created) VALUES (?, ?, ?, ?, ?)')
          .bind(b.gid, await sha(b.admin), await sha(b.invite), b.id, now),
        db
          .prepare('INSERT INTO member (gid, id, token, name, joined) VALUES (?, ?, ?, ?, ?)')
          .bind(b.gid, b.id, await sha(b.token), b.name, now),
      ]);
      return list(db, b.gid, b.id, now);
    }

    // Вход по приглашению
    case 'join': {
      if (!isId(b.gid) || !isSecret(b.invite)) return fail('bad', 400);
      if (!isId(b.id) || !isSecret(b.token) || !isBlob(b.name)) return fail('bad', 400);
      const row = await db
        .prepare('SELECT invite, owner, (SELECT COUNT(*) FROM member WHERE gid = ?) AS n FROM grp WHERE id = ?')
        .bind(b.gid, b.gid)
        .first();
      if (!row) return fail('nogroup', 404);
      if (row.invite !== (await sha(b.invite))) return fail('invite', 403);
      if (row.n >= MAX_MEMBERS) return fail('full', 409);
      const done = await db
        .prepare('INSERT INTO member (gid, id, token, name, joined) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
        .bind(b.gid, b.id, await sha(b.token), b.name, now)
        .run();
      if (!done.meta.changes) return fail('exists', 409);
      return list(db, b.gid, row.owner, now);
    }

    // Отправить свою точку (или убрать её) и получить всех участников
    case 'sync': {
      const who = await member(db, b);
      if (who.error) return who.error;
      if (b.pos !== undefined) {
        if (b.pos !== '' && !isBlob(b.pos)) return fail('bad', 400);
        await db.prepare('UPDATE member SET pos = ?, at = ? WHERE gid = ? AND id = ?').bind(b.pos, now, b.gid, b.id).run();
      }
      if (b.name !== undefined) {
        if (!isBlob(b.name)) return fail('bad', 400);
        await db.prepare('UPDATE member SET name = ? WHERE gid = ? AND id = ?').bind(b.name, b.gid, b.id).run();
      }
      return list(db, b.gid, who.owner, now);
    }

    // Выйти из группы. Создатель не выходит, а удаляет группу.
    case 'leave': {
      const who = await member(db, b);
      if (who.error) return who.error;
      if (who.owner === b.id) return fail('owner', 409);
      await db.prepare('DELETE FROM member WHERE gid = ? AND id = ?').bind(b.gid, b.id).run();
      return json({ ok: true });
    }

    // Исключить участника. Приглашение при этом меняется, чтобы он не вошёл снова.
    case 'kick': {
      const who = await admin(db, b);
      if (who.error) return who.error;
      if (!isId(b.id) || !isSecret(b.invite)) return fail('bad', 400);
      if (b.id === who.owner) return fail('owner', 409);
      await db.batch([
        db.prepare('DELETE FROM member WHERE gid = ? AND id = ?').bind(b.gid, b.id),
        db.prepare('UPDATE grp SET invite = ? WHERE id = ?').bind(await sha(b.invite), b.gid),
      ]);
      return list(db, b.gid, who.owner, now);
    }

    // Сменить приглашение: старое перестаёт действовать
    case 'invite': {
      const who = await admin(db, b);
      if (who.error) return who.error;
      if (!isSecret(b.invite)) return fail('bad', 400);
      await db.prepare('UPDATE grp SET invite = ? WHERE id = ?').bind(await sha(b.invite), b.gid).run();
      return json({ ok: true });
    }

    // Удалить группу со всеми участниками
    case 'remove': {
      const who = await admin(db, b);
      if (who.error) return who.error;
      await db.batch([
        db.prepare('DELETE FROM member WHERE gid = ?').bind(b.gid),
        db.prepare('DELETE FROM grp WHERE id = ?').bind(b.gid),
      ]);
      return json({ ok: true });
    }

    default:
      return fail('bad', 400);
  }
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch {
      return fail('server', 500);
    }
  },
};
