// Android: постоянное уведомление с ходом катания и кнопками «Пауза» и «Завершить».
// Заменяет окно на экране блокировки, которое есть на iPhone.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const RIDE_NOTIFICATION = 'snowwy-ride';
const CHANNEL = 'ride';

type Mode = 'ride' | 'paused' | 'confirm';
export type RideButton = 'pause' | 'stop' | 'stop-yes' | 'stop-no';

const CATEGORY: Record<Mode, string> = { ride: 'snowwy-ride', paused: 'snowwy-ride-paused', confirm: 'snowwy-ride-confirm' };

let prepared: Promise<void> | null = null;
let sub: { remove: () => void } | null = null;

const button = (identifier: RideButton, buttonTitle: string) => ({
  identifier,
  buttonTitle,
  // Кнопка срабатывает прямо из шторки, приложение не открывается
  options: { opensAppToForeground: false },
});

/** Один раз заводит тихий канал уведомлений и наборы кнопок. */
function prepare(): Promise<void> {
  prepared ??= (async () => {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Ход катания',
      description: 'Постоянное уведомление со спусками и расстоянием, пока идёт запись',
      // Проверка импортов не видит эти перечисления сквозь «export *», хотя они на месте
      // eslint-disable-next-line import/namespace
      importance: Notifications.AndroidImportance.LOW,
      // eslint-disable-next-line import/namespace
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: false,
      enableVibrate: false,
      sound: null,
    });
    await Notifications.setNotificationCategoryAsync(CATEGORY.ride, [
      button('pause', 'Пауза'),
      button('stop', 'Завершить'),
    ]);
    await Notifications.setNotificationCategoryAsync(CATEGORY.paused, [
      button('pause', 'Продолжить'),
      button('stop', 'Завершить'),
    ]);
    await Notifications.setNotificationCategoryAsync(CATEGORY.confirm, [
      button('stop-yes', 'Да, завершить'),
      button('stop-no', 'Нет'),
    ]);
  })().catch(() => {
    prepared = null;
  });
  return prepared;
}

/** Показывает уведомление или заменяет его текст. */
export async function showRideNotification(title: string, body: string, mode: Mode): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await prepare();
    await Notifications.scheduleNotificationAsync({
      identifier: RIDE_NOTIFICATION,
      content: {
        title,
        body,
        // Не смахивается и не исчезает после нажатия кнопки
        sticky: true,
        autoDismiss: false,
        sound: false,
        categoryIdentifier: CATEGORY[mode],
        priority: Notifications.AndroidNotificationPriority.LOW,
      },
      trigger: { channelId: CHANNEL },
    });
  } catch {
    // уведомления запрещены — запись от этого не зависит
  }
}

export async function hideRideNotification(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.dismissNotificationAsync(RIDE_NOTIFICATION);
  } catch {
    // уведомления уже нет
  }
}

/** Подключает кнопки уведомления. Нажатия приходят, пока приложение живо в фоне. */
export function bindRideButtons(onPress: (button: RideButton) => void) {
  if (Platform.OS !== 'android' || sub) return;
  sub = Notifications.addNotificationResponseReceivedListener((response) => {
    if (response.notification.request.identifier !== RIDE_NOTIFICATION) return;
    const id = response.actionIdentifier;
    if (id === 'pause' || id === 'stop' || id === 'stop-yes' || id === 'stop-no') onPress(id);
  });
}
