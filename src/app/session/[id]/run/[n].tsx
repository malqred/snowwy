import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Clock, Gauge, Pause, Play, Scale } from '@/components/icons';
import { Chart } from '@/components/chart';
import { Scrubber } from '@/components/scrubber';
import { TrackMap } from '@/components/track-map';
import { Button, Card, Label, Plain, Screen, StatStrip, StatTile, useOnAccent } from '@/components/ui';
import { clock, distance, int, kmh, num, time } from '@/lib/format';
import { speedLines } from '@/lib/lines';
import { difficultyInfo } from '@/lib/pistes';
import type { Segment } from '@/lib/types';
import { REPLAY_RATES, useReplay } from '@/lib/use-replay';
import { useSession, type SessionData } from '@/lib/use-session';
import { space, SPEED_COLORS, useTheme } from '@/theme';

export default function RunScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ id: string; n: string }>();
  const data = useSession(Number(params.id));
  const n = Number(params.n);

  if (data === undefined) {
    return (
      <Plain style={styles.center}>
        <ActivityIndicator color={t.sub} />
      </Plain>
    );
  }
  const run = data?.analysis.segments.find((s) => s.kind === 'run' && s.n === n);
  if (!data || !run) {
    return (
      <Plain style={styles.center}>
        <Text style={{ color: t.sub, fontSize: 15 }}>Спуск не найден</Text>
      </Plain>
    );
  }
  return <RunDetails data={data} run={run} />;
}

