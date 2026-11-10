import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { RunList } from '@/components/run-list';
import { TrackMap } from '@/components/track-map';
import { Button, Label, StatGrid, Title } from '@/components/ui';
import { clock, distance, int, kmh, num, runsWord, span } from '@/lib/format';
import { sessionLines } from '@/lib/lines';
import { getLivePoints, startRecording, stopRecording, useTracker } from '@/lib/tracker';
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
          if (id != null) router.push(`/session/${id}`);
          else Alert.alert('Запись пуста', 'Сигнал GPS не успел появиться, сохранять нечего.');
        },
      },
    ]);
  };

  if (!tracker.recording) {
    return (
      <View style={[styles.idle, { backgroundColor: t.bg, paddingTop: insets.top + space.l }]}>
        <View style={styles.idleHead}>
          <Title>Катание</Title>
        </View>
        <View style={styles.idleCenter}>
          <Logo size={120} color={t.text} />
          <Text style={[styles.hint, { color: t.sub }]}>
            Нажмите «Старт» перед первым подъёмом.{'\n'}Спуски и подъёмники определятся сами.
          </Text>
        </View>
        <Pressable
          onPress={start}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Начать катание"
          style={({ pressed }) => [
            styles.startButton,
            { backgroundColor: t.text },
            (pressed || busy) && { opacity: 0.7, transform: [{ scale: 0.97 }] },
          ]}>
          <Text style={[styles.startText, { color: t.inverse }]}>Старт</Text>
        </Pressable>
      </View>
    );
  }

  const { analysis, last } = tracker;
  const { totals } = analysis;
  const runs = analysis.segments.filter((s) => s.kind === 'run').reverse();
  const elapsed = tracker.startedAt ? (now - tracker.startedAt) / 1000 : 0;
  const d = distance(totals.distance);
  const state: LiveState = last ? analysis.state : 'pause';
  const lines = sessionLines(getLivePoints(), analysis.segments, t);

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={[styles.live, { paddingTop: insets.top + space.m }]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.liveHead}>
        <View style={[styles.pill, { borderColor: t.line }]}>
          <View style={[styles.dot, { backgroundColor: state === 'pause' ? t.sub : t.danger }]} />
          <Text style={[styles.pillText, { color: t.text }]}>{last ? STATE_TITLE[state] : 'Ищем GPS…'}</Text>
        </View>
        <Text style={[styles.timer, { color: t.text }]}>{clock(elapsed)}</Text>
      </View>

      <View style={styles.hero}>
        <Text style={[styles.heroValue, { color: t.text }]}>{totals.runs}</Text>
        <Text style={[styles.heroLabel, { color: t.sub }]}>{runsWord(totals.runs)}</Text>
      </View>

      <StatGrid
        items={[
          { label: 'Скорость', value: kmh(last && state !== 'pause' ? last.speed : 0), unit: 'км/ч' },
          { label: 'Макс. скорость', value: kmh(totals.maxSpeed), unit: 'км/ч' },
          { label: 'Дистанция', value: d.value, unit: d.unit },
          { label: 'Перепад', value: int(totals.vertical), unit: 'м' },
          { label: 'Высота', value: last ? int(last.alt) : '—', unit: 'м' },
          { label: 'На подъёмниках', value: span(totals.liftTime) },
        ]}
      />

      <TrackMap lines={lines} live style={styles.map} />

      {runs.length > 0 ? (
        <View style={styles.section}>
          <Label>Спуски</Label>
          <RunList runs={runs} />
        </View>
      ) : null}

      {!tracker.background ? (
        <Text style={[styles.note, { color: t.sub }]}>
          Запись идёт, пока приложение открыто и экран включён. Не сворачивайте Snowwy и не блокируйте телефон.
        </Text>
      ) : null}

      <Button title="Завершить катание" kind="secondary" onPress={stop} disabled={busy} />
      {last ? (
        <Text style={[styles.gps, { color: t.sub }]}>Точность GPS ±{num(last.acc)} м</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  idle: { flex: 1, paddingHorizontal: space.l, paddingBottom: 120, alignItems: 'center' },
  idleHead: { alignSelf: 'stretch' },
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

  live: { paddingHorizontal: space.m, paddingBottom: 120, gap: space.m },
  liveHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 15, fontWeight: '600' },
  timer: { fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  hero: { alignItems: 'center', paddingVertical: space.s },
  heroValue: { fontSize: 112, fontWeight: '700', letterSpacing: -4, lineHeight: 116, fontVariant: ['tabular-nums'] },
  heroLabel: { fontSize: 17, fontWeight: '500', marginTop: -6 },
  map: { height: 240 },
  section: { gap: space.s },
  note: { fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: space.m },
  gps: { fontSize: 12, textAlign: 'center' },
});
