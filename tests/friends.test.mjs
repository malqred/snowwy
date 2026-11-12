// Запуск: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { build, target } from '../scripts/embed-worker.mjs';
import worker from '../server/worker.mjs';
import { ago, fromBase64, fromUtf8, inviteLink, parseInvite, toBase64, utf8 } from '../src/lib/friends/codec.ts';

/** База D1 в памяти: те же вызовы, что у Cloudflare, поверх SQLite из Node. */
// Посредник создаёт таблицы один раз за запуск, поэтому база на все тесты одна,
// а перед каждым тестом она очищается.
const sqlite = new DatabaseSync(':memory:');

function fakeD1() {
  for (const table of ['grp', 'member']) {
    try {
      sqlite.exec(`DELETE FROM ${table}`);
    } catch {
      // таблиц ещё нет
    }
  }
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
  });
  return {
    prepare: (sql) => statement(sql),
    batch: async (list) => Promise.all(list.map((s) => s.run())),
  };
}

const OWNER_KEY = 'owner-key-0123456789';
const GID = 'group-000001';
const ADMIN = 'admin-secret-0123456789';
const INVITE = 'invite-secret-0123456789';

function server() {
  const env = { DB: fakeD1(), OWNER_KEY };
  const call = async (body) => {
    const res = await worker.fetch(
      new Request('https://example.workers.dev/', { method: 'POST', body: JSON.stringify(body) }),
      env
    );
    return { status: res.status, body: await res.json() };
  };
  return { env, call };
}

const person = (n) => ({ id: `member-${n}-0000`, token: `token-${n}-0123456789abcdef`, name: `bmFtZS0${n}` });

async function group(call) {
  const res = await call({ op: 'create', owner: OWNER_KEY, gid: GID, admin: ADMIN, invite: INVITE, ...person(1) });
  assert.equal(res.status, 200);
  return res;
}

test('посредник отвечает на проверку связи', async () => {
  const res = await worker.fetch(new Request('https://example.workers.dev/'), { DB: fakeD1(), OWNER_KEY });
  assert.deepEqual(await res.json(), { ok: true, snowwy: 3 });
});

test('группу создаёт только владелец аккаунта', async () => {
  const { call } = server();
  const stranger = await call({ op: 'create', owner: 'wrong-key-0123456789', gid: GID, admin: ADMIN, invite: INVITE, ...person(1) });
  assert.equal(stranger.status, 403);
  assert.equal(stranger.body.error, 'owner');

  const mine = await group(call);
  assert.equal(mine.body.owner, person(1).id);
  assert.equal(mine.body.members.length, 1);

  const again = await call({ op: 'create', owner: OWNER_KEY, gid: GID, admin: ADMIN, invite: INVITE, ...person(1) });
  assert.equal(again.body.error, 'exists');
});

test('вход по приглашению и обмен точками', async () => {
  const { call } = server();
  await group(call);

  const wrong = await call({ op: 'join', gid: GID, invite: 'not-the-invite-0123456789', ...person(2) });
  assert.equal(wrong.body.error, 'invite');
  const none = await call({ op: 'join', gid: 'group-999999', invite: INVITE, ...person(2) });
  assert.equal(none.body.error, 'nogroup');

  const joined = await call({ op: 'join', gid: GID, invite: INVITE, ...person(2) });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.members.length, 2);
  const twice = await call({ op: 'join', gid: GID, invite: INVITE, ...person(2) });
  assert.equal(twice.body.error, 'exists');

  // Второй отправляет точку — первый её видит
  const { id, token } = person(2);
  const sent = await call({ op: 'sync', gid: GID, id, token, pos: 'cG9zaXRpb24' });
  assert.equal(sent.status, 200);
  const seen = await call({ op: 'sync', gid: GID, id: person(1).id, token: person(1).token });
  const other = seen.body.members.find((m) => m.id === id);
  assert.equal(other.pos, 'cG9zaXRpb24');
  assert.ok(other.at > 0 && other.at <= seen.body.now);
  // Чтение чужих точек свою не трогает
  assert.equal(seen.body.members.find((m) => m.id === person(1).id).at, 0);

  // Пустая точка убирает человека с карты, время остаётся
  const cleared = await call({ op: 'sync', gid: GID, id, token, pos: '' });
  const after = cleared.body.members.find((m) => m.id === id);
  assert.equal(after.pos, '');
  assert.ok(after.at > 0);

  // Имя меняет только сам участник
  const renamed = await call({ op: 'sync', gid: GID, id, token, name: 'bmV3LW5hbWU' });
  assert.equal(renamed.body.members.find((m) => m.id === id).name, 'bmV3LW5hbWU');
});

