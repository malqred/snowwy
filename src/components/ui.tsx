import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { space, useTheme } from '@/theme';

/** Мелкая подпись заглавными буквами. */
export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.label, { color: t.sub }]}>{children}</Text>;
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

export type StatItem = { label: string; value: string; unit?: string };

/** Сетка показателей в две или три колонки. */
export function StatGrid({ items, columns = 2 }: { items: StatItem[]; columns?: 2 | 3 }) {
  const t = useTheme();
  const rows: StatItem[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <Card style={styles.grid}>
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
              <Label>{item.label}</Label>
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
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, kind = 'primary', disabled, style }: ButtonProps) {
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
        filled ? { backgroundColor: t.text } : { borderWidth: 1, borderColor: kind === 'danger' ? t.danger : t.line },
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}>
      <Text style={[styles.buttonText, { color }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
  grid: {},
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.l,
  },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
