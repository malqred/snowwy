import type { ComponentRef, Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { thin } from '@/lib/analyze';
import { dateLong, int, km, kmh, runsWord, span } from '@/lib/format';
import { project } from '@/lib/lines';
import type { Segment, Totals, TrackPoint } from '@/lib/types';
import { useTheme } from '@/theme';

import { Logo } from './logo';
import { Backdrop } from './ui';

type Props = {
  ref?: Ref<ComponentRef<typeof View>>;
  startedAt: number;
  totals: Totals;
  points: TrackPoint[];
  segments: Segment[];
};

const WIDTH = 320;
const SKETCH = { width: WIDTH - 40, height: 150 };

/** Карточка с итогами дня — её снимок отправляется через «Поделиться». Цвета берутся из выбранной расцветки. */
export function ShareCard({ ref, startedAt, totals, points, segments }: Props) {
  const t = useTheme();
  const runs = segments.filter((s) => s.kind === 'run');
  const paths = project(
    runs.map((s) => thin(points.slice(s.from, s.to + 1), 120)),
    SKETCH.width,
    SKETCH.height
  ).map((line) => line.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '));

  const stats = [
    { label: 'Км', value: km(totals.distance) },
    { label: 'М вниз', value: int(totals.vertical) },
    { label: 'Макс. км/ч', value: kmh(totals.maxSpeed) },
    { label: 'На спусках', value: span(totals.runTime) },
  ];

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <Backdrop />
      <View style={styles.head}>
        <View style={styles.brand}>
          <Logo size={26} color={t.text} />
          <Text style={[styles.brandText, { color: t.text }]}>Snowwy</Text>
        </View>
        <Text style={[styles.date, { color: t.sub }]}>{dateLong(startedAt)}</Text>
      </View>

      <View style={[styles.hero, { backgroundColor: t.accent }]}>
        <Text style={[styles.count, { color: t.inverse }]}>{totals.runs}</Text>
        <Text style={[styles.countLabel, { color: t.inverse }]}>{runsWord(totals.runs)}</Text>
      </View>

      {paths.length > 0 ? (
        <View style={[styles.sketch, { borderColor: t.line }]}>
          <Svg width={SKETCH.width} height={SKETCH.height}>
            {paths.map((d, i) => (
              <Path key={i} d={d} stroke={t.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ))}
          </Svg>
        </View>
      ) : null}

      <View style={[styles.stats, { borderColor: t.line }]}>
        {stats.map((s, i) => (
          <View
            key={s.label}
            style={[styles.stat, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: t.line }]}>
            <Text style={[styles.statValue, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {s.value}
            </Text>
            <Text style={[styles.statLabel, { color: t.sub }]} numberOfLines={1} adjustsFontSizeToFit>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: WIDTH, padding: 20, gap: 12, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  date: { fontSize: 13, fontWeight: '500' },
  hero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  count: { fontSize: 76, fontWeight: '800', letterSpacing: -3.5, lineHeight: 80, fontVariant: ['tabular-nums'] },
  countLabel: { fontSize: 20, fontWeight: '600' },
  sketch: { borderWidth: 1, borderRadius: 18, borderCurve: 'continuous', overflow: 'hidden' },
  stats: { flexDirection: 'row', borderWidth: 1, borderRadius: 18, borderCurve: 'continuous', paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  statValue: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
});