test('чужой пароль не подходит, старые точки не отдаются', async () => {
  const { call, env } = server();
  await group(call);
  await call({ op: 'join', gid: GID, invite: INVITE, ...person(2) });

  const forged = await call({ op: 'sync', gid: GID, id: person(2).id, token: person(1).token, pos: 'ZmFrZQ' });
  assert.equal(forged.status, 403);
  assert.equal(forged.body.error, 'auth');

  await call({ op: 'sync', gid: GID, id: person(2).id, token: person(2).token, pos: 'b2xk' });
  await env.DB.prepare('UPDATE member SET at = ? WHERE id = ?').bind(Date.now() - 13 * 3600 * 1000, person(2).id).run();
  const seen = await call({ op: 'sync', gid: GID, id: person(1).id, token: person(1).token });
  assert.equal(seen.body.members.find((m) => m.id === person(2).id).pos, '');
});

test('создатель исключает участника, и тот не может вернуться по старому приглашению', async () => {
  const { call } = server();
  await group(call);
  await call({ op: 'join', gid: GID, invite: INVITE, ...person(2) });
  await call({ op: 'join', gid: GID, invite: INVITE, ...person(3) });

  // Обычный участник исключать не может
  const notAdmin = await call({ op: 'kick', gid: GID, admin: person(2).token, id: person(3).id, invite: 'next-invite-0123456789' });
  assert.equal(notAdmin.status, 403);
  // Создателя исключить нельзя
  const self = await call({ op: 'kick', gid: GID, admin: ADMIN, id: person(1).id, invite: 'next-invite-0123456789' });
  assert.equal(self.body.error, 'owner');

  const kicked = await call({ op: 'kick', gid: GID, admin: ADMIN, id: person(2).id, invite: 'next-invite-0123456789' });
  assert.equal(kicked.status, 200);
  assert.deepEqual(
    kicked.body.members.map((m) => m.id),
    [person(1).id, person(3).id]
  );

  const sync = await call({ op: 'sync', gid: GID, id: person(2).id, token: person(2).token });
  assert.equal(sync.body.error, 'kicked');
  const back = await call({ op: 'join', gid: GID, invite: INVITE, ...person(2) });
  assert.equal(back.body.error, 'invite');
  const fresh = await call({ op: 'join', gid: GID, invite: 'next-invite-0123456789', ...person(4) });
  assert.equal(fresh.status, 200);
});

test('выход из группы и удаление группы', async () => {
  const { call } = server();
  await group(call);
  await call({ op: 'join', gid: GID, invite: INVITE, ...person(2) });

  const ownerLeaves = await call({ op: 'leave', gid: GID, id: person(1).id, token: person(1).token });
  assert.equal(ownerLeaves.body.error, 'owner');
  const left = await call({ op: 'leave', gid: GID, id: person(2).id, token: person(2).token });
  assert.equal(left.status, 200);

  const rotated = await call({ op: 'invite', gid: GID, admin: ADMIN, invite: 'rotated-invite-0123456789' });
  assert.equal(rotated.status, 200);
  assert.equal((await call({ op: 'join', gid: GID, invite: INVITE, ...person(3) })).body.error, 'invite');

  const removed = await call({ op: 'remove', gid: GID, admin: ADMIN });
  assert.equal(removed.status, 200);
  const sync = await call({ op: 'sync', gid: GID, id: person(1).id, token: person(1).token });
  assert.equal(sync.body.error, 'nogroup');
});

