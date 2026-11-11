// Группа друзей: кто в ней, где они сейчас и отправка своей точки во время катания.
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

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
};

type Saved = { name: string; group: Group | null };
type ListReply = { now: number; owner: string; members: { id: string; name: string; pos: string; at: number }[] };

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
};
const listeners = new Set<() => void>();

function set(patch: Partial<FriendsState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function persist() {
  const data: Saved = { name: state.name, group: state.group };
  SecureStore.setItemAsync(KEY, JSON.stringify(data), STORE).catch(() => {});
}

const nameScope = (gid: string, id: string) => `${gid}:${id}:name`;
const posScope = (gid: string, id: string) => `${gid}:${id}:pos`;

async function apply(group: Group, reply: ListReply) {
  const members = await Promise.all(
    reply.members.map(async (m): Promise<Member> => {
      const name = await unseal<{ n?: unknown }>(group.key, nameScope(group.gid, m.id), m.name);
      const pos = await unseal<Partial<Pos>>(group.key, posScope(group.gid, m.id), m.pos);
      const valid = pos && typeof pos.lat === 'number' && typeof pos.lon === 'number';
      return {
        id: m.id,
        name: typeof name?.n === 'string' && name.n ? name.n.slice(0, NAME_MAX) : 'Без имени',
        me: m.id === group.id,
        owner: m.id === reply.owner,
        pos: valid ? { lat: pos.lat as number, lon: pos.lon as number, s: pos.s === 'pause' ? 'pause' : 'ride' } : null,
        at: m.at,
      };
    })
  );
  // Пока шла расшифровка, из группы могли выйти
  if (state.group?.gid !== group.gid) return;
  set({ members, syncedAt: Date.now(), skew: reply.now - Date.now(), error: null });
}

/** Группы больше нет или меня из неё убрали: забываем её на телефоне. */
function drop(notice: string | null) {
  lastSentAt = 0;
  clearPending = false;
  failures = 0;
  set({ group: null, members: [], syncedAt: 0, error: null, notice });
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
      // Три короткие попытки вместо одной долгой: оборванный запрос обычно проходит со второго раза,
      // и всё вместе укладывается в промежуток между обновлениями
      const reply = await call<ListReply>(group.url, body, 2, 7000);
      if (pos === null) clearPending = false;
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

/** Вызывается на каждой новой точке записи: раз в полминуты отправляет её группе. */
export function shareTick(point: { lat: number; lon: number }) {
  if (!state.group || !getSettings().friends) return;
  const now = Date.now();
  if (now - lastSentAt < SYNC_EVERY) return;
  lastSentAt = now;
  clearPending = false;
  sync({ pos: { lat: round(point.lat), lon: round(point.lon), s: 'ride' } });
}

/** Запись поставили на паузу: остальные видят последнее место с пометкой «на паузе». */
export function sharePause(point: { lat: number; lon: number } | null) {
  if (!state.group || !getSettings().friends || !point) return;
  lastSentAt = 0;
  clearPending = false;
  sync({ pos: { lat: round(point.lat), lon: round(point.lon), s: 'pause' } });
}

/** Катание завершено: убираем себя с карты у остальных. */
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
