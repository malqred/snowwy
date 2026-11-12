import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';

/** Насколько «стеклянные» плитки: плотные, тонированное стекло, прозрачное стекло */
export type GlassLevel = 'solid' | 'tinted' | 'clear';

/** Расцветка приложения */
export type PaletteId = 'ice' | 'emerald' | 'autumn' | 'sunset' | 'garnet' | 'truffle';

export type Settings = {
  theme: ThemeMode;
  palette: PaletteId;
  glass: GlassLevel;
  /** Не гасить экран во время записи */
  keepAwake: boolean;
  /** Напоминать о забытой записи и завершать её после долгого простоя */
  remind: boolean;
  /** Сохранять копию записей после каждого катания. null — ещё не спрашивали */
  backup: boolean | null;
  /** Android: папка, выбранная для копии (адрес с постоянным доступом); пусто — не выбрана */
  backupDir: string;
  /** Android: вопрос о работе в фоне уже задавали */
  powerAsked: boolean;
  /** Android: когда последний раз проверяли обновления, мс */
  updateCheckedAt: number;
  /** Android: версия, о которой попросили не напоминать */
  updateSkipped: string;
  /** Когда копию последний раз сохраняли вне приложения, мс; 0 — никогда */
  backupSharedAt: number;
  /** Называть итоги спуска голосом, если подключены наушники */
  voice: boolean;
  /** Экономить заряд: при заблокированном экране обрабатывать точки пачками */
  economy: boolean;
  /** Показывать на картах горнолыжные трассы и подъёмники */
  pistes: boolean;
  /** Показывать меня группе друзей во время катания */
  friends: boolean;
};

const KEY = 'settings';
const DEFAULTS: Settings = {
  theme: 'system',
  palette: 'ice',
  glass: 'tinted',
  keepAwake: true,
  remind: true,
  backup: null,
  backupDir: '',
  powerAsked: false,
  updateCheckedAt: 0,
  updateSkipped: '',
  backupSharedAt: 0,
  voice: false,
  economy: false,
  pistes: false,
  friends: false,
};

function load(): Settings {
  try {
    const raw = Storage.getItemSync(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function applyTheme(mode: ThemeMode) {
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
}

let current = load();
applyTheme(current.theme);

const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  if (patch.theme) applyTheme(patch.theme);
  Storage.setItem(KEY, JSON.stringify(current)).catch(() => {});
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings);
}