test('мусор в запросе отклоняется', async () => {
  const { call } = server();
  await group(call);
  const { id, token } = person(1);
  assert.equal((await call({ op: 'sync', gid: GID, id, token, pos: 'x'.repeat(1401) })).status, 400);
  assert.equal((await call({ op: 'sync', gid: GID, id, token, pos: 'не base64' })).status, 400);
  assert.equal((await call({ op: 'sync', gid: "' OR 1=1 --", id, token })).status, 400);
  assert.equal((await call({ op: 'nothing' })).status, 400);
  assert.equal((await call({ op: 'sync', gid: GID, id, token, pad: 'x'.repeat(5000) })).status, 413);
});

test('в группе не больше 50 человек', async () => {
  const { call } = server();
  await group(call);
  for (let n = 2; n <= 50; n++) {
    assert.equal((await call({ op: 'join', gid: GID, invite: INVITE, ...person(n) })).status, 200);
  }
  assert.equal((await call({ op: 'join', gid: GID, invite: INVITE, ...person(51) })).body.error, 'full');
});

test('сводка участника и точка встречи', async () => {
  const { call } = server();
  await group(call);
  await call({ op: 'join', gid: GID, invite: INVITE, ...person(2) });

  const synced = await call({ op: 'sync', gid: GID, ...person(2), info: 'c3VtbWFyeQ' });
  assert.equal(synced.status, 200);
  assert.equal(synced.body.v, 3);
  assert.equal(synced.body.members.find((m) => m.id === person(2).id).info, 'c3VtbWFyeQ');

  // Встречу назначает участник, остальные видят её при следующем обмене
  const made = await call({ op: 'meet', gid: GID, ...person(2), meet: 'bWVldA' });
  assert.equal(made.status, 200);
  const seen = await call({ op: 'sync', gid: GID, ...person(1) });
  assert.equal(seen.body.meet.blob, 'bWVldA');
  assert.equal(seen.body.meet.by, person(2).id);

  // Отменить чужую встречу может только создатель группы
  await call({ op: 'join', gid: GID, invite: INVITE, ...person(3) });
  assert.equal((await call({ op: 'meet', gid: GID, ...person(3), meet: '' })).status, 403);
  const cancelled = await call({ op: 'meet', gid: GID, ...person(1), meet: '' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.meet, null);

  assert.equal((await call({ op: 'meet', gid: GID, ...person(2), meet: 'bad blob!' })).status, 400);
});

test('аватарки и баннеры: время смены в обмене, сами картинки — по запросу', async () => {
  const { call } = server();
  await group(call);
  await call({ op: 'join', gid: GID, invite: INVITE, ...person(2) });

  const avatar = 'YXZhdGFy'.repeat(1000);
  const saved = await call({ op: 'pic', gid: GID, ...person(2), avatar, banner: '' });
  assert.equal(saved.status, 200);

  const list = await call({ op: 'sync', gid: GID, ...person(1) });
  const two = list.body.members.find((m) => m.id === person(2).id);
  assert.equal(two.picAt, saved.body.picAt);
  assert.equal(two.avatar, undefined, 'картинки не ходят в обычном обмене');

  const pics = await call({ op: 'pics', gid: GID, ...person(1), ids: [person(2).id] });
  assert.equal(pics.body.pics[0].avatar, avatar);
  assert.equal(pics.body.pics[0].banner, '');

  // Слишком большая картинка и чужой токен не проходят
  assert.equal((await call({ op: 'pic', gid: GID, ...person(2), avatar: 'x'.repeat(90001) })).status, 400);
  assert.equal((await call({ op: 'pics', gid: GID, id: person(1).id, token: 'wrong-token-0123456789', ids: [person(2).id] })).status, 403);
  // Длинный запрос другого вида по-прежнему отклоняется
  assert.equal((await call({ op: 'sync', gid: GID, ...person(1), pad: 'x'.repeat(6000) })).status, 413);
});

test('посредник первой версии получает новые столбцы, данные сохраняются', async () => {
  // Отдельная копия модуля: таблицы в ней ещё не проверялись
  const fresh = (await import('../server/worker.mjs?migrate')).default;
  const old = new DatabaseSync(':memory:');
  old.exec('CREATE TABLE grp (id TEXT PRIMARY KEY, admin TEXT NOT NULL, invite TEXT NOT NULL, owner TEXT NOT NULL, created INTEGER NOT NULL)');
  old.exec(
    "CREATE TABLE member (gid TEXT NOT NULL, id TEXT NOT NULL, token TEXT NOT NULL, name TEXT NOT NULL, pos TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL DEFAULT 0, joined INTEGER NOT NULL, PRIMARY KEY (gid, id))"
  );
  const statement = (sql, params = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => old.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: old.prepare(sql).all(...params) }),
    run: async () => ({ meta: { changes: Number(old.prepare(sql).run(...params).changes) } }),
  });
  const env = { DB: { prepare: (sql) => statement(sql), batch: async (l) => Promise.all(l.map((s) => s.run())) }, OWNER_KEY };
  const call = async (body) => {
    const res = await fresh.fetch(new Request('https://x.workers.dev/', { method: 'POST', body: JSON.stringify(body) }), env);
    return { status: res.status, body: await res.json() };
  };
  // Группа, созданная старым посредником
  const created = await call({ op: 'create', owner: OWNER_KEY, gid: GID, admin: ADMIN, invite: INVITE, ...person(1) });
  assert.equal(created.status, 200);
  const columns = old.prepare('PRAGMA table_info(member)').all().map((c) => c.name);
  assert.ok(columns.includes('info') && columns.includes('infoAt'));
  assert.equal((await call({ op: 'meet', gid: GID, ...person(1), meet: 'bWVldA' })).body.meet.blob, 'bWVldA');
});

