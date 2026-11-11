import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chart, SECOND_COLOR } from '@/components/chart';
import { TrackMap } from '@/components/track-map';
import { Card, Label, Plain, Screen } from '@/components/ui';
import { thin } from '@/lib/analyze';
import { runProfile } from '@/lib/compare';
import { clock, distance, int, kmh, num, time } from '@/lib/format';
import type { MapLine } from '@/lib/lines';
import type { Segment } from '@/lib/types';
import { useSession, type SessionData } from '@/lib/use-session';
import { space, useTheme } from '@/theme';

export default function CompareScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ id: string; a?: string; b?: string }>();
  const data = useSession(Number(params.id));

  if (data === undefined) {
    return (
      <Plain style={styles.center}>
        <ActivityIndicator color={t.sub} />
      </Plain>
    );
  }
  const runs = data?.analysis.segments.filter((s) => s.kind === 'run') ?? [];
  if (!data || runs.length < 2) {
    return (
      <Plain style={styles.center}>
        <Text style={{ color: t.sub, fontSize: 15 }}>Для сравнения нужно хотя бы два спуска</Text>
      </Plain>
    );
  }
  return <Compare data={data} runs={runs} initialA={Number(params.a)} initialB={Number(params.b)} />;
}

type Row = {
  label: string;
  a: string;
  b: string;
  /** Кто лучше по этому показателю: 1 — первый, 2 — второй, 0 — не сравниваем */
  best: 0 | 1 | 2;
};

/** best: 'high' — больше лучше, 'low' — меньше лучше. */
function row(label: string, a: number, b: number, show: (v: number) => string, best?: 'high' | 'low'): Row {
  let winner: 0 | 1 | 2 = 0;
  if (best && show(a) !== show(b)) winner = (best === 'high' ? a > b : a < b) ? 1 : 2;
  return { label, a: show(a), b: show(b), best: winner };
}

const meters = (v: number) => {
  const d = distance(v);
  return `${d.value} ${d.unit}`;
};

function Compare({
  data,
  runs,
  initialA,
  initialB,
}: {
  data: SessionData;
  runs: Segment[];
  initialA: number;
  initialB: number;
}) {
  const t = useTheme();
  const { points, analysis } = data;
  const has = (n: number) => runs.some((r) => r.n === n);
  const [aN, setA] = useState(has(initialA) ? initialA : runs[0].n);
  const [bN, setB] = useState(has(initialB) && initialB !== aN ? initialB : (runs.find((r) => r.n !== aN) ?? runs[1]).n);

  const a = runs.find((r) => r.n === aN) ?? runs[0];
  const b = runs.find((r) => r.n === bN) ?? runs[1];
  const pa = runProfile(points, analysis, a);
  const pb = runProfile(points, analysis, b);
  const longest = Math.max(pa.length, pb.length, 1);
  const axis: [string, string] = ['старт', meters(longest)];

  const line = (run: Segment, id: string, color: string): MapLine => ({
    id,
    coords: thin(points.slice(run.from, run.to + 1), 250).map((p) => ({ latitude: p.lat, longitude: p.lon })),
    color,
    width: 4,
  });

  const rows: Row[] = [
    row('Время', a.duration, b.duration, clock, 'low'),
    row('Макс. скорость', a.maxSpeed, b.maxSpeed, (v) => `${kmh(v, 1)} км/ч`, 'high'),
    row('Средняя скорость', a.avgSpeed, b.avgSpeed, (v) => `${kmh(v, 1)} км/ч`, 'high'),
    row('Расстояние', a.distance, b.distance, meters),
    row('Перепад', a.vertical, b.vertical, (v) => `${int(v)} м`),
    row('Средний уклон', a.avgSlope, b.avgSlope, (v) => `${num(v)}°`),
    row('Макс. уклон', a.maxSlope, b.maxSlope, (v) => `${num(v)}°`),
    row('Остановки', a.duration - a.movingTime, b.duration - b.movingTime, clock, 'low'),
  ];

  const picker = (title: string, color: string, selected: number, other: number, onPick: (n: number) => void) => (
    <View style={styles.picker}>
      <View style={styles.pickerHead}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <Label>{title}</Label>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {runs.map((r) => {
          const active = r.n === selected;
          const taken = r.n === other;
          return (
            <Pressable
              key={r.n}
              onPress={() => onPick(r.n)}
              disabled={taken}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: taken }}
              accessibilityLabel={`Спуск ${r.n}`}
              style={[
                styles.chip,
                { borderColor: active ? color : t.line, backgroundColor: active ? color : 'transparent' },
                taken && { opacity: 0.3 },
              ]}>
              <Text style={[styles.chipText, { color: active ? t.bg : t.text }]}>{r.n}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <Screen contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title: 'Сравнение' }} />

      {picker(`Первый спуск · ${time(a.startedAt)}`, t.text, aN, bN, setA)}
      {picker(`Второй спуск · ${time(b.startedAt)}`, SECOND_COLOR, bN, aN, setB)}

      <TrackMap lines={[line(a, `a-${a.n}`, t.text), line(b, `b-${b.n}`, SECOND_COLOR)]} style={styles.map} />

      <Card>
        <View style={[styles.row, styles.head]}>
          <Text style={[styles.cellLabel, { color: t.sub }]} />
          <Text style={[styles.cell, styles.headText, { color: t.text }]}>Спуск {a.n}</Text>
          <Text style={[styles.cell, styles.headText, { color: SECOND_COLOR }]}>Спуск {b.n}</Text>
        </View>
        {rows.map((r) => (
          <View key={r.label} style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
            <Text style={[styles.cellLabel, { color: t.sub }]}>{r.label}</Text>
            <Text style={[styles.cell, { color: t.text }, r.best === 1 && styles.best]}>{r.a}</Text>
            <Text style={[styles.cell, { color: t.text }, r.best === 2 && styles.best]}>{r.b}</Text>
          </View>
        ))}
      </Card>

      <Chart
        title="Скорость по пути"
        values={pa.speed}
        second={pb.speed}
        span={pa.length / longest}
        secondSpan={pb.length / longest}
        duration={0}
        axis={axis}
        format={(v) => num(v)}
        unit="км/ч"
        fromZero
      />
      <Chart
        title="Потеря высоты по пути"
        values={pa.drop}
        second={pb.drop}
        span={pa.length / longest}
        secondSpan={pb.length / longest}
        duration={0}
        axis={axis}
        format={(v) => int(v)}
        unit="м"
        fromZero
      />

      <Text style={[styles.note, { color: t.sub }]}>
        Графики построены по расстоянию от старта, а не по времени: так два спуска по одной трассе совпадают участок к
        участку. Жирным выделен лучший результат по времени, скорости и остановкам.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.l },
  content: { paddingHorizontal: space.m, paddingTop: space.s, paddingBottom: space.xl, gap: space.m },
  picker: { gap: space.s },
  pickerHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  chips: { gap: 8, paddingRight: space.m },
  chip: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  map: { height: 280 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.m, paddingVertical: 12, gap: 8 },
  head: { paddingVertical: 10 },
  headText: { fontWeight: '700' },
  cellLabel: { flex: 1.2, fontSize: 14 },
  cell: { flex: 1, fontSize: 15, textAlign: 'right', fontVariant: ['tabular-nums'] },
  best: { fontWeight: '700' },
  note: { fontSize: 13, lineHeight: 18 },
});
