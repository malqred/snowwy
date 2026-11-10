import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { space, useTheme } from '@/theme';

import { ChevronRight, type IconType } from './icons';

/** Толщина линии всех иконок интерфейса */
export const ICON_STROKE = 1.75;

/** Мелкая подпись заглавными буквами, при желании с иконкой слева. */
export function Label({ children, icon: Icon }: { children: ReactNode; icon?: IconType }) {
  const t = useTheme();
  return (
    <View style={styles.labelRow}>
      {Icon ? <Icon size={14} color={t.sub} strokeWidth={ICON_STROKE} /> : null}
      <Text style={[styles.label, { color: t.sub }]} numberOfLines={1}>
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

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.card, borderColor: t.line }, style]}>{children}</View>;
}

/** Стрелка «дальше» в строках списков. */
export function Chevron() {
  const t = useTheme();
  return <ChevronRight size={18} color={t.sub} strokeWidth={ICON_STROKE} />;
}

export type StatItem = { label: string; value: string; unit?: string; icon?: IconType };

/** Сетка показателей в две или три колонки. */
export function StatGrid({ items, columns = 2 }: { items: StatItem[]; columns?: 2 | 3 }) {
  const t = useTheme();
  const rows: StatItem[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <Card>
      {rows.map((row, r) => (
        <View
          key={r}
          style={[styles.gridRow, r > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
          {row.map((item, c) => (
            <View
              key={item.label}
              style={[
                styles.cell,
                c > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.line },
              ]}>
              <Label icon={item.icon}>{item.label}</Label>
              <Text style={[styles.value, columns === 3 && styles.valueSmall, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
                {item.value}
                {item.unit ? <Text style={[styles.unit, { color: t.sub }]}> {item.unit}</Text> : null}
              </Text>
            </View>
          ))}
          {row.length < columns &&
            Array.from({ length: columns - row.length }, (_, i) => <View key={`empty-${i}`} style={styles.cell} />)}
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
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        filled ? { backgroundColor: t.accent } : { borderWidth: 1, borderColor: kind === 'danger' ? t.danger : t.line },
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}>
      {Icon ? <Icon size={18} color={color} strokeWidth={ICON_STROKE} /> : null}
      <Text style={[styles.buttonText, { color }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  gridRow: { flexDirection: 'row' },
  cell: { flex: 1, paddingHorizontal: space.m, paddingVertical: 14, gap: 6 },
  value: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  valueSmall: { fontSize: 22 },
  unit: { fontSize: 14, fontWeight: '500', letterSpacing: 0 },
  button: {
    height: 54,
    borderRadius: 27,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.l,
  },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
