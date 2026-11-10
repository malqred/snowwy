import * as Notifications from 'expo-notifications';

// Показываем уведомления и тогда, когда приложение открыто
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Спрашивает разрешение на уведомления, если его ещё нет. */
export async function ensureNotifyPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Показывает уведомление сразу. */
export async function notifyNow(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body, sound: true }, trigger: null });
  } catch {
    // уведомления недоступны — запись от этого не зависит
  }
}

/** Ставит уведомление на будущее. Возвращает его номер для отмены или null. */
export async function notifyLater(title: string, body: string, seconds: number): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
    });
  } catch {
    return null;
  }
}

export async function cancelNotify(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // уже показано или отменено
  }
}
