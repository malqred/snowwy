/** Одна точка GPS-трека. */
export type TrackPoint = {
  /** Время, мс с начала эпохи */
  t: number;
  lat: number;
  lon: number;
  /** Высота над уровнем моря, м */
  alt: number;
  /** Скорость, м/с */
  speed: number;
  /** Горизонтальная точность, м */
  acc: number;
};

export type SegmentKind = 'run' | 'lift';

/** Спуск или подъём, найденный в треке. */
export type Segment = {
  kind: SegmentKind;
  /** Порядковый номер среди сегментов своего типа, с 1 */
  n: number;
  /** Индексы первой и последней точки в массиве точек */
  from: number;
  to: number;
  startedAt: number;
  endedAt: number;
  /** Длительность, с */
  duration: number;
  /** Время в движении, с */
  movingTime: number;
  /** Расстояние по склону, м */
  distance: number;
  /** Перепад высот, м (всегда положительный) */
  vertical: number;
  startAlt: number;
  endAlt: number;
  /** Скорости, м/с */
  avgSpeed: number;
  maxSpeed: number;
  minSpeed: number;
  /** Уклон, градусы: средний и на самом крутом отрезке */
  avgSlope: number;
  maxSlope: number;
  /** Сегмент ещё продолжается (последний в записи) */
  open: boolean;
};

export type LiveState = 'run' | 'lift' | 'pause' | 'move';

export type Totals = {
  runs: number;
  lifts: number;
  /** Суммарная дистанция спусков, м */
  distance: number;
  /** Суммарный перепад спусков, м */
  vertical: number;
  /** Максимальная скорость на спусках, м/с */
  maxSpeed: number;
  /** Средняя скорость на спусках, м/с */
  avgSpeed: number;
  /** Время на спусках и на подъёмниках, с */
  runTime: number;
  liftTime: number;
  maxAlt: number;
  minAlt: number;
  /** Самый длинный спуск, м, и самый большой перепад одного спуска, м. В старых записях их нет. */
  longestRun?: number;
  biggestRunVertical?: number;
};

export type Analysis = {
  segments: Segment[];
  totals: Totals;
  state: LiveState;
  /** Сглаженные ряды, по одному значению на точку */
  alt: number[];
  speed: number[];
};

/** Погода в начале катания (данные Open-Meteo). */
export type Weather = {
  /** Температура и «ощущается как», °C */
  temp: number;
  feels: number;
  /** Ветер и порывы, м/с */
  wind: number;
  gusts: number;
  /** Код погоды ВМО */
  code: number;
  /** Свежий снег за последний час, см */
  snowfall: number;
  /** Высота снежного покрова, м; null — нет данных */
  snowDepth: number | null;
};

/** Спуск, для которого нашлась трасса на карте. */
export type RunPiste = {
  /** Время начала спуска — по нему спуск находится в записи */
  t: number;
  name: string;
  /** Сложность по карте: novice, easy, intermediate, advanced… */
  difficulty: string;
  duration: number;
  distance: number;
  vertical: number;
  maxSpeed: number;
  avgSpeed: number;
};

/** Запись в истории (день катания). */
export type Session = {
  id: number;
  startedAt: number;
  endedAt: number | null;
  totals: Totals | null;
  /** Погода в начале катания. Нет у старых записей и если не было интернета. */
  weather: Weather | null;
  /** Трассы спусков. null — ещё не определяли (или не было интернета) */
  pistes: RunPiste[] | null;
};
