import { useColorScheme } from 'react-native';

const light = {
  dark: false,
  bg: '#F2EFEA',
  card: '#FBFAF7',
  text: '#1B1B1B',
  sub: '#7B766E',
  line: '#DEDAD2',
  /** Цвет текста на залитых кнопках */
  inverse: '#F2EFEA',
  danger: '#B8392C',
};

const dark: typeof light = {
  dark: true,
  bg: '#0D0D0D',
  card: '#191918',
  text: '#F2EFEA',
  sub: '#8F8A82',
  line: '#2B2A28',
  inverse: '#0D0D0D',
  danger: '#E8695C',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Шкала скорости для раскраски трека: от медленного к быстрому. */
export const SPEED_COLORS = ['#3D7FC2', '#3FA672', '#DDB23C', '#E07C3A', '#CC3A2E'];

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 32 } as const;
