import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useSettings } from '@/lib/settings';
import { space, useTheme } from '@/theme';

import { ChevronRight, type IconType } from './icons';

/** Толщина линии всех иконок интерфейса */
export const ICON_STROKE = 1.75;

/** Настоящее «жидкое стекло» есть только на iOS 26 и новее в установленном приложении. */
export const GLASS_AVAILABLE = (() => {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

/** Фон экрана: мягкий градиент с двумя светлыми пятнами — на нём стекло и «работает». */
export function Backdrop() {
  const t = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="base" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.bgTop} />
            <Stop offset="0.7" stopColor={t.bg} />
          </LinearGradient>
          <RadialGradient id="glowA" cx="0.85" cy="0.08" r="0.6">
            <Stop offset="0" stopColor={t.glowA} stopOpacity={t.glowAOpacity} />
            <Stop offset="1" stopColor={t.glowA} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glowB" cx="0" cy="0.62" r="0.65">
            <Stop offset="0" stopColor={t.glowB} stopOpacity={t.glowBOpacity} />
            <Stop offset="1" stopColor={t.glowB} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#base)" />
        <Rect x="0" y="0" width="100" height="100" fill="url(#glowA)" />
        <Rect x="0" y="0" width="100" height="100" fill="url(#glowB)" />
      </Svg>
    </View>
  );
}

/** Экран с фоном-градиентом и прокруткой. */
export function Screen({ children, style, ...rest }: ScrollViewProps) {
  return (
    <View style={styles.screen}>
      <Backdrop />
      {/* Когда открыта клавиатура, прокрутка сама поднимает поле ввода над ней */}
      <ScrollView
        style={[styles.screen, style]}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
        {...rest}>
        {children}
      </ScrollView>
    </View>
  );
}

/** Экран без прокрутки (заглушки «загрузка», «не найдено», стартовый экран). */
export function Plain({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={styles.screen}>
      <Backdrop />
      <View style={[styles.screen, style]}>{children}</View>
    </View>
  );
}

type SurfaceProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Акцентная поверхность: главная плитка, выбранный пункт */
  accent?: boolean;
  /** Тихая поверхность: без заливки, только тонкая рамка — для второстепенного */
  quiet?: boolean;
};

/**
 * Поверхность плитки или кнопки. Вид зависит от настройки «Стекло»:
 * плотная заливка, тонированное стекло или прозрачное стекло.
 */
