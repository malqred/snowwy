// Очистка скорости, которую сообщает телефон.
//
// Когда человек стоит, iPhone иногда не знает скорость (присылает −1) или присылает
// случайный всплеск, а сами координаты «прыгают» на десятки метров — особенно в помещении
// и рядом со зданиями, где к спутникам подмешиваются точки по Wi‑Fi и сотовым вышкам.
// Если считать скорость по двум соседним точкам, прыжок на 15 м за секунду превращается
// в 54 км/ч. Здесь скорость сверяется с тем, насколько человек на самом деле сместился
// за последние секунды.

/** Отсчёт геопозиции, как он пришёл от телефона. */
export type Fix = {
  /** Время, мс */
  t: number;
  lat: number;
  lon: number;
  /** Горизонтальная точность, м */
  acc: number;
  /** Скорость от телефона, м/с; null или отрицательная — неизвестна */
  speed: number | null;
};

/** За какое время смотрим на смещение, мс */
const WINDOW = 5000;
/** Меньше этого истории — смещению верить рано, мс */
const MIN_SPAN = 2000;
/** Скорость ниже этой не проверяем: это шаг или стояние, м/с */
const SLOW = 1.5;
/** Быстрее этого скорость за секунду вырасти не может, м/с² */
const MAX_ACCEL = 6;
/** Без истории верим скорости только при такой точности, м */
const TRUSTED_ACC = 20;

const RAD = Math.PI / 180;
const M_PER_DEG = 111320;

/** Расстояние между близкими точками, м (на таких отрезках кривизна Земли не важна). */
function flatDistance(a: Fix, b: Fix): number {
  const dy = (b.lat - a.lat) * M_PER_DEG;
  const dx = (b.lon - a.lon) * M_PER_DEG * Math.cos(((a.lat + b.lat) / 2) * RAD);
  return Math.sqrt(dx * dx + dy * dy);
}

const known = (fix: Fix): number | null => (fix.speed != null && fix.speed >= 0 ? fix.speed : null);

export type SpeedFilter = {
  /** Принимает очередной отсчёт и возвращает очищенную скорость, м/с. */
  push: (fix: Fix) => number;
  reset: () => void;
};

export function createSpeedFilter(): SpeedFilter {
  let recent: Fix[] = [];

  function push(fix: Fix): number {
    const last = recent[recent.length - 1];
    // После разрыва в записи старые точки ничего не говорят о текущем движении
    if (last && fix.t - last.t > WINDOW) recent = [];
    recent.push(fix);
    while (recent.length > 1 && fix.t - recent[0].t > WINDOW) recent.shift();

    const first = recent[0];
    const span = (fix.t - first.t) / 1000;
    const hasHistory = span >= MIN_SPAN / 1000;

    // Смещение за окно и скорость по нему. Смещение в пределах погрешности — это стояние.
    const net = flatDistance(first, fix);
    const noise = Math.max(first.acc, fix.acc, 3);
    const positional = hasHistory && net > noise ? net / span : 0;

    const reported = known(fix);
    if (reported == null) return positional;
    if (reported <= SLOW) return reported;
    if (!hasHistory) return fix.acc <= TRUSTED_ACC ? reported : 0;

    // Путь, который человек должен был пройти за окно, если верить скоростям телефона
    let path = 0;
    let before = known(first) ?? 0;
    for (let i = 1; i < recent.length; i++) {
      const dt = (recent[i].t - recent[i - 1].t) / 1000;
      path += (known(recent[i]) ?? 0) * dt;
      if (i < recent.length - 1) before = Math.max(before, known(recent[i]) ?? 0);
    }
    // Ехал — значит сместился хотя бы на заметную часть этого пути
    if (net < path * 0.4 - 2) return positional;

    // Одиночный всплеск: за секунду так разогнаться нельзя
    const dt = (fix.t - recent[recent.length - 2].t) / 1000;
    return Math.min(reported, before + MAX_ACCEL * Math.max(dt, 1));
  }

  return {
    push,
    reset() {
      recent = [];
    },
  };
}

/** Скорость для показа на экране: среднее последних значений, мелочь округляется до нуля. */
export function displaySpeed(lastSpeeds: number[]): number {
  if (lastSpeeds.length === 0) return 0;
  const avg = lastSpeeds.reduce((a, b) => a + b, 0) / lastSpeeds.length;
  return avg < 0.6 ? 0 : avg;
}
