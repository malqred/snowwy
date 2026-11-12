// Группа друзей: кто в ней, где они сейчас и отправка своей точки во время катания.
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { time } from '../format';
import { cancelNotify, notifyLater, notifyNow } from '../notify';
import { getSettings, updateSettings } from '../settings';
import { ApiError, call } from './api';
import { ensureServer } from './cloudflare';
import { inviteLink, type Invite } from './codec';
import { randomId, randomKey, randomSecret, seal, unseal } from './crypto';

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

/** Итоги дня для карточки друга. */
export type FriendDay = {
  /** День, к которому относятся итоги: 2026-11-12 */
  date: string;
  runs: number;
  /** м */
  vertical: number;
  /** м */
  distance: number;
  /** м/с */
  maxSpeed: number;
  /** Время на спусках, с */
  runTime: number;
  /** Самый длинный спуск, м */
  longest: number;
};

/** Личные рекорды для карточки друга. */
export type FriendRecords = {
  /** м/с */
  maxSpeed: number;
  /** м */
  longestRun: number;
  /** Наибольший перепад одного спуска, м */
  biggestRunVertical: number;
  /** Наибольший перепад за день, м */
  dayVertical: number;
};

/** Сводка, которую человек показывает группе: итоги дня, рекорды, заряд. */
export type FriendInfo = {
  /** Заряд телефона, %; null — неизвестен */
  bat: number | null;
  /** Телефон заряжается */
  chg: boolean;
  day: FriendDay | null;
  rec: FriendRecords | null;
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
};

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
  /** Версия сервера группы: 1 — без сводок и точек встречи */
  serverVersion: number;
};

/** Какую точку встречи телефон уже видел и какие напоминания о ней поставил */
type MeetSeen = { id: number; notes: string[] };
type Saved = { name: string; group: Group | null; meetSeen?: MeetSeen };
type ListReply = {
  v?: number;
  now: number;
  owner: string;
  meet?: { blob: string; at: number; by: string } | null;
  members: { id: string; name: string; pos: string; at: number; info?: string; infoAt?: number }[];
};

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

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

function readInfo(raw: Partial<FriendInfo> | null): FriendInfo | null {
  if (!raw) return null;
  const day = raw.day && typeof raw.day.date === 'string' ? raw.day : null;
  const rec = raw.rec ?? null;
  return {
    bat: typeof raw.bat === 'number' ? Math.max(0, Math.min(100, Math.round(raw.bat))) : null,
    chg: raw.chg === true,
    day: day
      ? {
          date: day.date,
          runs: num(day.runs),
          vertical: num(day.vertical),
          distance: num(day.distance),
          maxSpeed: num(day.maxSpeed),
          runTime: num(day.runTime),
          longest: num(day.longest),
        }
      : null,
    rec: rec
      ? {
          maxSpeed: num(rec.maxSpeed),
          longestRun: num(rec.longestRun),
          biggestRunVertical: num(rec.biggestRunVertical),
          dayVertical: num(rec.dayVertical),
        }
      : null,
  };
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
  set({ group: null, members: [], meet: null, syncedAt: 0, error: null, notice });
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
