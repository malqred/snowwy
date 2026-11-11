// Android закрывает приложения в фоне ради батареи, а оболочки производителей делают это
// ещё жёстче. Здесь — проверка, снято ли ограничение со Snowwy, и подсказки, где его снять.
import * as Device from 'expo-device';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import SnowwyPower from '../../modules/snowwy-power';

/** Есть ли вообще что настраивать: только в сборке для Android. */
export const powerAvailable = Platform.OS === 'android' && SnowwyPower != null;

/** Система не ограничивает работу Snowwy в фоне. */
export function backgroundAllowed(): boolean {
  try {
    return SnowwyPower?.unrestricted() ?? true;
  } catch {
    return true;
  }
}

/** Показывает системный вопрос «Разрешить приложению работать в фоне?». */
export function askBackground(): boolean {
  try {
    return SnowwyPower?.ask() ?? false;
  } catch {
    return false;
  }
}

/** Открывает «Автозапуск» в оболочке производителя, а если такого экрана нет — страницу приложения. */
export function openBackgroundSettings() {
  try {
    if (!SnowwyPower?.openVendorSettings()) SnowwyPower?.openAppSettings();
  } catch {
    // настройки не открылись — остаётся инструкция на экране
  }
}

export type VendorGuide = { brand: string; steps: string[] };

const GUIDES: { match: RegExp; guide: VendorGuide }[] = [
  {
    match: /xiaomi|redmi|poco/,
    guide: {
      brand: 'Xiaomi, Redmi, POCO',
      steps: [
        'Настройки → Приложения → Все приложения → Snowwy: включите «Автозапуск».',
        'Там же: «Контроль активности» (или «Экономия заряда») → «Нет ограничений».',
        'В списке недавних приложений нажмите и удерживайте карточку Snowwy и нажмите на замок.',
      ],
    },
  },
  {
    match: /samsung/,
    guide: {
      brand: 'Samsung',
      steps: [
        'Настройки → Приложения → Snowwy → Батарея → «Не ограничено».',
        'Настройки → Обслуживание устройства → Батарея → Ограничения в фоновом режиме → «Приложения, которые никогда не переходят в спящий режим» → добавьте Snowwy.',
      ],
    },
  },
  {
    match: /huawei|honor/,
    guide: {
      brand: 'Huawei, Honor',
      steps: [
        'Настройки → Батарея → Запуск приложений → Snowwy: выключите «Управлять автоматически».',
        'В открывшемся окне оставьте включёнными «Автозапуск», «Косвенный запуск» и «Работа в фоновом режиме».',
      ],
    },
  },
  {
    match: /oppo|realme|oneplus/,
    guide: {
      brand: 'OPPO, realme, OnePlus',
      steps: [
        'Настройки → Приложения → Snowwy → Расход батареи: включите «Разрешить работу в фоне» и «Разрешить автозапуск».',
        'В списке недавних приложений нажмите ⋮ у карточки Snowwy → «Закрепить» (значок замка).',
      ],
    },
  },
  {
    match: /vivo|iqoo/,
    guide: {
      brand: 'vivo, iQOO',
      steps: [
        'Настройки → Батарея → «Высокое энергопотребление в фоне» → разрешите Snowwy.',
        'Настройки → Приложения → Автозапуск → включите Snowwy.',
      ],
    },
  },
];

const COMMON: VendorGuide = {
  brand: 'Android',
  steps: ['Настройки → Приложения → Snowwy → Батарея → «Без ограничений» (или «Не ограничено»).'],
};

/** Подсказка для этого телефона: у каждого производителя свои названия пунктов. */
export function vendorGuide(): VendorGuide {
  const who = `${Device.manufacturer ?? ''} ${Device.brand ?? ''}`.toLowerCase();
  return GUIDES.find((g) => g.match.test(who))?.guide ?? COMMON;
}

/** Снято ли ограничение. Перепроверяется при возвращении в приложение из настроек. */
export function useBackgroundAllowed(): boolean {
  const [allowed, setAllowed] = useState(backgroundAllowed);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setAllowed(backgroundAllowed());
    });
    return () => sub.remove();
  }, []);
  return allowed;
}
