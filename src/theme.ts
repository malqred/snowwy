import { useColorScheme } from 'react-native';

/** Палитра приложения: пять оттенков от тёмно-синего до ледяного. */
export const palette = {
  ink: '#0A1523',
  deep: '#1F3952',
  mid: '#4D728F',
  sky: '#8FB1C9',
  ice: '#CADCEA',
} as const;

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
};

const light: Theme = {
  dark: false,
  bg: '#DCE8F1',
  card: '#EEF4F8',
  text: palette.ink,
  sub: palette.mid,
  line: '#BCD0DF',
  accent: palette.deep,
  inverse: '#EEF4F8',
  danger: '#B8392C',
};

const dark: Theme = {
  dark: true,
  bg: palette.ink,
  card: '#12233A',
  text: palette.ice,
  sub: palette.sky,
  line: palette.deep,
  accent: palette.sky,
  inverse: palette.ink,
  danger: '#E8695C',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Шкала скорости для раскраски трека: от медленного к быстрому. */
export const SPEED_COLORS = ['#3D7FC2', '#3FA672', '#DDB23C', '#E07C3A', '#CC3A2E'];

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32 } as const;
