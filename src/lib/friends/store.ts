// Группа друзей: кто в ней, где они сейчас и отправка своей точки во время катания.
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { time } from '../format';
import { cancelNotify, notifyLater, notifyNow } from '../notify';
import { groupImage, imagesKey, type ImageKind } from '../profile';
import { getSettings, updateSettings } from '../settings';
import { ApiError, call } from './api';
import { ensureServer } from './cloudflare';
import { fromBase64, inviteLink, type Invite } from './codec';
import { randomId, randomKey, randomSecret, seal, unseal } from './crypto';
import { readInfo, type FriendInfo } from './summary';

export type { FriendDay, FriendInfo, FriendRecords } from './summary';

/** Как часто отправлять свою точку и обновлять чужие, мс */
export const SYNC_EVERY = 30000;
/** Самое длинное имя, символов */
export const NAME_MAX = 24;

const KEY = 'friends.group';
// Данные группы нужны и при заблокированном экране: точка отправляется в фоне
const STORE = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export type Group = {
  url: string;
  gid: string;
  /** Ключ шифрования группы */
  key: string;
  /** Я в группе */
  id: string;
  token: string;
  /** Есть только у создателя: пароль управления и действующее приглашение */
  admin?: string;
  invite?: string;
};

export type Pos = {
  lat: number;
  lon: number;
  /** ride — катается, pause — запись на паузе */
  s: 'ride' | 'pause';
  /** Высота, м; нет у версий до 1.0.4 */
  alt?: number;
  /** Что делает сейчас: спуск, подъёмник или стоит */
  st?: 'run' | 'lift' | 'stop';
};

/** Точка встречи группы. */
export type Meet = {
  /** Меняется при каждой новой точке */
  id: number;
  lat: number;
  lon: number;
  text: string;
  /** Время встречи, мс */
  at: number;
  /** Кто назначил */
  by: string;
  byName: string;
  mine: boolean;
};

export type Member = {
  id: string;
  name: string;
  me: boolean;
  owner: boolean;
  /** Где человек сейчас; null — не катается или не показывает себя */
  pos: Pos | null;
  /** Когда он последний раз обновлял точку (время сервера, мс); 0 — ещё ни разу */
  at: number;
  /** Сводка: итоги дня, рекорды, заряд; null — не показывает или старая версия */
  info: FriendInfo | null;
  /** Когда сводка обновлялась (время сервера, мс) */
  infoAt: number;
  /** Когда человек последний раз менял аватарку или баннер (время сервера, мс); 0 — не ставил */
  picAt: number;
};

/** Аватарка и баннер друга: файлы на этом телефоне; '' — нет картинки */
export type FriendPics = { avatar: string; banner: string; picAt: number };

export type FriendsState = {
  /** Моё имя для группы */
  name: string;
  group: Group | null;
  members: Member[];
  /** Когда список последний раз обновился (время телефона, мс); 0 — ещё нет */
  syncedAt: number;
  /** Насколько часы сервера впереди часов телефона, мс */
  skew: number;
  /** Последнее обновление не удалось: текст для человека */
  error: string | null;
  /** Разовое сообщение: исключили из группы, группу удалили */
  notice: string | null;
  meet: Meet | null;
  /** Версия сервера группы: 1 — без сводок и точек встречи, 2 — без картинок */
  serverVersion: number;
  /** Аватарки и баннеры друзей по номеру участника */
  pics: Record<string, FriendPics>;
};

/** Какую точку встречи телефон уже видел и какие напоминания о ней поставил */
type MeetSeen = { id: number; notes: string[] };
type Saved = { name: string; group: Group | null; meetSeen?: MeetSeen };
type ListReply = {
  v?: number;
  now: number;
  owner: string;
  meet?: { blob: string; at: number; by: string } | null;
  members: { id: string; name: string; pos: string; at: number; info?: string; infoAt?: number; picAt?: number }[];
};

const PICS_KEY = 'friends.pics';
/** Какие свои картинки уже отправлены группе: «группа:ключ картинок» */
const PICS_SENT_KEY = 'friends.picsSent';
const PICS_DIR = 'friends-pics';