function RunDetails({ data, run }: { data: SessionData; run: Segment }) {
  const t = useTheme();
  const onAccent = useOnAccent();
  const router = useRouter();
  // Повтор шёл в момент, когда взяли ползунок: после отпускания продолжим
  const resume = useRef(false);
  const { points, analysis } = data;
  const replay = useReplay(points, analysis, run);
  const piste = data.session.pistes?.find((p) => p.t === run.startedAt);
  const others = analysis.segments.filter((s) => s.kind === 'run' && s.n !== run.n);
  // По умолчанию сравниваем с предыдущим спуском, у первого — со следующим
  const rival = others.find((s) => s.n === run.n - 1) ?? others[0];
  const d = distance(run.distance);
  const speeds = analysis.speed.slice(run.from, run.to + 1).map((v) => v * 3.6);
  const alts = analysis.alt.slice(run.from, run.to + 1);

  return (
    <Screen contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title: `Спуск ${run.n}` }} />

      <Text style={[styles.sub, { color: t.sub }]}>
        {time(run.startedAt)}–{time(run.endedAt)}
        {piste ? ` · ${piste.name}, ${difficultyInfo(piste.difficulty).title}` : ''}
      </Text>

      <View style={styles.mapBlock}>
        <TrackMap
          lines={speedLines(points, analysis.speed, run)}
          marker={replay.coord}
          style={styles.map}
        />

        <Card style={styles.replay}>
          <Pressable
            onPress={replay.toggle}
            accessibilityRole="button"
            accessibilityLabel={replay.playing ? 'Остановить повтор' : 'Запустить повтор спуска'}
            hitSlop={8}
            style={({ pressed }) => [styles.play, { backgroundColor: t.accent }, pressed && { opacity: 0.7 }]}>
            {replay.playing ? (
              <Pause size={20} color={t.inverse} strokeWidth={2} />
            ) : (
              <Play size={20} color={t.inverse} strokeWidth={2} />
            )}
          </Pressable>
          <View style={styles.replayBody}>
            <View style={styles.replayHead}>
              <Text style={[styles.replayValue, { color: t.text }]}>
                {kmh(replay.speed)} км/ч · {int(replay.alt)} м
              </Text>
              <Text style={[styles.replayTime, { color: t.sub }]}>
                {clock(replay.seconds)} / {clock(run.duration)}
              </Text>
            </View>
            <Scrubber
              progress={replay.progress}
              onSeek={replay.seek}
              onHold={(held) => {
                // Пока ползунок в руке, повтор стоит — иначе он спорит с пальцем
                if (held) {
                  resume.current = replay.playing;
                  if (replay.playing) replay.toggle();
                } else if (resume.current && !replay.playing) {
                  resume.current = false;
                  replay.toggle();
                }
              }}
            />
          </View>
        </Card>

        <View style={styles.rates}>
          <Text style={[styles.legendText, { color: t.sub }]}>Скорость повтора</Text>
          <View style={styles.rateChips}>
            {REPLAY_RATES.map((rate) => {
              const active = replay.rate === rate;
              return (
                <Pressable
                  key={rate}
                  onPress={() => replay.setRate(rate)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Скорость повтора ${rate}`}
                  style={[
                    styles.rate,
                    { borderColor: active ? t.accent : t.line, backgroundColor: active ? t.accent : 'transparent' },
                  ]}>
                  <Text style={[styles.rateText, { color: active ? t.inverse : t.text }]}>×{rate}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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

      <View style={styles.bento}>
        <Card accent style={styles.big}>
          <Label color={onAccent}>Макс. скорость</Label>
          <View>
            <Text style={[styles.bigValue, { color: onAccent }]} numberOfLines={1} adjustsFontSizeToFit>
              {kmh(run.maxSpeed, 1)}
            </Text>
            <Text style={[styles.bigLabel, { color: onAccent }]}>км/ч</Text>
          </View>
        </Card>
        <View style={styles.side}>
          <StatTile fill item={{ icon: Gauge, label: 'Средняя', value: kmh(run.avgSpeed, 1), unit: 'км/ч' }} />
          <StatTile fill item={{ icon: Clock, label: 'Время', value: clock(run.duration) }} />
        </View>
      </View>
      <StatStrip
        items={[
          { label: 'Путь', value: d.value, unit: d.unit },
          { label: 'Перепад', value: int(run.vertical), unit: 'м' },
          { label: 'Мин.', value: kmh(run.minSpeed, 1), unit: 'км/ч' },
        ]}
      />
      <StatStrip
        items={[
          { label: 'Уклон', value: `${num(run.avgSlope)}°` },
          { label: 'Макс. уклон', value: `${num(run.maxSlope)}°` },
          { label: 'Старт', value: int(run.startAlt), unit: 'м' },
          { label: 'Финиш', value: int(run.endAlt), unit: 'м' },
        ]}
      />

      <Chart title="Скорость" values={speeds} duration={run.duration} format={(v) => num(v)} unit="км/ч" fromZero />
      <Chart title="Высота" values={alts} duration={run.duration} format={(v) => int(v)} unit="м" />

      {rival ? (
        <Button
          title="Сравнить с другим спуском"
          kind="secondary"
          icon={Scale}
          onPress={() => router.push(`/session/${data.session.id}/compare?a=${run.n}&b=${rival.n}`)}
        />
      ) : null}

      <Text style={[styles.sub, { color: t.sub }]}>
        {run.duration - run.movingTime >= 10
          ? `В движении ${clock(run.movingTime)}, остановки ${clock(run.duration - run.movingTime)}. Средняя скорость считается без остановок. `
          : ''}
        Максимальная скорость усреднена примерно по трём секундам, чтобы в неё не попадали случайные всплески GPS.
        Максимальный уклон — на самом крутом отрезке длиной от 40 метров.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.m, paddingTop: space.xs, paddingBottom: space.xl, gap: 10 },
  sub: { fontSize: 15, lineHeight: 21, fontVariant: ['tabular-nums'] },
  mapBlock: { gap: space.s },
  bento: { flexDirection: 'row', gap: 10 },
  big: { flex: 1, padding: space.m, justifyContent: 'space-between', minHeight: 170 },
  side: { flex: 1, gap: 10 },
  bigValue: { fontSize: 64, fontWeight: '800', letterSpacing: -3, lineHeight: 66, fontVariant: ['tabular-nums'] },
  bigLabel: { fontSize: 15, fontWeight: '600' },
  map: { height: 300 },
  replay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  replayBody: { flex: 1, gap: 2 },
  replayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  replayValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  replayTime: { fontSize: 13, fontVariant: ['tabular-nums'] },
  rates: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  rateChips: { flexDirection: 'row', gap: 6 },
  rate: { minWidth: 44, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rateText: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  legendText: { fontSize: 12 },
  ramp: { flexDirection: 'row', gap: 2 },
  rampStep: { width: 22, height: 4, borderRadius: 2 },
});
