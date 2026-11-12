import { requireOptionalNativeModule } from 'expo';

type SnowwyPowerModule = {
  /** Система не ограничивает работу приложения в фоне */
  unrestricted(): boolean;
  /** Показывает системный вопрос о работе в фоне; false — не получилось */
  ask(): boolean;
  /** Открывает «Автозапуск» в оболочке производителя; false — такого экрана нет */
  openVendorSettings(): boolean;
  openAppSettings(): boolean;
  /** Ставит уведомление с этим tag на место уведомления службы геопозиции; false — службы нет */
  mergeRideNotification(tag: string): boolean;
};

/** Модуль есть только в сборке для Android. */
export default requireOptionalNativeModule<SnowwyPowerModule>('SnowwyPower');