function loadPics(): Record<string, FriendPics> {
  try {
    const raw = Storage.getItemSync(PICS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, FriendPics>;
  } catch {
    // картинок ещё нет
  }
  return {};
}

function load(): Saved {
  try {
    const raw = SecureStore.getItem(KEY, STORE);
    if (raw) return { name: '', group: null, ...(JSON.parse(raw) as Partial<Saved>) };
  } catch {
    // хранилище недоступно — считаем, что группы нет
  }
  return { name: '', group: null };
}

const saved = load();
let state: FriendsState = {
  name: saved.name,
  group: saved.group,
  members: [],
  syncedAt: 0,
  skew: 0,
  error: null,
  notice: null,
  meet: null,
  serverVersion: 2,
  pics: loadPics(),
};
let meetSeen: MeetSeen = saved.meetSeen ?? { id: 0, notes: [] };
const listeners = new Set<() => void>();

function set(patch: Partial<FriendsState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function persist() {
  const data: Saved = { name: state.name, group: state.group, meetSeen };
  SecureStore.setItemAsync(KEY, JSON.stringify(data), STORE).catch(() => {});
}

const nameScope = (gid: string, id: string) => `${gid}:${id}:name`;
const posScope = (gid: string, id: string) => `${gid}:${id}:pos`;
const infoScope = (gid: string, id: string) => `${gid}:${id}:info`;
const meetScope = (gid: string) => `${gid}:meet`;
const picScope = (gid: string, id: string, kind: ImageKind) => `${gid}:${id}:${kind}`;

/** Самая длинная зашифрованная картинка, которую примет сервер, символов */
const MAX_PIC = 88000;
let picsBusy = false;

/** Удаляет файл картинки, если он есть. */
function dropFile(uri: string) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // файла уже нет
  }
}

/** Кладёт картинку друга в папку приложения и возвращает адрес файла. */
async function savePic(id: string, kind: ImageKind, picAt: number, base64: string): Promise<string> {
  const dir = new Directory(Paths.document, PICS_DIR);
  if (!dir.exists) dir.create();
  const file = new File(dir, `${id}-${kind}-${picAt}.jpg`);
  if (file.exists) file.delete();
  file.create();
  await file.write(fromBase64(base64));
  return file.uri;
}

/** Шифрует картинку; если она слишком большая для сервера — пересжимает сильнее. */
async function sealPic(group: Group, kind: ImageKind): Promise<string> {
  for (const quality of [0.7, 0.5, 0.35]) {
    const data = await groupImage(kind, quality);
    if (!data) return '';
    const blob = await seal(group.key, picScope(group.gid, group.id, kind), { d: data });
    if (blob.length <= MAX_PIC) return blob;
  }
  return '';
}

/**
 * Свои аватарка и баннер — группе (когда сменились), картинки друзей — себе (когда сменились у них).
 * Идёт отдельно от обычного обмена: картинки большие, и обмен местом не должен их ждать.
 */
async function syncPics(group: Group, reply: ListReply) {
  if ((reply.v ?? 1) < 3 || picsBusy) return;
  picsBusy = true;
  try {
    const key = `${group.gid}:${imagesKey()}`;
    let sent = '';
    try {
      sent = Storage.getItemSync(PICS_SENT_KEY) ?? '';
    } catch {
      // ещё не отправляли
    }
    if (sent !== key) {
      const avatar = await sealPic(group, 'avatar');
      const banner = await sealPic(group, 'banner');
      await call(group.url, { op: 'pic', gid: group.gid, id: group.id, token: group.token, avatar, banner }, 1, 30000);
      await Storage.setItem(PICS_SENT_KEY, key);
    }

    const pics = { ...state.pics };
    let changed = false;
    const want: string[] = [];
    for (const m of reply.members) {
      if (m.id === group.id) continue;
      const at = m.picAt ?? 0;
      const have = pics[m.id];
      if (at === 0) {
        if (have) {
          dropFile(have.avatar);
          dropFile(have.banner);
          delete pics[m.id];
          changed = true;
        }
      } else if (!have || have.picAt !== at) {
        want.push(m.id);
      }
    }
    // Ушедших из группы забываем
    for (const id of Object.keys(pics)) {
      if (!reply.members.some((m) => m.id === id)) {
        dropFile(pics[id].avatar);
        dropFile(pics[id].banner);
        delete pics[id];
        changed = true;
      }
    }
    if (want.length > 0) {
      const res = await call<{ pics: { id: string; avatar: string; banner: string; picAt: number }[] }>(
        group.url,
        { op: 'pics', gid: group.gid, id: group.id, token: group.token, ids: want },
        1,
        30000
      );
      for (const p of res.pics) {
        const old = pics[p.id];
        const read = async (kind: ImageKind, blob: string) => {
          if (!blob) return '';
          const value = await unseal<{ d?: unknown }>(group.key, picScope(group.gid, p.id, kind), blob);
          return typeof value?.d === 'string' ? await savePic(p.id, kind, p.picAt, value.d) : '';
        };
        const next = { avatar: await read('avatar', p.avatar), banner: await read('banner', p.banner), picAt: p.picAt };
        if (old) {
          if (old.avatar !== next.avatar) dropFile(old.avatar);
          if (old.banner !== next.banner) dropFile(old.banner);
        }
        pics[p.id] = next;
        changed = true;
      }
    }
    if (changed && state.group?.gid === group.gid) {
      set({ pics });
      Storage.setItem(PICS_KEY, JSON.stringify(pics)).catch(() => {});
    }
  } catch {
    // не получилось — попробуем при следующем обмене
  } finally {
    picsBusy = false;
  }
}

