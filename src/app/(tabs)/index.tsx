import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CableCar, Flag, Gauge, Mountain, Pause, Play, Route, TrendingDown, Zap } from '@/components/icons';
import { Logo } from '@/components/logo';
import { RunList } from '@/components/run-list';
import { TrackMap } from '@/components/track-map';
import { Button, Card, Chevron, Label, Plain, Screen, StatGrid, StatTile, Surface, Title, useOnAccent } from '@/components/ui';
import { clock, dateParts, daysWord, distance, int, km, kmh, num, runsWord, seasonTitle, span } from '@/lib/format';
import { useStartInfo } from '@/lib/use-start-info';
import { degrees, weatherTitle } from '@/lib/weather';
import { sessionLines } from '@/lib/lines';
import {
  elapsedSeconds,
  getLivePoints,
  pauseRecording,
  resumeRecording,
  startRecording,
  stopRecording,
  useTracker,
} from '@/lib/tracker';
import type { LiveState } from '@/lib/types';
import { space, useTheme } from '@/theme';

const STATE_TITLE: Record<LiveState, string> = {
  run: 'Спуск',
  lift: 'Подъём',
  pause: 'Пауза',
  move: 'В движении',
};

export default function RideScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tracker = useTracker();
  const onAccent = useOnAccent();
  const info = useStartInfo();
  const prev = info.last;
  const prevDate = prev ? dateParts(prev.startedAt) : null;
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!tracker.recording) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [tracker.recording]);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const error = await startRecording();
    setBusy(false);
    if (error) Alert.alert('Не удалось начать', error);
  };

  const togglePause = async () => {
    if (busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (tracker.paused) {
      const error = await resumeRecording();
      if (error) Alert.alert('Не удалось продолжить', error);
    } else {
      await pauseRecording();
    }
    setBusy(false);
  };

  const stop = () => {
    Alert.alert('Завершить катание?', 'Запись остановится и сохранится в истории.', [
      { text: 'Продолжить', style: 'cancel' },
      {
        text: 'Завершить',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const id = await stopRecording();
          setBusy(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          if (id != null) router.push(`/session/${id}/done`);
          else Alert.alert('Запись пуста', 'GPS не успел определить место, сохранять нечего.');
        },
      },
    ]);
  };

  if (!tracker.recording) {
    return (
      <Plain style={[styles.idle, { paddingTop: insets.top + space.l }]}>
        <View style={styles.idleHead}>
          <Title>Катание</Title>
          {info.weather ? (
            <Text style={[styles.weather, { color: t.sub }]}>
              {degrees(info.weather.temp)} · {weatherTitle(info.weather.code).toLowerCase()} · ветер{' '}
              {num(info.weather.wind)} м/с
            </Text>
          ) : null}
        </View>
        <View style={styles.idleCenter}>
          <Logo size={96} color={t.text} />
          <Text style={[styles.hint, { color: t.sub }]}>
            {info.last
              ? 'Спуски и подъёмники определятся сами.'
              : 'Нажмите «Старт» перед первым подъёмом.\nСпуски и подъёмники определятся сами.'}
          </Text>
        </View>
        <Pressable
          onPress={start}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Начать катание"
          style={({ pressed }) => [
            styles.startButton,
            { backgroundColor: t.accent },
            (pressed || busy) && { opacity: 0.7, transform: [{ scale: 0.97 }] },
          ]}>
          <Text style={[styles.startText, { color: t.inverse }]}>Старт</Text>
        </Pressable>
        {prev ? (
          <Pressable
            onPress={() => router.push(`/session/${prev.id}`)}
            accessibilityRole="button"
            accessibilityLabel="Открыть прошлое катание"
            style={({ pressed }) => [styles.lastWrap, pressed && { opacity: 0.6 }]}>
            <Card style={styles.last}>
              <View style={[styles.lastDate, { backgroundColor: t.accent }]}>
                <Text style={[styles.lastDay, { color: t.inverse }]}>{prevDate?.day}</Text>
                <Text style={[styles.lastMonth, { color: t.inverse }]}>{prevDate?.month}</Text>
              </View>
              <View style={styles.lastBody}>
                <Text style={[styles.lastTitle, { color: t.text }]}>Прошлое катание</Text>
                <Text style={[styles.lastSub, { color: t.sub }]} numberOfLines={1}>
                  {prev.totals
                    ? `${prev.totals.runs} ${runsWord(prev.totals.runs)} · ${km(prev.totals.distance)} км · ${int(prev.totals.vertical)} м`
                    : 'Нет данных'}
                </Text>
              </View>
              <Chevron />
            </Card>
            {info.season ? (
              <Text style={[styles.season, { color: t.sub }]}>
                {seasonTitle(info.season.year)}: {info.season.days} {daysWord(info.season.days)} ·{' '}
                {info.season.runs} {runsWord(info.season.runs)}
              </Text>
            ) : null}
          </Pressable>
        ) : null}
      </Plain>
    );
  }

  const { analysis, last } = tracker;
  const { totals } = analysis;
  const runs = analysis.segments.filter((s) => s.kind === 'run').reverse();
  const { paused } = tracker;
  const elapsed = elapsedSeconds(tracker, now);
  const d = distance(totals.distance);
  const state: LiveState = last && !paused ? analysis.state : 'pause';
  const lines = sessionLines(getLivePoints(), analysis.segments, t);

  return (
    <Screen contentContainerStyle={[styles.live, { paddingTop: insets.top + space.m }]}>
      <View style={styles.liveHead}>
        <Surface style={styles.pill}>
          <View style={[styles.dot, { backgroundColor: state === 'pause' ? t.sub : t.danger }]} />
          <Text style={[styles.pillText, { color: t.text }]}>
            {paused ? 'На паузе' : last ? STATE_TITLE[state] : 'Ищем GPS…'}
          </Text>
        </Surface>
        <Text style={[styles.timer, { color: t.text }]}>{clock(elapsed)}</Text>
      </View>

      <View style={styles.bento}>
        <Card accent style={styles.big}>
          <Label color={onAccent}>Сегодня</Label>
          <View>
            <Text style={[styles.bigValue, { color: onAccent }]} numberOfLines={1} adjustsFontSizeToFit>
              {totals.runs}
            </Text>
            <Text style={[styles.bigLabel, { color: onAccent }]}>{runsWord(totals.runs)}</Text>
          </View>
        </Card>
        <View style={styles.side}>
          <StatTile
            fill
            item={{ icon: Gauge, label: 'Скорость', value: kmh(last && state !== 'pause' ? tracker.speed : 0), unit: 'км/ч' }}
          />
          <StatTile fill item={{ icon: Zap, label: 'Макс.', value: kmh(totals.maxSpeed), unit: 'км/ч' }} />
        </View>
      </View>

      <StatGrid
        items={[
          { icon: Route, label: 'Дистанция', value: d.value, unit: d.unit },
          { icon: TrendingDown, label: 'Перепад', value: int(totals.vertical), unit: 'м' },
          { icon: Mountain, label: 'Высота', value: last ? int(last.alt) : '—', unit: 'м' },
          { icon: CableCar, label: 'На подъёмниках', value: span(totals.liftTime) },
        ]}
      />

      <View style={styles.actions}>
        <Button
          title={paused ? 'Продолжить' : 'Пауза'}
          kind={paused ? 'primary' : 'secondary'}
          icon={paused ? Play : Pause}
          onPress={togglePause}
          disabled={busy}
          style={styles.action}
        />
        <Button title="Завершить" kind="secondary" icon={Flag} onPress={stop} disabled={busy} style={styles.action} />
      </View>

      {paused ? (
        <Text style={[styles.note, { color: t.sub }]}>
          Запись на паузе: время, расстояние и спуски не считаются, GPS почти не тратит заряд.
        </Text>
      ) : null}

      <TrackMap lines={lines} live={!paused} style={styles.map} />

      {runs.length > 0 ? (
        <View style={styles.section}>
          <Label>Спуски</Label>
          <RunList runs={runs} />
        </View>
      ) : null}

      {!tracker.background && !paused ? (
        <Text style={[styles.note, { color: t.sub }]}>
          Запись идёт, пока приложение открыто и экран включён. Не сворачивайте Snowwy и не блокируйте телефон.
        </Text>
      ) : null}

      {last && !paused ? (
        <Text style={[styles.gps, { color: t.sub }]}>
          Точность GPS ±{num(last.acc)} м{tracker.barometer ? ' · высота по барометру' : ''}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  idle: { flex: 1, paddingHorizontal: space.m, paddingBottom: 110, alignItems: 'center' },
  idleHead: { alignSelf: 'stretch', gap: 4 },
  weather: { fontSize: 15, fontVariant: ['tabular-nums'] },
  lastWrap: { alignSelf: 'stretch', marginTop: space.l, gap: 10 },
  last: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  lastDate: { width: 48, height: 48, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  lastDay: { fontSize: 19, fontWeight: '800', lineHeight: 20, fontVariant: ['tabular-nums'] },
  lastMonth: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  lastBody: { flex: 1, gap: 2 },
  lastTitle: { fontSize: 17, fontWeight: '600' },
  lastSub: { fontSize: 13, fontVariant: ['tabular-nums'] },
  season: { fontSize: 13, textAlign: 'center', fontVariant: ['tabular-nums'] },
  idleCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.m },
  hint: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  startButton: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startText: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },

  live: { paddingHorizontal: space.m, paddingBottom: 120, gap: 10 },
  bento: { flexDirection: 'row', gap: 10 },
  big: { flex: 1, padding: space.m, justifyContent: 'space-between', minHeight: 196 },
  side: { flex: 1, gap: 10 },
  bigValue: { fontSize: 104, fontWeight: '800', letterSpacing: -5, lineHeight: 104, fontVariant: ['tabular-nums'] },
  bigLabel: { fontSize: 16, fontWeight: '600' },
  liveHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    overflow: 'hidden',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 15, fontWeight: '600' },
  timer: { fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  map: { height: 240 },
  actions: { flexDirection: 'row', gap: space.s },
  action: { flex: 1 },
  section: { gap: space.s, marginTop: 6 },
  note: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: space.m },
  gps: { fontSize: 12, textAlign: 'center' },
});
