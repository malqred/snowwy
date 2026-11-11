import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { DayBreakdown } from '@/components/day-breakdown';
import { CloudSnow, Download, Route, Scale, Share, Trash, TrendingDown } from '@/components/icons';
import { RunList } from '@/components/run-list';
import { ShareCard } from '@/components/share-card';
import { TrackMap } from '@/components/track-map';
import { Button, Card, ICON_STROKE, Label, Plain, Screen, StatStrip, StatTile, useOnAccent } from '@/components/ui';
import { thin } from '@/lib/analyze';
import { dayParts } from '@/lib/compare';
import { deleteSession, listSessions } from '@/lib/db';
import { date, distance, int, kmh, num, runsWord, span, time } from '@/lib/format';
import { writeGpx } from '@/lib/gpx';
import { sessionLines } from '@/lib/lines';
import { findRecords, runBadges } from '@/lib/records';
import { useSession } from '@/lib/use-session';
import { degrees, weatherTitle } from '@/lib/weather';
import { space, useTheme } from '@/theme';

export default function SessionScreen() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; share?: string }>();
  const id = Number(params.id);
  const data = useSession(id);
  const card = useRef<ComponentRef<typeof View>>(null);
  const onAccent = useOnAccent();
  const [sharing, setSharing] = useState(params.share === '1');
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
      <Plain style={styles.center}>
        <ActivityIndicator color={t.sub} />
      </Plain>
    );
  }
  if (data === null) {
    return (
      <Plain style={styles.center}>
        <Text style={{ color: t.sub, fontSize: 15 }}>Запись не найдена</Text>
      </Plain>
    );
  }

  const { session, points, analysis } = data;
  const { totals, segments } = analysis;
  const runs = segments.filter((s) => s.kind === 'run');
  const d = distance(totals.distance);
  const endedAt = session.endedAt ?? session.startedAt;
  const total = (endedAt - session.startedAt) / 1000;
  const { weather } = session;
  const weatherNotes = weather
    ? [
        `ощущается ${degrees(weather.feels)}`,
        `ветер ${num(weather.wind)} м/с${weather.gusts >= weather.wind + 3 ? `, порывы до ${num(weather.gusts)}` : ''}`,
        weather.snowfall > 0 ? `свежий снег ${num(weather.snowfall, 1)} см/ч` : '',
        weather.snowDepth != null && weather.snowDepth > 0 ? `снега ${num(weather.snowDepth * 100)} см` : '',
      ].filter(Boolean)
    : [];

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
    <Screen contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title: date(session.startedAt) }} />

      <View style={styles.bento}>
        <Card accent style={styles.big}>
          <Label color={onAccent}>
            {time(session.startedAt)}–{time(endedAt)}
          </Label>
          <View>
            <Text style={[styles.bigValue, { color: onAccent }]} numberOfLines={1} adjustsFontSizeToFit>
              {totals.runs}
            </Text>
            <Text style={[styles.bigLabel, { color: onAccent }]}>
              {runsWord(totals.runs)} · {span(total)}
            </Text>
          </View>
        </Card>
        <View style={styles.side}>
          <StatTile fill item={{ icon: Route, label: 'Дистанция', value: d.value, unit: d.unit }} />
          <StatTile fill item={{ icon: TrendingDown, label: 'Перепад', value: int(totals.vertical), unit: 'м' }} />
        </View>
      </View>

      {held.length > 0 ? (
        <Card style={styles.recordTile}>
          <Text style={[styles.record, { color: t.text }]}>Личный рекорд: {held.join(', ')}</Text>
        </Card>
      ) : null}

      {weather ? (
        <Card style={styles.weather}>
          <CloudSnow size={22} color={t.sub} strokeWidth={ICON_STROKE} />
          <View style={styles.weatherBody}>
            <Text style={[styles.weatherMain, { color: t.text }]}>
              {degrees(weather.temp)} · {weatherTitle(weather.code)}
            </Text>
            <Text style={[styles.weatherSub, { color: t.sub }]}>{weatherNotes.join(' · ')}</Text>
          </View>
        </Card>
      ) : null}

      <TrackMap
        lines={
          segments.length > 0
            ? sessionLines(points, segments, t)
            : [
                {
                  id: 'all',
                  coords: thin(points, 400).map((p) => ({ latitude: p.lat, longitude: p.lon })),
                  color: t.sub,
                  width: 3,
                },
              ]
        }
        style={styles.map}
      />

      <StatStrip
        items={[
          { label: 'Макс.', value: kmh(totals.maxSpeed, 1), unit: 'км/ч' },
          { label: 'Средняя', value: kmh(totals.avgSpeed, 1), unit: 'км/ч' },
          { label: 'Верх', value: int(totals.maxAlt), unit: 'м' },
          { label: 'Низ', value: int(totals.minAlt), unit: 'м' },
        ]}
      />

      {segments.length > 0 ? (
        <View style={styles.section}>
          <Label>На что ушёл день</Label>
          <DayBreakdown parts={dayParts(segments, session.startedAt, endedAt)} />
        </View>
      ) : null}

      {runs.length > 0 ? (
        <View style={styles.section}>
          <Label>Спуски</Label>
          <RunList runs={runs} badges={runBadges(runs)} pistes={session.pistes} onPress={(run) => router.push(`/session/${id}/run/${run.n}`)} />
          {runs.length > 1 ? (
            <Button
              title="Сравнить спуски"
              kind="secondary"
              icon={Scale}
              onPress={() => router.push(`/session/${id}/compare`)}
            />
          ) : null}
        </View>
      ) : (
        <Text style={[styles.note, { color: t.sub }]}>
          В этой записи спусков не нашлось. Спуском считается участок вниз с перепадом от 25 метров.
        </Text>
      )}

      <View style={styles.actions}>
        <Button title="Поделиться итогами" icon={Share} onPress={() => setSharing(true)} />
        <Button title="Экспорт в GPX" kind="secondary" icon={Download} onPress={exportGpx} />
        <Button title="Удалить запись" kind="danger" icon={Trash} onPress={remove} />
      </View>

      <Modal visible={sharing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSharing(false)}>
        <View style={[styles.sheet, { backgroundColor: t.card }]}>
          <View style={[styles.cardFrame, { borderColor: t.line }]}>
            <ShareCard ref={card} startedAt={session.startedAt} totals={totals} points={points} segments={segments} />
          </View>
          <View style={styles.sheetActions}>
            <Button title="Поделиться" icon={Share} onPress={shareImage} />
            <Button title="Закрыть" kind="secondary" onPress={() => setSharing(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.m, paddingTop: space.s, paddingBottom: space.xl, gap: 10 },
  bento: { flexDirection: 'row', gap: 10 },
  big: { flex: 1, padding: space.m, justifyContent: 'space-between', minHeight: 196 },
  side: { flex: 1, gap: 10 },
  bigValue: { fontSize: 104, fontWeight: '800', letterSpacing: -5, lineHeight: 104, fontVariant: ['tabular-nums'] },
  bigLabel: { fontSize: 15, fontWeight: '600' },
  recordTile: { paddingHorizontal: space.m, paddingVertical: 12 },
  record: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  map: { height: 300 },
  weather: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.m },
  weatherBody: { flex: 1, gap: 2 },
  weatherMain: { fontSize: 17, fontWeight: '600' },
  weatherSub: { fontSize: 13, lineHeight: 18 },
  section: { gap: space.s, marginTop: 6 },
  note: { fontSize: 15, lineHeight: 21 },
  actions: { gap: space.s, marginTop: space.s },
  sheet: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.l, gap: space.l },
  cardFrame: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 4, overflow: 'hidden' },
  sheetActions: { alignSelf: 'stretch', gap: space.s },
});
