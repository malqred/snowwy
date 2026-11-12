// Профиль: аватарка и баннер. Имя общее с группой друзей (хранится в src/lib/friends/store.ts).
// Картинки копируются в папку приложения, поэтому не пропадают, если удалить их из галереи.
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

export type ProfileImages = {
  /** Адрес файла аватарки; пусто — нет */
  avatar: string;
  banner: string;
};

const KEY = 'profile';
const DIR = 'profile';

function load(): ProfileImages {
  try {
    const raw = Storage.getItemSync(KEY);
    if (raw) return { avatar: '', banner: '', ...(JSON.parse(raw) as Partial<ProfileImages>) };
  } catch {
    // профиля ещё нет
  }
  return { avatar: '', banner: '' };
}

let state = load();
const listeners = new Set<() => void>();

function set(patch: Partial<ProfileImages>) {
  state = { ...state, ...patch };
  Storage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  listeners.forEach((l) => l());
}

export type ImageKind = 'avatar' | 'banner';

/**
 * Даёт выбрать фото из галереи и сразу обрезать: аватарку — квадратом, баннер — полосой.
 * Возвращает false, если человек передумал или доступа к фото нет.
 */
export async function pickImage(kind: ImageKind): Promise<boolean> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: kind === 'avatar' ? [1, 1] : [3, 1],
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]) return false;
  const dir = new Directory(Paths.document, DIR);
  if (!dir.exists) dir.create();
  // Новое имя файла при каждой смене: иначе картинка на экране осталась бы прежней из кэша
  const target = new File(dir, `${kind}-${Date.now()}.jpg`);
  new File(result.assets[0].uri).copy(target);
  remove(kind, false);
  set({ [kind]: target.uri });
  return true;
}

/** Убирает аватарку или баннер. */
export function remove(kind: ImageKind, notify = true) {
  const uri = state[kind];
  if (uri) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // файла уже нет
    }
  }
  if (notify) set({ [kind]: '' });
}

/** Меняется при каждой смене аватарки или баннера: по нему видно, что группе пора отправить новые. */
export function imagesKey(): string {
  return `${state.avatar}|${state.banner}`;
}

/** Размеры копий для группы: аватарка и баннер в маленьком JPEG */
const GROUP_SIZE = { avatar: { width: 128, height: 128 }, banner: { width: 600, height: 200 } } as const;

/**
 * Маленькие копии картинок для друзей в группе (JPEG в base64; '' — картинки нет).
 * quality — сжатие, от 0 до 1: если копия не влезает в сервер, её пересжимают сильнее.
 */
export async function groupImage(kind: ImageKind, quality: number): Promise<string> {
  const uri = state[kind];
  if (!uri) return '';
  const ref = await ImageManipulator.manipulate(uri).resize(GROUP_SIZE[kind]).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
  return out.base64 ?? '';
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useProfileImages(): ProfileImages {
  return useSyncExternalStore(subscribe, () => state);
}
