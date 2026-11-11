import { useColorScheme } from 'react-native';

import { useSettings, type PaletteId } from '@/lib/settings';

export type Theme = {
  dark: boolean;
  bg: string;
  card: string;
  text: string;
  sub: string;
  line: string;
  /** Заливка главных кнопок и выбранных элементов */
  accent: string;
  /** Цвет текста и иконок на заливке accent */
  inverse: string;
  danger: string;
  /** Фон-градиент: цвет верха и два светлых пятна */
  bgTop: string;
  glowA: string;
  glowAOpacity: number;
  glowB: string;
  glowBOpacity: number;
  /** Стекло: оттенок тонированного, заливка прозрачного (когда стекла в системе нет), акцент и кромка */
  glassTint: string;
  glassClear: string;
  glassAccent: string;
  glassEdge: string;
};

/** Расцветка: пять оттенков от самого тёмного к самому светлому. */
type Shades = {
  ink: string;
  deep: string;
  mid: string;
  soft: string;
  pale: string;
  /** Свой цвет акцента вместо оттенка из ряда (например, оранжевый в «Осени») */
  accentDark?: string;
  accentLight?: string;
  /** Цвет подписей в светлой теме, если средний оттенок на светлом читается плохо */
  subLight?: string;
};

export const PALETTES: { id: PaletteId; title: string; shades: Shades }[] = [
  {
    id: 'ice',
    title: 'Лёд',
    shades: { ink: '#0A1523', deep: '#1F3952', mid: '#4D728F', soft: '#8FB1C9', pale: '#CADCEA' },
  },
  {
    id: 'emerald',
    title: 'Хвоя',
    shades: { ink: '#0B2625', deep: '#184948', mid: '#317978', soft: '#6FB0AF', pale: '#B7E6E5', subLight: '#235E5D' },
  },
  {
    id: 'autumn',
    title: 'Осень',
    shades: {
      ink: '#1F1006',
      deep: '#3C3428',
      mid: '#46695F',
      soft: '#8FA890',
      pale: '#D9BD98',
      accentDark: '#D9772A',
      accentLight: '#B6410F',
      subLight: '#46695F',
    },
  },
  {
    id: 'sunset',
    title: 'Закат',
    shades: {
      ink: '#1D1A39',
      deep: '#451952',
      mid: '#AE445A',
      soft: '#D9A0AC',
      pale: '#E8BCB9',
      accentDark: '#F39F5A',
      subLight: '#662549',
    },
  },
  {
    id: 'garnet',
    title: 'Гранат',
    shades: { ink: '#2B0710', deep: '#5C0F21', mid: '#C82A4C', soft: '#EC8FA1', pale: '#FCE3E8', subLight: '#921733' },
  },
  {
    id: 'truffle',
    title: 'Трюфель',
    shades: { ink: '#1F1915', deep: '#453C36', mid: '#8C8076', soft: '#C7BBB1', pale: '#F5EDE6', subLight: '#594F47' },
  },
];

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Смешивает два цвета: k = 0 — первый, k = 1 — второй. */
function mix(a: string, b: string, k: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const part = (i: number) =>
    Math.round(x[i] + (y[i] - x[i]) * k)
      .toString(16)
      .padStart(2, '0');
  return `#${part(0)}${part(1)}${part(2)}`;
}

function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

const WHITE = '#FFFFFF';

function darkTheme(s: Shades): Theme {
  const accent = s.accentDark ?? s.soft;
  return {
    dark: true,
    bg: s.ink,
    bgTop: mix(s.ink, s.deep, 0.6),
    card: mix(s.ink, s.deep, 0.45),
    text: s.pale,
    sub: s.soft,
    line: alpha(s.pale, 0.16),
    accent,
    inverse: s.ink,
    danger: '#E8695C',
    glowA: s.soft,
    glowAOpacity: 0.4,
    glowB: s.mid,
    glowBOpacity: 0.45,
    glassTint: alpha(mix(s.ink, s.deep, 0.35), 0.6),
    glassClear: alpha(s.pale, 0.1),
    glassAccent: alpha(s.accentDark ?? mix(s.soft, s.pale, 0.6), 0.9),
    glassEdge: alpha(s.pale, 0.22),
  };
}

function lightTheme(s: Shades): Theme {
  const card = mix(s.pale, WHITE, 0.65);
  const accent = s.accentLight ?? s.deep;
  return {
    dark: false,
    bg: s.pale,
    bgTop: mix(s.pale, WHITE, 0.5),
    card,
    text: s.ink,
    sub: s.subLight ?? s.mid,
    line: alpha(s.deep, 0.16),
    accent,
    inverse: card,
    danger: '#B8392C',
    glowA: WHITE,
    glowAOpacity: 0.9,
    glowB: s.soft,
    glowBOpacity: 0.45,
    glassTint: 'rgba(255,255,255,0.62)',
    glassClear: 'rgba(255,255,255,0.32)',
    glassAccent: alpha(accent, 0.92),
    glassEdge: 'rgba(255,255,255,0.8)',
  };
}

const THEMES = Object.fromEntries(
  PALETTES.map((p) => [p.id, { light: lightTheme(p.shades), dark: darkTheme(p.shades) }])
) as Record<PaletteId, { light: Theme; dark: Theme }>;

export function useTheme(): Theme {
  const dark = useColorScheme() === 'dark';
  const { palette } = useSettings();
  const set = THEMES[palette] ?? THEMES.ice;
  return dark ? set.dark : set.light;
}

/** Образец расцветки для выбора в настройках: пять оттенков от тёмного к светлому. */
export function swatches(id: PaletteId): string[] {
  const s = (PALETTES.find((p) => p.id === id) ?? PALETTES[0]).shades;
  return [s.ink, s.deep, s.mid, s.accentDark ?? s.soft, s.pale];
}

/**
 * Цвета спусков и подъёмников. Одинаковые во всех расцветках и темах:
 * оранжевый и синий различимы на любом фоне и при нарушениях цветового зрения.
 */
export const RUN_COLOR = '#F0872E';
export const LIFT_COLOR = '#3F97F0';

/** Шкала скорости для раскраски трека: от медленного к быстрому. */
export const SPEED_COLORS = ['#3D7FC2', '#3FA672', '#DDB23C', '#E07C3A', '#CC3A2E'];

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32 } as const;