/** Напоминания о встрече: за 20 минут и в само время */
const MEET_EARLY = 20 * 60 * 1000;

/** Новая точка встречи: сообщает о ней и ставит напоминания. Отменённая — убирает их. */
async function noticeMeet(meet: Meet | null) {
  const id = meet?.id ?? 0;
  if (id === meetSeen.id) return;
  const old = meetSeen.notes;
  meetSeen = { id, notes: [] };
  persist();
  old.forEach((n) => cancelNotify(n));
  if (!meet) return;
  const now = Date.now();
  if (meet.at < now) return;
  const notes: string[] = [];
  if (!meet.mine) {
    await notifyNow(`Встреча в ${time(meet.at)}`, `${meet.byName}: ${meet.text}`);
  }
  const early = meet.at - MEET_EARLY;
  if (early - now > 60000) {
    const n = await notifyLater('Встреча через 20 минут', meet.text, Math.round((early - now) / 1000));
    if (n) notes.push(n);
  }
  const n = await notifyLater(`Пора на встречу, ${time(meet.at)}`, meet.text, Math.max(1, Math.round((meet.at - now) / 1000)));
  if (n) notes.push(n);
  if (meetSeen.id === id) {
    meetSeen = { id, notes };
    persist();
  } else {
    notes.forEach((x) => cancelNotify(x));
  }
}

async function apply(group: Group, reply: ListReply) {
  const members = await Promise.all(
    reply.members.map(async (m): Promise<Member> => {
      const name = await unseal<{ n?: unknown }>(group.key, nameScope(group.gid, m.id), m.name);
      const pos = await unseal<Partial<Pos>>(group.key, posScope(group.gid, m.id), m.pos);
      const valid = pos && typeof pos.lat === 'number' && typeof pos.lon === 'number';
      const info = m.info ? readInfo(await unseal<Partial<FriendInfo>>(group.key, infoScope(group.gid, m.id), m.info)) : null;
      return {
        id: m.id,
        name: typeof name?.n === 'string' && name.n ? name.n.slice(0, NAME_MAX) : 'Без имени',
        me: m.id === group.id,
        owner: m.id === reply.owner,
        pos: valid
          ? {
              lat: pos.lat as number,
              lon: pos.lon as number,
              s: pos.s === 'pause' ? 'pause' : 'ride',
              alt: typeof pos.alt === 'number' ? pos.alt : undefined,
              st: pos.st === 'run' || pos.st === 'lift' || pos.st === 'stop' ? pos.st : undefined,
            }
          : null,
        at: m.at,
        info,
        infoAt: m.infoAt ?? 0,
        picAt: m.picAt ?? 0,
      };
    })
  );
  let meet: Meet | null = null;
  if (reply.meet) {
    const raw = await unseal<Partial<Meet>>(group.key, meetScope(group.gid), reply.meet.blob);
    if (raw && typeof raw.lat === 'number' && typeof raw.lon === 'number' && typeof raw.at === 'number') {
      meet = {
        id: reply.meet.at,
        lat: raw.lat,
        lon: raw.lon,
        text: typeof raw.text === 'string' ? raw.text.slice(0, MEET_TEXT_MAX) : '',
        at: raw.at,
        by: reply.meet.by,
        byName: members.find((m) => m.id === reply.meet?.by)?.name ?? 'Кто-то из группы',
        mine: reply.meet.by === group.id,
      };
    }
  }
  // Пока шла расшифровка, из группы могли выйти
  if (state.group?.gid !== group.gid) return;
  set({ members, meet, serverVersion: reply.v ?? 1, syncedAt: Date.now(), skew: reply.now - Date.now(), error: null });
  noticeMeet(meet).catch(() => {});
  syncPics(group, reply);
}

