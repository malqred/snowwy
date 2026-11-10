import type { ComponentRef, Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { thin } from '@/lib/analyze';
import { dateLong, int, km, kmh, runsWord } from '@/lib/format';
import { project } from '@/lib/lines';
import type { Segment, Totals, TrackPoint } from '@/lib/types';
import { useTheme } from '@/theme';

import { Logo } from './logo';

type Props = {
  ref?: Ref<ComponentRef<typeof View>>;
  startedAt: number;
  totals: Totals;
  points: TrackPoint[];
  segments: Segment[];
};

const WIDTH = 320;
const SKETCH = { width: WIDTH - 48, height: 170 };

/** Карточка с итогами дня — её снимок отправляется через «Поделиться». */
export function ShareCard({ ref, startedAt, totals, points, segments }: Props) {
  const t = useTheme();
  const runs = segments.filter((s) => s.kind === 'run');
  const paths = project(
    runs.map((s) => thin(points.slice(s.from, s.to + 1), 120)),
    SKETCH.width,
    SKETCH.height
  ).map((line) => line.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '));

  const stats = [
    { label: 'Дистанция', value: km(totals.distance), unit: 'км' },
    { label: 'Перепад', value: int(totals.vertical), unit: 'м' },
    { label: 'Макс.', value: kmh(totals.maxSpeed), unit: 'км/ч' },
  ];

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { backgroundColor: t.bg }]}>
      <View style={styles.head}>
        <Logo size={40} color={t.text} />
        <Text style={[styles.date, { color: t.sub }]}>{dateLong(startedAt)}</Text>
      </View>

      <Svg width={SKETCH.width} height={SKETCH.height}>
        {paths.map((d, i) => (
          <Path key={i} d={d} stroke={t.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
      </Svg>

      <View>
        <Text style={[styles.count, { color: t.text }]}>{totals.runs}</Text>
        <Text style={[styles.countLabel, { color: t.text }]}>{runsWord(totals.runs)}</Text>
      </View>

      <View style={[styles.stats, { borderTopColor: t.line }]}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={[styles.statLabel, { color: t.sub }]}>{s.label}</Text>
            <Text style={[styles.statValue, { color: t.text }]}>
              {s.value}
              <Text style={[styles.statUnit, { color: t.sub }]}> {s.unit}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: WIDTH, padding: 24, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginLeft: -8 },
  date: { fontSize: 13, fontWeight: '500' },
  count: { fontSize: 72, fontWeight: '700', letterSpacing: -2, lineHeight: 76, fontVariant: ['tabular-nums'] },
  countLabel: { fontSize: 20, fontWeight: '600', marginTop: -4 },
  stats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  stat: { flex: 1, gap: 4 },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  statValue: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 12, fontWeight: '500' },
});
