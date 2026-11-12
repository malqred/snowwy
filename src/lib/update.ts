// Обновления на Android: проверка последнего релиза на GitHub, скачивание .apk и установка.
// На iPhone приложение ставится с компьютера, поэтому там этого нет.
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import SnowwyPower from '../../modules/snowwy-power';
import { getSettings, updateSettings } from './settings';

const LATEST = 'https://api.github.com/repos/malqred/snowwy/releases/latest';
/** Как часто проверять обновления самому, мс */
const CHECK_EVERY = 24 * 60 * 60 * 1000;

export const updatesAvailable = Platform.OS === 'android' && SnowwyPower?.installApk != null;

/** Установленная версия: «1.0.3». */
export const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

export type Release = {
  version: string;
  /** Что нового: текст релиза без разметки */
  notes: string;
  url: string;
  /** Размер файла, байт */
  size: number;
};

export type UpdateState = {
  status: 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'error';
  release: Release | null;
  /** Доля скачанного, 0…1 */
  progress: number;
  error: string | null;
  checkedAt: number;
};

let state: UpdateState = { status: 'idle', release: null, progress: 0, error: null, checkedAt: 0 };
const listeners = new Set<() => void>();

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Сравнивает версии вида 1.0.3: больше нуля — a новее b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Текст релиза с GitHub без разметки Markdown. */
function plain(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type GithubRelease = {
  tag_name?: string;
  body?: string | null;
  assets?: { name: string; size: number; browser_download_url: string }[];
};

/** Узнаёт, есть ли версия новее установленной. Ошибки показывает в состоянии. */
export async function checkForUpdate(): Promise<Release | null> {
  if (!updatesAvailable || state.status === 'checking' || state.status === 'downloading') return state.release;
  set({ status: 'checking', error: null });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(LATEST, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(res.status === 403 ? 'limit' : 'http');
    const data = (await res.json()) as GithubRelease;
    const version = (data.tag_name ?? '').replace(/^v/, '');
    const apk = data.assets?.find((a) => a.name.endsWith('.apk') && !a.name.includes('-dev'));
    const now = Date.now();
    updateSettings({ updateCheckedAt: now });
    if (!version || !apk || compareVersions(version, currentVersion) <= 0) {
      set({ status: 'latest', release: null, checkedAt: now });
      return null;
    }
    const release = { version, notes: plain(data.body ?? ''), url: apk.browser_download_url, size: apk.size };
    set({ status: 'available', release, checkedAt: now });
    return release;
  } catch (e) {
    set({
      status: 'error',
      error:
        e instanceof Error && e.message === 'limit'
          ? 'GitHub временно ограничил проверки. Попробуйте через час.'
          : 'Нет связи с GitHub. Проверьте интернет и попробуйте ещё раз.',
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Пора ли проверить обновления самому (раз в сутки). */
export function updateCheckDue(): boolean {
  return updatesAvailable && Date.now() - getSettings().updateCheckedAt > CHECK_EVERY;
}

/** Разрешено ли Snowwy устанавливать приложения. Android спрашивает это один раз. */
export function canInstall(): boolean {
  try {
    return SnowwyPower?.canInstallPackages?.() ?? false;
  } catch {
    return false;
  }
}

/** Открывает переключатель «Разрешить установку из этого источника». */
export function askInstallPermission() {
  try {
    SnowwyPower?.openInstallPermission?.();
  } catch {
    // экран не открылся — на экране обновления остаётся подсказка
  }
}

/**
 * Скачивает новую версию и открывает системное окно установки.
 * Возвращает false, если что-то не получилось (текст ошибки — в состоянии).
 */
export async function downloadAndInstall(): Promise<boolean> {
  const release = state.release;
  if (!release || state.status === 'downloading') return false;
  set({ status: 'downloading', progress: 0, error: null });
  try {
    const dir = new Directory(Paths.cache, 'updates');
    // Прошлые скачанные версии больше не нужны
    if (dir.exists) dir.delete();
    dir.create();
    const target = new File(dir, `Snowwy-${release.version}.apk`);
    const task = File.createDownloadTask(release.url, target, {
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = totalBytes > 0 ? totalBytes : release.size;
        if (total > 0) set({ progress: Math.min(1, bytesWritten / total) });
      },
    });
    const file = await task.downloadAsync();
    if (!file?.exists) throw new Error('download');
    set({ status: 'available', progress: 1 });
    if (!SnowwyPower?.installApk?.(file.uri)) throw new Error('install');
    return true;
  } catch (e) {
    set({
      status: 'error',
      progress: 0,
      error:
        e instanceof Error && e.message === 'install'
          ? 'Не удалось открыть установку. Скачайте файл со страницы релиза на GitHub.'
          : 'Не удалось скачать обновление. Проверьте интернет и попробуйте ещё раз.',
    });
    return false;
  }
}

/** Человек отложил эту версию: сам о ней больше не напоминаем. */
export function skipVersion(version: string) {
  updateSettings({ updateSkipped: version });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUpdate(): UpdateState {
  return state;
}

export function useUpdate(): UpdateState {
  return useSyncExternalStore(subscribe, () => state);
}