/** Самое длинное описание точки встречи, символов */
export const MEET_TEXT_MAX = 120;

// Сводку собирает модуль, который знает про записи и заряд: так хранилище группы
// не зависит от записи катания
let infoProvider: ((fresh: boolean) => Promise<FriendInfo | null>) | null = null;
/** Как часто пересчитывать сводку, мс; обновляется только если что-то изменилось */
const INFO_EVERY = 2 * 60 * 1000;
/** Даже если ничего не изменилось, сводку обновляем раз в столько, мс: заряд, «обновлено N минут назад» */
const INFO_REFRESH = 15 * 60 * 1000;
let infoSentAt = 0;
let infoSent = '';

export function setInfoProvider(provider: (fresh: boolean) => Promise<FriendInfo | null>) {
  infoProvider = provider;
}

/** Сводка для отправки: запись, '' — убрать, undefined — отправлять нечего. */
async function nextInfo(group: Group, force: boolean): Promise<{ blob: string; json: string } | undefined> {
  if (!infoProvider || state.serverVersion < 2) return undefined;
  if (!getSettings().friendsStats) return infoSent === '-' ? undefined : { blob: '', json: '-' };
  const now = Date.now();
  if (!force && now - infoSentAt < INFO_EVERY) return undefined;
  const info = await infoProvider(force);
  if (!info) return undefined;
  const json = JSON.stringify(info);
  if (!force && json === infoSent && now - infoSentAt < INFO_REFRESH) return undefined;
  return { blob: await seal(group.key, infoScope(group.gid, group.id), info), json };
}

/** Группы больше нет или меня из неё убрали: забываем её на телефоне. */
function drop(notice: string | null) {
  lastSentAt = 0;
  clearPending = false;
  failures = 0;
  infoSent = '';
  infoSentAt = 0;
  meetSeen.notes.forEach((n) => cancelNotify(n));
  meetSeen = { id: 0, notes: [] };
  for (const p of Object.values(state.pics)) {
    dropFile(p.avatar);
    dropFile(p.banner);
  }
  Storage.removeItem(PICS_KEY).catch(() => {});
  Storage.removeItem(PICS_SENT_KEY).catch(() => {});
  set({ group: null, members: [], meet: null, pics: {}, syncedAt: 0, error: null, notice });
  persist();
}

// Запросы идут строго по очереди, чтобы ответы не перепутались
let queue: Promise<unknown> = Promise.resolve();
let lastSentAt = 0;
/** Сколько обновлений подряд не удалось */
let failures = 0;
/**
 * Мою точку нужно убрать с сервера при первой же возможности. Изначально включено:
 * если приложение закрыли посреди катания, на сервере могла остаться старая точка.
 */
let clearPending = saved.group != null;

type SyncOptions = {
  /** Точка для отправки; null — убрать себя с карты; не указано — только прочитать */
  pos?: Pos | null;
  name?: string;
  /** Отправить сводку, даже если недавно отправляли */
  info?: boolean;
};

