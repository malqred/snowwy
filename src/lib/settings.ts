import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';

export type Settings = {
  theme: ThemeMode;
  /** Не гасить экран во время записи */
  keepAwake: boolean;
  /** Напоминать о забытой записи и завершать её после долгого простоя */
  remind: boolean;
};

const KEY = 'settings';
const DEFAULTS: Settings = { theme: 'system', keepAwake: true, remind: true };

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