export function Surface({ children, style, accent = false, quiet = false }: SurfaceProps) {
  const t = useTheme();
  const { glass } = useSettings();

  if (quiet) {
    return <View style={[{ borderWidth: 1, borderColor: t.line }, style]}>{children}</View>;
  }

  if (glass === 'solid') {
    return <View style={[{ backgroundColor: accent ? t.accent : t.card }, style]}>{children}</View>;
  }
  if (GLASS_AVAILABLE) {
    const tint = accent ? t.glassAccent : glass === 'tinted' ? t.glassTint : undefined;
    return (
      <GlassView
        glassEffectStyle={glass === 'clear' && !accent ? 'clear' : 'regular'}
        tintColor={tint}
        colorScheme={t.dark ? 'dark' : 'light'}
        style={style}>
        {children}
      </GlassView>
    );
  }
  // Стекла в системе нет — рисуем полупрозрачную плитку с тонкой светлой кромкой
  return (
    <View
      style={[
        {
          backgroundColor: accent ? t.glassAccent : glass === 'tinted' ? t.glassTint : t.glassClear,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.glassEdge,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

/** Цвет текста на акцентной поверхности при текущей настройке стекла. */
export function useOnAccent(): string {
  return useTheme().inverse;
}

/** Мелкая подпись заглавными буквами, при желании с иконкой слева. */
export function Label({ children, icon: Icon, color }: { children: ReactNode; icon?: IconType; color?: string }) {
  const t = useTheme();
  return (
    <View style={styles.labelRow}>
      {Icon ? <Icon size={14} color={color ?? t.sub} strokeWidth={ICON_STROKE} /> : null}
      <Text style={[styles.label, { color: color ?? t.sub }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/** Заголовок экрана. */
export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.title, { color: t.text }]}>{children}</Text>;
}

export function Card({ children, style, accent, quiet }: SurfaceProps) {
  return (
    <Surface accent={accent} quiet={quiet} style={[styles.card, style]}>
      {children}
    </Surface>
  );
}

/** Стрелка «дальше» в строках списков. */
export function Chevron() {
  const t = useTheme();
  return <ChevronRight size={18} color={t.sub} strokeWidth={ICON_STROKE} />;
}

export type StatItem = { label: string; value: string; unit?: string; icon?: IconType };

/** Одна плитка с показателем. */
export function StatTile({
  item,
  small,
  fill,
  style,
}: {
  item: StatItem;
  small?: boolean;
  /** Растянуться на всю доступную высоту (плитки в колонке рядом с главной) */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Card style={[styles.tile, small && styles.tileSmall, fill && styles.tileFill, style]}>
      <Label icon={small ? undefined : item.icon}>{item.label}</Label>
      <Text style={[styles.value, small && styles.valueSmall, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {item.value}
        {item.unit ? <Text style={[styles.unit, { color: t.sub }]}> {item.unit}</Text> : null}
      </Text>
    </Card>
  );
}

/** Показатели плитками в две или три колонки. */
export function StatGrid({ items, columns = 2 }: { items: StatItem[]; columns?: 2 | 3 }) {
  const rows: StatItem[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          {row.map((item) => (
            <StatTile key={item.label} item={item} small={columns === 3} style={styles.flex} />
          ))}
          {row.length < columns &&
            Array.from({ length: columns - row.length }, (_, i) => <View key={`empty-${i}`} style={styles.flex} />)}
        </View>
      ))}
    </View>
  );
}

/**
 * Второстепенные показатели одной полосой: значение сверху, подпись снизу.
 * Занимает мало места и не спорит с главными плитками.
 */
export function StatStrip({ items }: { items: StatItem[] }) {
  const t = useTheme();
  return (
    <Card style={styles.strip}>
      {items.map((item, i) => (
        <View
          key={item.label}
          style={[styles.stripCell, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.line }]}>
          <Text style={[styles.stripValue, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {item.value}
            {item.unit ? <Text style={[styles.stripUnit, { color: t.sub }]}> {item.unit}</Text> : null}
          </Text>
          <Text style={[styles.stripLabel, { color: t.sub }]} numberOfLines={1} adjustsFontSizeToFit>
            {item.label}
          </Text>
        </View>
      ))}
    </Card>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  icon?: IconType;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, kind = 'primary', icon: Icon, disabled, style }: ButtonProps) {
  const t = useTheme();
  const filled = kind === 'primary';
  const color = kind === 'danger' ? t.danger : filled ? t.inverse : t.text;
  const body = (
    <>
      {Icon ? <Icon size={18} color={color} strokeWidth={ICON_STROKE} /> : null}
      <Text style={[styles.buttonText, { color }]}>{title}</Text>
    </>
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [(pressed || disabled) && { opacity: 0.6 }, style]}>
      {filled ? (
        <View style={[styles.button, { backgroundColor: t.accent }]}>{body}</View>
      ) : (
        <Surface style={styles.button}>{body}</Surface>
      )}
    </Pressable>
  );
}

type SegmentsProps<T extends string> = {
  options: { value: T; title: string; icon?: IconType }[];
  value: T;
  onChange: (value: T) => void;
};

/** Переключатель из нескольких вариантов. */
export function Segments<T extends string>({ options, value, onChange }: SegmentsProps<T>) {
  const t = useTheme();
  return (
    <Surface style={styles.segments}>
      {options.map(({ value: v, title, icon: Icon }) => {
        const active = v === value;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && { backgroundColor: t.accent }]}>
            {Icon ? <Icon size={16} color={active ? t.inverse : t.text} strokeWidth={ICON_STROKE} /> : null}
            <Text style={[styles.segmentText, { color: active ? t.inverse : t.text }]} numberOfLines={1}>
              {title}
            </Text>
          </Pressable>
        );
      })}
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  card: {
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  grid: { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },
  tile: { paddingHorizontal: space.m, paddingVertical: 14, gap: 6 },
  tileFill: { flex: 1, justifyContent: 'space-between' },
  tileSmall: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 16 },
  value: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  valueSmall: { fontSize: 21, letterSpacing: -0.4 },
  unit: { fontSize: 14, fontWeight: '500', letterSpacing: 0 },
  strip: { flexDirection: 'row', paddingVertical: 12 },
  stripCell: { flex: 1, alignItems: 'center', paddingHorizontal: 6, gap: 3 },
  stripValue: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  stripUnit: { fontSize: 11, fontWeight: '500', letterSpacing: 0 },
  stripLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  button: {
    height: 56,
    borderRadius: 28,
    borderCurve: 'continuous',
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.l,
  },
  buttonText: { fontSize: 17, fontWeight: '600' },
  segments: {
    flexDirection: 'row',
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 42,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  segmentText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
});

/**
 * Цвет кружка переключателя. На Android по умолчанию он бирюзовый (цвет системы), а не в цветах
 * приложения, поэтому во включённом состоянии красим его в контрастный к акценту цвет.
 */
export function switchThumb(t: { dark: boolean; inverse: string }, on: boolean): string | undefined {
  if (Platform.OS === 'android') return on ? t.inverse : undefined;
  return t.dark && on ? t.inverse : undefined;
}