function sync(options: SyncOptions = {}): Promise<void> {
  const run = async () => {
    const group = state.group;
    if (!group) return;
    // Не получилось убрать точку раньше (не было связи) — убираем с этим запросом
    const pos = options.pos === undefined && clearPending ? null : options.pos;
    try {
      const body: Record<string, unknown> = { op: 'sync', gid: group.gid, id: group.id, token: group.token };
      if (pos !== undefined) {
        body.pos = pos ? await seal(group.key, posScope(group.gid, group.id), pos) : '';
      }
      if (options.name !== undefined) {
        body.name = await seal(group.key, nameScope(group.gid, group.id), { n: options.name });
      }
      const info = await nextInfo(group, options.info === true);
      if (info) body.info = info.blob;
      // Три короткие попытки вместо одной долгой: оборванный запрос обычно проходит со второго раза,
      // и всё вместе укладывается в промежуток между обновлениями
      const reply = await call<ListReply>(group.url, body, 2, 7000);
      if (pos === null) clearPending = false;
      if (info) {
        infoSent = info.json;
        infoSentAt = Date.now();
      }
      failures = 0;
      await apply(group, reply);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'kicked' || code === 'auth') drop('Создатель группы исключил вас из неё.');
      else if (code === 'nogroup') drop('Группу удалили.');
      else if (state.group?.gid === group.gid) {
        // Одно пропущенное обновление не беда: места на карте всего на полминуты старше.
        // Сообщаем, только когда не удалось два обновления подряд.
        failures++;
        if (failures < 2 && code !== 'limit') return;
        set({
          error:
            code === 'network'
              ? 'Нет связи с сервером группы — показаны последние известные места.'
              : code === 'limit'
                ? 'Сервер группы исчерпал суточный лимит запросов. Он заработает после полуночи по Гринвичу.'
                : 'Сервер группы не отвечает — показаны последние известные места.',
        });
      }
    }
  };
  const next = queue.then(run, run);
  queue = next;
  return next;
}

/** Обновляет список участников (для открытой вкладки «Друзья»). */
export function refreshFriends(): Promise<void> {
  return sync();
}

/** Сразу отправляет свежую сводку (после катания, при смене настройки). */
export function pushFriendInfo(): Promise<void> {
  if (!state.group) return Promise.resolve();
  return sync({ info: true });
}

/** Ошибка старого сервера группы: он не знает новых действий. */
function oldServer(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'bad' && state.serverVersion < 2;
}

export class OldServerError extends Error {}

/** Назначает точку встречи для всей группы. Бросает ApiError или OldServerError. */
export async function createMeet(point: { lat: number; lon: number; text: string; at: number }): Promise<void> {
  const group = state.group;
  if (!group) return;
  const meet = await seal(group.key, meetScope(group.gid), {
    lat: Math.round(point.lat * 1e5) / 1e5,
    lon: Math.round(point.lon * 1e5) / 1e5,
    text: point.text.trim().slice(0, MEET_TEXT_MAX),
    at: point.at,
  });
  try {
    const reply = await call<ListReply>(group.url, { op: 'meet', gid: group.gid, id: group.id, token: group.token, meet });
    await apply(group, reply);
  } catch (e) {
    if (oldServer(e)) throw new OldServerError();
    throw e;
  }
}

/** Отменяет точку встречи. Бросает ApiError. */
export async function cancelMeet(): Promise<void> {
  const group = state.group;
  if (!group) return;
  const reply = await call<ListReply>(group.url, { op: 'meet', gid: group.gid, id: group.id, token: group.token, meet: '' });
  await apply(group, reply);
}

/** Сохраняет моё имя; если я в группе — сообщает его остальным. */
export async function setFriendName(raw: string): Promise<void> {
  const name = raw.trim().slice(0, NAME_MAX);
  set({ name });
  persist();
  if (state.group && name) await sync({ name });
}

function fresh(invite: Invite): Group {
  return { url: invite.url, gid: invite.gid, key: invite.key, id: randomId(), token: randomSecret() };
}

async function enter(group: Group, op: 'create' | 'join', extra: Record<string, unknown>) {
  const name = await seal(group.key, nameScope(group.gid, group.id), { n: state.name });
  const reply = await call<ListReply>(group.url, { op, gid: group.gid, id: group.id, token: group.token, name, ...extra });
  lastSentAt = 0;
  clearPending = false;
  set({ group, members: [], notice: null, error: null });
  persist();
  // Вступая в группу, человек соглашается показывать себя во время катания
  updateSettings({ friends: true });
  await apply(group, reply);
}

/**
 * Создаёт группу на своём сервере. Бросает ApiError.
 * Возвращает false, если сервера ещё нет — сначала нужно подключить аккаунт Cloudflare.
 */
