import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chart } from '@/components/chart';
import { TrackMap } from '@/components/track-map';
import { StatGrid } from '@/components/ui';
import { clock, distance, int, kmh, num, time } from '@/lib/format';
import { speedLines } from '@/lib/lines';
import { useSession } from '@/lib/use-session';
import { space, SPEED_COLORS, useTheme } from '@/theme';

export default function RunScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ id: string; n: string }>();
  const data = useSession(Number(params.id));
  const n = Number(params.n);

  if (data === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.sub} />
      </View>
    );
  }
  const run = data?.analysis.segments.find((s) => s.kind === 'run' && s.n === n);
  if (!data || !run) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={{ color: t.sub, fontSize: 15 }}>Спуск не найден</Text>
      </View>
    );
  }

  const { points, analysis } = data;
  const d = distance(run.distance);
  const speeds = analysis.speed.slice(run.from, run.to + 1).map((v) => v * 3.6);
  const alts = analysis.alt.slice(run.from, run.to + 1);

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ title: `Спуск ${run.n}` }} />

      <Text style={[styles.sub, { color: t.sub }]}>
        {time(run.startedAt)}–{time(run.endedAt)}
      </Text>

      <View style={styles.mapBlock}>
        <TrackMap lines={speedLines(points, analysis.speed, run)} style={styles.map} />
        <View style={styles.legend}>
          <Text style={[styles.legendText, { color: t.sub }]}>медленно</Text>
          <View style={styles.ramp}>
            {SPEED_COLORS.map((c) => (
              <View key={c} style={[styles.rampStep, { backgroundColor: c }]} />
            ))}
          </View>
          <Text style={[styles.legendText, { color: t.sub }]}>быстро</Text>
        </View>
      </View>

      <StatGrid
        items={[
          { label: 'Средняя скорость', value: kmh(run.avgSpeed, 1), unit: 'км/ч' },
          { label: 'Макс. скорость', value: kmh(run.maxSpeed, 1), unit: 'км/ч' },
          { label: 'Мин. скорость', value: kmh(run.minSpeed, 1), unit: 'км/ч' },
          { label: 'Расстояние', value: d.value, unit: d.unit },
          { label: 'Перепад', value: int(run.vertical), unit: 'м' },
          { label: 'Время', value: clock(run.duration) },
          { label: 'Старт', value: int(run.startAlt), unit: 'м' },
          { label: 'Финиш', value: int(run.endAlt), unit: 'м' },
        ]}
      />

      <Chart title="Скорость" values={speeds} duration={run.duration} format={(v) => num(v)} unit="км/ч" fromZero />
      <Chart title="Высота" values={alts} duration={run.duration} format={(v) => int(v)} unit="м" />

      {run.duration - run.movingTime >= 10 ? (
        <Text style={[styles.sub, { color: t.sub }]}>
          В движении {clock(run.movingTime)}, остановки {clock(run.duration - run.movingTime)}. Средняя скорость считается
          без остановок.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.m, paddingTop: space.xs, paddingBottom: space.xl, gap: space.m },
  sub: { fontSize: 15, lineHeight: 21, fontVariant: ['tabular-nums'] },
  mapBlock: { gap: space.s },
  map: { height: 300 },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  legendText: { fontSize: 12 },
  ramp: { flexDirection: 'row', gap: 2 },
  rampStep: { width: 22, height: 4, borderRadius: 2 },
});
