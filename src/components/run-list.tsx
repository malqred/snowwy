import { Pressable, StyleSheet, Text, View } from 'react-native';

import { clock, distance, kmh, num, time } from '@/lib/format';
import type { Segment } from '@/lib/types';
import { space, useTheme } from '@/theme';

import { Card } from './ui';

type Props = {
  runs: Segment[];
  onPress?: (run: Segment) => void;
  /** Подписи к лучшим спускам: номер спуска → текст */
  badges?: Record<number, string>;
};

/** Список спусков: номер, время, перепад и расстояние, максимальная скорость. */
export function RunList({ runs, onPress, badges }: Props) {
  const t = useTheme();
  return (
    <Card>
      {runs.map((run, i) => {
        const d = distance(run.distance);
        return (
          <Pressable
            key={run.n}
            disabled={!onPress}
            onPress={() => onPress?.(run)}
            accessibilityRole={onPress ? 'button' : undefined}
            style={({ pressed }) => [
              styles.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
              pressed && { opacity: 0.6 },
            ]}>
            <View style={[styles.badge, { borderColor: t.line }]}>
              <Text style={[styles.badgeText, { color: t.text }]}>{run.n}</Text>
            </View>
            <View style={styles.body}>
              <Text style={[styles.main, { color: t.text }]}>
                {num(run.vertical)} м · {d.value} {d.unit}
              </Text>
              <Text style={[styles.sub, { color: t.sub }]}>
                {time(run.startedAt)} · {clock(run.duration)}
                {run.open ? ' · идёт' : ''}
              </Text>
              {badges?.[run.n] ? <Text style={[styles.badgeNote, { color: t.text }]}>{badges[run.n]}</Text> : null}
            </View>
            <View style={styles.right}>
              <Text style={[styles.speed, { color: t.text }]}>{kmh(run.maxSpeed)}</Text>
              <Text style={[styles.sub, { color: t.sub }]}>км/ч макс.</Text>
            </View>
            {onPress ? <Text style={[styles.chevron, { color: t.sub }]}>›</Text> : null}
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.m,
    paddingVertical: 12,
    gap: 12,
    minHeight: 64,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  body: { flex: 1, gap: 2 },
  main: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 13, fontVariant: ['tabular-nums'] },
  badgeNote: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 2 },
  speed: { fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  chevron: { fontSize: 22, marginLeft: -4 },
});