export async function createGroup(onStep?: (text: string) => void): Promise<boolean> {
  const server = await ensureServer(onStep);
  if (!server) return false;
  const admin = randomSecret();
  const invite = randomSecret();
  const group: Group = {
    ...fresh({ url: server.url, gid: randomId(), invite, key: randomKey() }),
    admin,
    invite,
  };
  await enter(group, 'create', { owner: server.ownerKey, admin, invite });
  return true;
}

/** Входит в группу по приглашению. Бросает ApiError. */
export async function joinGroup(invite: Invite): Promise<void> {
  await enter(fresh(invite), 'join', { invite: invite.invite });
}

/** Приглашение в мою группу (только у создателя). */
export function currentInvite(): string | null {
  const g = state.group;
  return g?.invite ? inviteLink({ url: g.url, gid: g.gid, invite: g.invite, key: g.key }) : null;
}

/** Создатель исключает участника. Приглашение при этом меняется. Бросает ApiError. */
export async function kickMember(id: string): Promise<void> {
  const group = state.group;
  if (!group?.admin) return;
  const invite = randomSecret();
  const reply = await call<ListReply>(group.url, { op: 'kick', gid: group.gid, admin: group.admin, id, invite });
  const next = { ...group, invite };
  set({ group: next });
  persist();
  await apply(next, reply);
}

/** Создатель меняет приглашение: старое перестаёт действовать. Бросает ApiError. */
export async function renewInvite(): Promise<void> {
  const group = state.group;
  if (!group?.admin) return;
  const invite = randomSecret();
  await call(group.url, { op: 'invite', gid: group.gid, admin: group.admin, invite });
  set({ group: { ...group, invite } });
  persist();
}

/**
 * Выйти из группы; создатель при этом удаляет её для всех.
 * Бросает ApiError, если сервер недоступен: иначе человек остался бы в списке у остальных.
 */
export async function leaveGroup(): Promise<void> {
  const group = state.group;
  if (!group) return;
  try {
    if (group.admin) await call(group.url, { op: 'remove', gid: group.gid, admin: group.admin });
    else await call(group.url, { op: 'leave', gid: group.gid, id: group.id, token: group.token });
  } catch (e) {
    const code = e instanceof ApiError ? e.code : '';
    // Группы уже нет или меня в ней нет — выходить неоткуда
    if (!['nogroup', 'kicked', 'auth'].includes(code)) throw e;
  }
  drop(null);
}

/** Забыть группу на этом телефоне, ничего не сообщая серверу (сервер удалён). */
export function forgetGroup() {
  drop(null);
}

export function clearFriendsNotice() {
  set({ notice: null });
}

/** Показывать ли меня группе. При выключении точка сразу убирается с карты у остальных. */
export function setSharing(on: boolean) {
  updateSettings({ friends: on });
  lastSentAt = 0;
  if (!on && state.group) {
    clearPending = true;
    sync({ pos: null });
  }
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;

/** Что сейчас делает человек — для карточки и списка. */
export type RideState = 'run' | 'lift' | 'stop';

/** Вызывается на каждой новой точке записи: раз в полминуты отправляет её группе. */
export function shareTick(point: { lat: number; lon: number; alt: number }, st: RideState) {
  if (!state.group || !getSettings().friends) return;
  const now = Date.now();
  if (now - lastSentAt < SYNC_EVERY) return;
  lastSentAt = now;
  clearPending = false;
  sync({ pos: { lat: round(point.lat), lon: round(point.lon), s: 'ride', alt: Math.round(point.alt), st } });
}

/** Запись поставили на паузу: остальные видят последнее место с пометкой «на паузе». */
export function sharePause(point: { lat: number; lon: number; alt: number } | null) {
  if (!state.group || !getSettings().friends || !point) return;
  lastSentAt = 0;
  clearPending = false;
  sync({ pos: { lat: round(point.lat), lon: round(point.lon), s: 'pause', alt: Math.round(point.alt), st: 'stop' } });
}

/** Катание завершено: убираем себя с карты у остальных. Итоги дня отправит pushFriendInfo. */
export function shareStop() {
  lastSentAt = 0;
  if (!state.group) return;
  clearPending = true;
  sync({ pos: null });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFriends(): FriendsState {
  return state;
}

export function useFriends(): FriendsState {
  return useSyncExternalStore(subscribe, () => state);
}
