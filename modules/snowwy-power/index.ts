import { requireOptionalNativeModule } from 'expo';

type SnowwyPowerModule = {
  /** Система не ограничивает работу приложения в фоне */
  unrestricted(): boolean;
  /** Показывает системный вопрос о работе в фоне; false — не получилось */
  ask(): boolean;
  /** Открывает «Автозапуск» в оболочке производителя; false — такого экрана нет */
  openVendorSettings(): boolean;
  openAppSettings(): boolean;
};

/** Модуль есть только в сборке для Android. */
export default requireOptionalNativeModule<SnowwyPowerModule>('SnowwyPower');
