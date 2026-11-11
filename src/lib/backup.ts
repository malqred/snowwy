import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { copyDatabaseTo, databaseDirectory, importDatabaseFrom, type ImportResult } from './db';
import { dateIso } from './format';
import { getSettings, updateSettings } from './settings';

/**
 * На iPhone папка приложения видна в «Файлах», и копия лежит прямо в ней.
 * На Android папка приложения скрыта от человека, поэтому он сам выбирает папку для копии
 * (например, «Документы»): такой файл виден в любом проводнике и переживает удаление приложения.
 */
const ANDROID = Platform.OS === 'android';

/** Имя копии в папке приложения: «Файлы» → «На iPhone» → Snowwy */
export const BACKUP_NAME = 'Snowwy-backup.db';
const WORK_NAME = 'snowwy-backup-work.db';
const RESTORE_NAME = 'snowwy-restore.db';

const toUri = (path: string) => (path.startsWith('file://') ? path : `file://${path}`);

/** Снимает копию всех записей в файл внутри приложения и возвращает его. */
async function snapshot(target: File): Promise<File> {
  const work = new File(toUri(await copyDatabaseTo(WORK_NAME)));
  if (target.exists) target.delete();
  work.move(target);
  return target;
}

/**
 * Обновляет копию в папке приложения. Вызывается после каждого катания,
 * если резервная копия включена. Ошибки не мешают работе приложения.
 */
export async function autoBackup(): Promise<boolean> {
  try {
    if (ANDROID) return await backupToFolder();
    await snapshot(new File(Paths.document, BACKUP_NAME));
    return true;
  } catch {
    return false;
  }
}

/** Android: даёт выбрать папку для копии. false — человек передумал. */
export async function chooseBackupFolder(): Promise<boolean> {
  try {
    const dir = await Directory.pickDirectoryAsync();
    if (!dir?.uri) return false;
    updateSettings({ backupDir: dir.uri });
    return true;
  } catch {
    return false;
  }
}

/** Android: кладёт свежую копию в выбранную папку, заменяя прежнюю. */
async function backupToFolder(): Promise<boolean> {
  const uri = getSettings().backupDir;
  if (!uri) return false;
  const work = new File(toUri(await copyDatabaseTo(WORK_NAME)));
  try {
    const dir = new Directory(uri);
    for (const item of dir.list()) {
      if (item instanceof File && item.name === BACKUP_NAME) item.delete();
    }
    await dir.createFile(BACKUP_NAME, 'application/octet-stream').write(await work.bytes());
    return true;
  } finally {
    if (work.exists) work.delete();
  }
}

/** Убирает копию из папки приложения (когда резервную копию выключили). */
export function removeAutoBackup() {
  // На Android копия лежит в папке человека — её не трогаем
  if (ANDROID) return;
  try {
    const file = new File(Paths.document, BACKUP_NAME);
    if (file.exists) file.delete();
  } catch {
    // файла нет — убирать нечего
  }
}

/** Готовит свежую копию и открывает меню «Поделиться», чтобы сохранить её вне телефона. */
export async function shareBackup(): Promise<void> {
  const file = await snapshot(new File(Paths.cache, `Snowwy-${dateIso(Date.now())}.db`));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/octet-stream', UTI: 'public.database' });
  updateSettings({ backupSharedAt: Date.now() });
}

/**
 * Даёт выбрать файл копии и добавляет из него недостающие дни.
 * null — пользователь передумал выбирать файл.
 */
export async function restoreBackup(): Promise<ImportResult | null> {
  const picked = await File.pickFileAsync();
  if (picked.canceled) return null;
  const target = new File(toUri(databaseDirectory), RESTORE_NAME);
  if (target.exists) target.delete();
  picked.result.copy(target);
  return importDatabaseFrom(RESTORE_NAME);
}
