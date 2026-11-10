import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { RunList } from '@/components/run-list';
import { ShareCard } from '@/components/share-card';
import { TrackMap } from '@/components/track-map';
import { Button, Label, StatGrid } from '@/components/ui';
import { deleteSession, listSessions } from '@/lib/db';
import { date, distance, int, kmh, runsWord, span, time } from '@/lib/format';
import { writeGpx } from '@/lib/gpx';
import { sessionLines } from '@/lib/lines';
import { findRecords, runBadges } from '@/lib/records';
import { useSession } from '@/lib/use-session';
import { space, useTheme } from '@/theme';

export default function SessionScreen() {
  const t = useTheme();
  const router = useRouter();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const data = useSession(id);
  const card = useRef<ComponentRef<typeof View>>(null);
  const [sharing, setSharing] = useState(false);
  const [held, setHeld] = useState<string[]>([]);

  // Какие личные рекорды поставлены в этот день (если есть с чем сравнивать)
  useEffect(() => {
    let active = true;
    listSessions()
      .then((list) => {
        if (!active || list.length < 2) return;
        setHeld(
          findRecords(list)
            .filter((r) => r.sessionId === id)
            .map((r) => r.label.toLowerCase())
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);

  if (data === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.sub} />
      </View>
    );
  }
  if (data === null) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={{ color: t.sub, fontSize: 15 }}>Запись не найдена</Text>
      </View>
    );
  }

  const { session, points, analysis } = data;
  const { totals, segments } = analysis;
  const runs = segments.filter((s) => s.kind === 'run');
  const d = distance(totals.distance);
  const total = ((session.endedAt ?? session.startedAt) - session.startedAt) / 1000;

  const shareImage = async () => {
    try {
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
    } catch {
      Alert.alert('Не получилось', 'Не удалось подготовить картинку. Попробуйте ещё раз.');
    }
  };

  const exportGpx = async () => {
    try {
      const uri = await writeGpx(points, segments, session.startedAt);
      await Sharing.shareAsync(uri, { mimeType: 'application/gpx+xml', UTI: 'com.topografix.gpx' });
    } catch {
      Alert.alert('Не получилось', 'Не удалось сохранить файл GPX. Попробуйте ещё раз.');
    }
  };

  const remove = () => {
    Alert.alert('Удалить запись?', 'День катания и все его спуски будут удалены. Вернуть их нельзя.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deleteSession(id);
          router.back();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ title: date(session.startedAt) }} />

      <View style={styles.hero}>
        <Text style={[styles.heroValue, { color: t.text }]}>
          {totals.runs} <Text style={[styles.heroLabel, { color: t.sub }]}>{runsWord(totals.runs)}</Text>
        </Text>
        <Text style={[styles.heroSub, { color: t.sub }]}>
          {time(session.startedAt)}–{time(session.endedAt ?? session.startedAt)} · {span(total)}
        </Text>
        {held.length > 0 ? (
          <Text style={[styles.record, { color: t.text }]}>Личный рекорд: {held.join(', ')}</Text>
        ) : null}
      </View>

      <TrackMap lines={sessionLines(points, segments, t)} style={styles.map} />

      <StatGrid
        items={[
          { label: 'Дистанция', value: d.value, unit: d.unit },
          { label: 'Перепад', value: int(totals.vertical), unit: 'м' },
          { label: 'Макс. скорость', value: kmh(totals.maxSpeed, 1), unit: 'км/ч' },
          { label: 'Ср. скорость', value: kmh(totals.avgSpeed, 1), unit: 'км/ч' },
          { label: 'На спусках', value: span(totals.runTime) },
          { label: 'На подъёмниках', value: span(totals.liftTime) },
          { label: 'Верхняя точка', value: int(totals.maxAlt), unit: 'м' },
          { label: 'Нижняя точка', value: int(totals.minAlt), unit: 'м' },
        ]}
      />

      {runs.length > 0 ? (
        <View style={styles.section}>
          <Label>Спуски</Label>
          <RunList runs={runs} badges={runBadges(runs)} onPress={(run) => router.push(`/session/${id}/run/${run.n}`)} />
        </View>
      ) : (
        <Text style={[styles.note, { color: t.sub }]}>
          В этой записи спусков не нашлось: перепад высот оказался слишком мал.
        </Text>
      )}

      <View style={styles.actions}>
        <Button title="Поделиться итогами" onPress={() => setSharing(true)} />
        <Button title="Экспорт в GPX" kind="secondary" onPress={exportGpx} />
        <Button title="Удалить запись" kind="danger" onPress={remove} />
      </View>

      <Modal visible={sharing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSharing(false)}>
        <View style={[styles.sheet, { backgroundColor: t.card }]}>
          <View style={[styles.cardFrame, { borderColor: t.line }]}>
            <ShareCard ref={card} startedAt={session.startedAt} totals={totals} points={points} segments={segments} />
          </View>
          <View style={styles.sheetActions}>
            <Button title="Поделиться" onPress={shareImage} />
            <Button title="Закрыть" kind="secondary" onPress={() => setSharing(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.m, paddingTop: space.s, paddingBottom: space.xl, gap: space.m },
  hero: { gap: 2 },
  heroValue: { fontSize: 56, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  heroLabel: { fontSize: 20, fontWeight: '500', letterSpacing: 0 },
  heroSub: { fontSize: 15, fontVariant: ['tabular-nums'] },
  record: { fontSize: 15, fontWeight: '600', lineHeight: 21, marginTop: 6 },
  map: { height: 300 },
  section: { gap: space.s },
  note: { fontSize: 15, lineHeight: 21 },
  actions: { gap: space.s, marginTop: space.s },
  sheet: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.l, gap: space.l },
  cardFrame: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 4, overflow: 'hidden' },
  sheetActions: { alignSelf: 'stretch', gap: space.s },
});
