import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Label, StatGrid, Title } from '@/components/ui';
import { listSessions } from '@/lib/db';
import { findRecords } from '@/lib/records';
import { date, dateIso, int, km, kmh, runsWord, seasonOf, seasonTitle, span } from '@/lib/format';
import type { Session } from '@/lib/types';
import { space, useTheme } from '@/theme';

type Season = { year: number; sessions: Session[] };

function groupBySeason(sessions: Session[]): Season[] {
  const seasons: Season[] = [];
  for (const s of sessions) {
    const year = seasonOf(s.startedAt);
    const last = seasons[seasons.length - 1];
    if (last && last.year === year) last.sessions.push(s);
    else seasons.push({ year, sessions: [s] });
  }
  return seasons;
}

function seasonStats(sessions: Session[]) {
  const days = new Set(sessions.map((s) => dateIso(s.startedAt))).size;
  let runs = 0;
  let dist = 0;
  let vertical = 0;
  let maxSpeed = 0;
  let runTime = 0;
  for (const s of sessions) {
    if (!s.totals) continue;
    runs += s.totals.runs;
    dist += s.totals.distance;
    vertical += s.totals.vertical;
    runTime += s.totals.runTime;
    if (s.totals.maxSpeed > maxSpeed) maxSpeed = s.totals.maxSpeed;
  }
  return [
    { label: 'Дней', value: `${days}` },
    { label: 'Спусков', value: int(runs) },
    { label: 'Дистанция', value: km(dist), unit: 'км' },
    { label: 'Перепад', value: int(vertical), unit: 'м' },
    { label: 'Рекорд', value: kmh(maxSpeed), unit: 'км/ч' },
    { label: 'На спусках', value: span(runTime) },
  ];
}

export default function HistoryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listSessions().then((list) => {
        if (active) setSessions(list);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  const seasons = groupBySeason(sessions ?? []);
  const records = findRecords(sessions ?? []);

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l }]}
      showsVerticalScrollIndicator={false}>
      <Title>История</Title>

      {sessions && sessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: t.text }]}>Пока пусто</Text>
          <Text style={[styles.emptyText, { color: t.sub }]}>
            Здесь появятся ваши дни катания.{'\n'}Чтобы посмотреть, как это выглядит, добавьте демо-катание в настройках.
          </Text>
        </View>
      ) : null}

      {records.length > 0 ? (
        <View style={styles.list}>
          <Label>Личные рекорды</Label>
          <Card>
            {records.map((r, i) => (
              <Pressable
                key={r.key}
                onPress={() => router.push(`/session/${r.sessionId}`)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
                  pressed && { opacity: 0.6 },
                ]}>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: t.text }]}>{r.label}</Text>
                  <Text style={[styles.rowSub, { color: t.sub }]}>{date(r.startedAt)}</Text>
                </View>
                <Text style={[styles.recordValue, { color: t.text }]}>
                  {r.value}
                  {r.unit ? <Text style={[styles.rowSub, { color: t.sub }]}> {r.unit}</Text> : null}
                </Text>
                <Text style={[styles.chevron, { color: t.sub }]}>›</Text>
              </Pressable>
            ))}
          </Card>
        </View>
      ) : null}

      {seasons.map((season) => (
        <View key={season.year} style={styles.season}>
          <Text style={[styles.seasonTitle, { color: t.text }]}>{seasonTitle(season.year)}</Text>
          <StatGrid columns={3} items={seasonStats(season.sessions)} />

          <View style={styles.list}>
            <Label>Дни катания</Label>
            <Card>
              {season.sessions.map((s, i) => (
                <Pressable
                  key={s.id}
                  onPress={() => router.push(`/session/${s.id}`)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
                    pressed && { opacity: 0.6 },
                  ]}>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, { color: t.text }]}>{date(s.startedAt)}</Text>
                    <Text style={[styles.rowSub, { color: t.sub }]}>
                      {s.totals
                        ? `${s.totals.runs} ${runsWord(s.totals.runs)} · ${km(s.totals.distance)} км · ${int(s.totals.vertical)} м`
                        : 'Нет данных'}
                    </Text>
                  </View>
                  <Text style={[styles.rowSub, { color: t.sub }]}>
                    {span(((s.endedAt ?? s.startedAt) - s.startedAt) / 1000)}
                  </Text>
                  <Text style={[styles.chevron, { color: t.sub }]}>›</Text>
                </Pressable>
              ))}
            </Card>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.m, paddingBottom: 120, gap: space.l },
  empty: { paddingTop: 96, alignItems: 'center', gap: space.s },
  emptyTitle: { fontSize: 20, fontWeight: '600' },
  emptyText: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  season: { gap: space.m },
  seasonTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  list: { gap: space.s },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.m,
    paddingVertical: 14,
    gap: 10,
    minHeight: 64,
  },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 17, fontWeight: '600' },
  rowSub: { fontSize: 13, fontVariant: ['tabular-nums'] },
  chevron: { fontSize: 22 },
  recordValue: { fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
