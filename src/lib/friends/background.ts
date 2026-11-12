// Фоновая проверка группы, когда запись не идёт: так телефон узнаёт о новой точке встречи
// и ставит напоминания, даже если приложение закрыто. Android запускает проверку примерно
// раз в 15 минут, iPhone — когда сочтёт нужным (обычно реже).
import { isRunningInExpoGo } from 'expo';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';

import { getTracker } from '../tracker';
import { getFriends, refreshFriends } from './store';

const TASK = 'snowwy-friends-check';

TaskManager.defineTask(TASK, async () => {
  try {
    // Во время записи группа и так обновляется раз в полминуту
    if (getFriends().group && !getTracker().recording) await refreshFriends();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Включает фоновую проверку, пока человек в группе; выключает, когда группы нет. */
export async function syncFriendsInBackground(on: boolean): Promise<void> {
  // В Expo Go фоновые задачи на iPhone не работают
  if (isRunningInExpoGo()) return;
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(TASK);
    if (on && !registered) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
    if (!on && registered) await BackgroundTask.unregisterTaskAsync(TASK);
  } catch {
    // фоновые задачи недоступны — точки встречи придут при открытии приложения
  }
}

let watching = false;

/** Обновляет группу, когда приложение открывают: новая точка встречи видна сразу. */
export function watchAppOpen() {
  if (watching) return;
  watching = true;
  AppState.addEventListener('change', (s) => {
    if (s === 'active' && getFriends().group && !getTracker().recording) refreshFriends().catch(() => {});
  });
}
