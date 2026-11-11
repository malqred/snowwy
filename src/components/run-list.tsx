import { Pressable, StyleSheet, Text, View } from 'react-native';

import { clock, distance, kmh, num, time } from '@/lib/format';
import { difficultyInfo } from '@/lib/pistes';
import type { RunPiste, Segment } from '@/lib/types';
import { useTheme } from '@/theme';

import { Card, Chevron } from './ui';

type Props = {
  runs: Segment[];
  onPress?: (run: Segment) => void;
  /** Подписи к лучшим спускам: номер спуска → текст */
  badges?: Record<number, string>;
  /** Трассы спусков, если их удалось определить по карте */
  pistes?: RunPiste[] | null;
};

/** Спуски отдельными плитками: номер, время, а ниже — перепад, расстояние и скорость. */
export function RunList({ runs, onPress, badges, pistes }: Props) {
  const t = useTheme();
  return (
    <View style={styles.list}>
      {runs.map((run) => {
        const d = distance(run.distance);
        const piste = pistes?.find((p) => p.t === run.startedAt);
        const cells = [
          { label: 'Перепад', value: num(run.vertical), unit: 'м' },
          { label: 'Путь', value: d.value, unit: d.unit },
          { label: 'Макс.', value: kmh(run.maxSpeed), unit: 'км/ч' },
          { label: 'Средняя', value: kmh(run.avgSpeed), unit: 'км/ч' },
        ];
        return (
          <Pressable
            key={run.n}
            disabled={!onPress}
            onPress={() => onPress?.(run)}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={`Спуск ${run.n}`}
            style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Card style={styles.tile}>
              <View style={styles.head}>
                <View style={[styles.number, { backgroundColor: t.accent }]}>
                  <Text style={[styles.numberText, { color: t.inverse }]}>{run.n}</Text>
                </View>
                <View style={styles.headBody}>
                  {piste ? (
                    <View style={styles.piste}>
                      <View style={[styles.dot, { backgroundColor: difficultyInfo(piste.difficulty).color }]} />
                      <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
                        {piste.name}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={[piste ? styles.badge : styles.title, { color: piste ? t.sub : t.text }]}>
                    {time(run.startedAt)} · {clock(run.duration)}
                    {run.open ? ' · идёт' : ''}
                  </Text>
                  {badges?.[run.n] ? <Text style={[styles.badge, { color: t.sub }]}>{badges[run.n]}</Text> : null}
                </View>
                {onPress ? <Chevron /> : null}
              </View>
              <View style={styles.cells}>
                {cells.map((c) => (
                  <View key={c.label} style={styles.cell}>
                    <Text style={[styles.label, { color: t.sub }]} numberOfLines={1}>
                      {c.label}
                    </Text>
                    <Text style={[styles.value, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
                      {c.value}
                      <Text style={[styles.unit, { color: t.sub }]}> {c.unit}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  tile: { padding: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  number: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  headBody: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  badge: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  piste: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  cells: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, gap: 3 },
  label: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  value: { fontSize: 19, fontWeight: '700', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 11, fontWeight: '500', letterSpacing: 0 },
});
