import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Route, Share, TrendingDown, Trophy } from '@/components/icons';
import { Button, Card, ICON_STROKE, Label, Plain, Screen, StatStrip, StatTile, Title, useOnAccent } from '@/components/ui';
import { listSessions } from '@/lib/db';
import { clock, dateLong, distance, int, kmh, runsWord, span } from '@/lib/format';
import { difficultyInfo } from '@/lib/pistes';
import { findRecords } from '@/lib/records';
import { useSession } from '@/lib/use-session';
import { space, useTheme } from '@/theme';

/** Итоги сразу после завершения катания. */
export default function DoneScreen() {
  const t = useTheme();
  const onAccent = useOnAccent();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const data = useSession(id);
  const [records, setRecords] = useState<{ label: string; text: string }[]>([]);

  // Рекорды, побитые сегодня (если есть с чем сравнивать)
  useEffect(() => {
    let active = true;
    listSessions()
      .then((list) => {
        if (!active || list.length < 2) return;
        setRecords(
          findRecords(list)
            .filter((r) => r.sessionId === id)
            .map((r) => ({ label: r.label, text: `${r.value}${r.unit ? ` ${r.unit}` : ''}` }))
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);

  if (!data) {
    return (
      <Plain style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        {data === undefined ? (
          <ActivityIndicator color={t.sub} />
        ) : (
          <Text style={{ color: t.sub, fontSize: 15 }}>Запись не найдена</Text>
        )}
      </Plain>
    );
  }

  const { session, analysis } = data;
  const { totals } = analysis;
  const runs = analysis.segments.filter((s) => s.kind === 'run');
  const best = runs.length > 0 ? runs.reduce((a, b) => (b.maxSpeed > a.maxSpeed ? b : a)) : null;
  const bestPiste = best ? session.pistes?.find((p) => p.t === best.startedAt) : undefined;
  const d = distance(totals.distance);
  const total = ((session.endedAt ?? session.startedAt) - session.startedAt) / 1000;

  return (
    <Screen contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={styles.head}>
        <Title>Катание завершено</Title>
        <Text style={[styles.date, { color: t.sub }]}>
          {dateLong(session.startedAt)} · {span(total)}
        </Text>
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
          <StatTile fill item={{ icon: Route, label: 'Дистанция', value: d.value, unit: d.unit }} />
          <StatTile fill item={{ icon: TrendingDown, label: 'Перепад', value: int(totals.vertical), unit: 'м' }} />
        </View>
      </View>

      {totals.runs > 0 ? (
        <StatStrip
          items={[
            { label: 'Макс.', value: kmh(totals.maxSpeed, 1), unit: 'км/ч' },
            { label: 'Средняя', value: kmh(totals.avgSpeed, 1), unit: 'км/ч' },
            { label: 'На спусках', value: span(totals.runTime) },
          ]}
        />
      ) : (
        <Text style={[styles.note, { color: t.sub }]}>
          Спусков в этой записи не нашлось. Спуском считается участок вниз длиной от 15 метров с перепадом от 5 метров, а пологий — с перепадом от метра, если ехать быстрее 15 км/ч.
        </Text>
      )}

      {best ? (
        <Card style={styles.row}>
          <View style={[styles.number, { backgroundColor: t.accent }]}>
            <Text style={[styles.numberText, { color: t.inverse }]}>{best.n}</Text>
          </View>
          <View style={styles.rowBody}>
            <Text style={[styles.rowTitle, { color: t.text }]}>Самый быстрый спуск</Text>
            <Text style={[styles.rowSub, { color: t.sub }]} numberOfLines={1}>
              {bestPiste ? `${bestPiste.name} · ${difficultyInfo(bestPiste.difficulty).title} · ` : ''}
              {clock(best.duration)}
            </Text>
          </View>
          <Text style={[styles.rowValue, { color: t.text }]}>
            {kmh(best.maxSpeed)}
            <Text style={[styles.rowSub, { color: t.sub }]}> км/ч</Text>
          </Text>
        </Card>
      ) : null}

      {records.length > 0 ? (
        <Card style={styles.records}>
          <View style={styles.recordsHead}>
            <Trophy size={18} color={t.text} strokeWidth={ICON_STROKE} />
            <Text style={[styles.rowTitle, { color: t.text }]}>
              {records.length === 1 ? 'Новый личный рекорд' : 'Новые личные рекорды'}
            </Text>
          </View>
          {records.map((r) => (
            <View key={r.label} style={styles.record}>
              <Text style={[styles.rowSub, { color: t.sub }]}>{r.label}</Text>
              <Text style={[styles.recordValue, { color: t.text }]}>{r.text}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button title="Поделиться итогами" icon={Share} onPress={() => router.replace(`/session/${id}?share=1`)} />
        <Button title="Подробнее о дне" kind="secondary" onPress={() => router.replace(`/session/${id}`)} />
        <Button title="Готово" kind="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.m, gap: 10 },
  head: { gap: 4, marginBottom: 6 },
  date: { fontSize: 15, fontVariant: ['tabular-nums'] },
  bento: { flexDirection: 'row', gap: 10 },
  big: { flex: 1, padding: space.m, justifyContent: 'space-between', minHeight: 196 },
  side: { flex: 1, gap: 10 },
  bigValue: { fontSize: 104, fontWeight: '800', letterSpacing: -5, lineHeight: 104, fontVariant: ['tabular-nums'] },
  bigLabel: { fontSize: 16, fontWeight: '600' },
  note: { fontSize: 15, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  number: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 13, fontVariant: ['tabular-nums'] },
  rowValue: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  records: { padding: 14, gap: 10 },
  recordsHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  record: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  recordValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  actions: { gap: space.s, marginTop: space.m },
});