test('код посредника в приложении совпадает с server/worker.mjs', () => {
  // Git на Windows может заменить переводы строк в файле — на сравнение это влиять не должно
  const embedded = readFileSync(target, 'utf8').replaceAll('\r\n', '\n');
  assert.equal(embedded, build(), 'запустите node scripts/embed-worker.mjs');
});

test('base64 и UTF-8 читаются обратно', () => {
  for (const length of [0, 1, 2, 3, 4, 31, 32, 33]) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
    assert.deepEqual([...fromBase64(toBase64(bytes))], [...bytes]);
  }
  assert.equal(toBase64(Uint8Array.from([251, 255, 254])), '-__-');
  assert.deepEqual([...fromBase64('+//+')], [251, 255, 254]);
  for (const text of ['', 'Саша', 'Zoë ⛷', 'лыжи 🎿 и борд']) {
    assert.equal(fromUtf8(utf8(text)), text);
    assert.deepEqual([...utf8(text)], [...new TextEncoder().encode(text)]);
  }
  assert.throws(() => fromBase64('a b'));
});

test('приглашение собирается в ссылку и разбирается обратно', () => {
  const invite = {
    url: 'https://snowwy-abc123.example.workers.dev',
    gid: 'group-000001',
    invite: 'invite-secret-0123456789',
    key: toBase64(Uint8Array.from({ length: 32 }, (_, i) => i)),
  };
  const link = inviteLink(invite);
  assert.ok(link.startsWith('snowwy://friends/join?d='));
  assert.deepEqual(parseInvite(link), invite);
  // Только код, с пробелами по краям
  assert.deepEqual(parseInvite(`  ${link.split('d=')[1]}\n`), invite);
  // Ссылка из Expo Go
  assert.deepEqual(parseInvite(`exp://192.168.0.5:8081/--/friends/join?d=${link.split('d=')[1]}`), invite);

  assert.equal(parseInvite(''), null);
  assert.equal(parseInvite('привет'), null);
  assert.equal(parseInvite(link.slice(0, -6)), null);
  // Адрес не https или ключ не той длины
  const forged = (patch) => {
    const v = { ...invite, ...patch };
    return 'snowwy://friends/join?d=' + toBase64(utf8(JSON.stringify([1, v.url, v.gid, v.invite, v.key])));
  };
  assert.equal(parseInvite(forged({ url: 'http://example.com' })), null);
  assert.equal(parseInvite(forged({ url: 'https://example.com/path?x=1' })), null);
  assert.equal(parseInvite(forged({ key: 'c2hvcnQ' })), null);
});

test('время с последнего обновления', () => {
  assert.equal(ago(-5), '0 с');
  assert.equal(ago(20_400), '20 с');
  assert.equal(ago(5 * 60_000 + 10_000), '5 мин');
  assert.equal(ago(2 * 3600_000), '2 ч');
  assert.equal(ago(3 * 86400_000), '3 дн');
});
