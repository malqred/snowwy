import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecordsBlock } from '@/components/records-block';
import { Card, Chevron, Screen, StatStrip, Title } from '@/components/ui';
import { listSessions } from '@/lib/db';
import { difficultyInfo, favoritePistes } from '@/lib/pistes';
import { clock, dateIso, dateParts, daysWord, int, km, kmh, plural, runsWord, seasonOf, seasonTitle, span } from '@/lib/format';
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
  let runTime = 0;
  for (const s of sessions) {
    if (!s.totals) continue;
    runs += s.totals.runs;
    dist += s.totals.distance;
    vertical += s.totals.vertical;
    runTime += s.totals.runTime;
  }
  return {
    days,
    items: [
      { label: 'Спусков', value: int(runs) },
      { label: 'Км', value: km(dist) },
      { label: 'М вниз', value: int(vertical) },
      { label: 'На спусках', value: span(runTime) },
    ],
  };
}


export default function HistoryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listSessions()
        .then((list) => {
          if (active) setSessions(list);
        })
        .catch(() => {
          if (active) setSessions([]);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  const seasons = groupBySeason(sessions ?? []);
  const open = (id: number) => router.push(`/session/${id}`);
  const favorites = favoritePistes((sessions ?? []).map((s) => s.pistes ?? []));

  return (
    <Screen contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l }]}>
      <Title>История</Title>

      {sessions && sessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: t.text }]}>Пока пусто</Text>
          <Text style={[styles.emptyText, { color: t.sub }]}>
            Здесь появятся ваши дни катания.{'\n'}Чтобы посмотреть, как это выглядит, добавьте демо-катание в настройках.
          </Text>
        </View>
      ) : null}

      <RecordsBlock sessions={sessions ?? []} />

      {favorites.length > 0 ? (
        <View style={styles.block}>
          <Text style={[styles.sectionTitle, styles.recordsTitle, { color: t.text }]}>Любимые трассы</Text>
          {favorites.map((f) => (
            <Card key={f.name} style={styles.day}>
              <View style={[styles.pisteDot, { backgroundColor: difficultyInfo(f.difficulty).color }]} />
              <View style={styles.dayBody}>
                <Text style={[styles.dayTitle, { color: t.text }]} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={[styles.daySub, { color: t.sub }]} numberOfLines={1}>
                  лучшее время {clock(f.best)} · средняя {kmh(f.avgSpeed)} км/ч
                </Text>
              </View>
              <Text style={[styles.favCount, { color: t.text }]}>
                {f.count}
                <Text style={[styles.daySub, { color: t.sub }]}> {plural(f.count, 'раз', 'раза', 'раз')}</Text>
              </Text>
            </Card>
          ))}
        </View>
      ) : null}

      {seasons.map((season) => {
        const stats = seasonStats(season.sessions);
        return (
          <View key={season.year} style={styles.season}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: t.text }]}>{seasonTitle(season.year)}</Text>
              <Text style={[styles.sectionNote, { color: t.sub }]}>
                {stats.days} {daysWord(stats.days)}
              </Text>
            </View>
            <StatStrip items={stats.items} />

            <Text style={[styles.sectionTitle, styles.daysTitle, { color: t.text }]}>Дни катания</Text>
            <View style={styles.block}>
              {season.sessions.map((s) => {
                const d = dateParts(s.startedAt);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => open(s.id)}
                    accessibilityRole="button"
                    style={({ pressed }) => pressed && { opacity: 0.6 }}>
                    <Card style={styles.day}>
                      <View style={[styles.date, { backgroundColor: t.accent }]}>
                        <Text style={[styles.dateDay, { color: t.inverse }]}>{d.day}</Text>
                        <Text style={[styles.dateMonth, { color: t.inverse }]}>{d.month}</Text>
                      </View>
                      <View style={styles.dayBody}>
                        <Text style={[styles.dayTitle, { color: t.text }]}>{d.weekday}</Text>
                        <Text style={[styles.daySub, { color: t.sub }]} numberOfLines={1}>
                          {s.totals
                            ? `${s.totals.runs} ${runsWord(s.totals.runs)} · ${km(s.totals.distance)} км · ${int(s.totals.vertical)} м`
                            : 'Нет данных'}
                        </Text>
                      </View>
                      <Text style={[styles.daySub, { color: t.sub }]}>
                        {span(((s.endedAt ?? s.startedAt) - s.startedAt) / 1000)}
                      </Text>
                      <Chevron />
                    </Card>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.m, paddingBottom: 120, gap: space.l },
  empty: { paddingTop: 96, alignItems: 'center', gap: space.s },
  emptyTitle: { fontSize: 20, fontWeight: '600' },
  emptyText: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  block: { gap: 8 },
  hero: { flexDirection: 'row', alignItems: 'flex-end', padding: 18, gap: 12, borderRadius: 22 },
  heroBody: { flex: 1, gap: 6 },
  heroValue: { fontSize: 60, fontWeight: '800', letterSpacing: -3, lineHeight: 62, fontVariant: ['tabular-nums'] },
  heroUnit: { fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  heroDate: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  records: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  record: { flexBasis: '30%', flexGrow: 1 },
  recordTile: { paddingHorizontal: 12, paddingVertical: 10, gap: 3, borderRadius: 16 },
  recordLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  recordValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  recordDate: { fontSize: 11, fontVariant: ['tabular-nums'] },
  recordsTitle: { paddingHorizontal: 4, marginBottom: 2 },
  recordUnit: { fontSize: 12, fontWeight: '500', letterSpacing: 0 },
  season: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  sectionNote: { fontSize: 13, fontVariant: ['tabular-nums'] },
  daysTitle: { paddingHorizontal: 4, marginTop: 10 },
  day: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  date: { width: 48, height: 48, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 19, fontWeight: '800', lineHeight: 20, fontVariant: ['tabular-nums'] },
  dateMonth: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  pisteDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', marginHorizontal: 4 },
  favCount: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dayBody: { flex: 1, gap: 2 },
  dayTitle: { fontSize: 17, fontWeight: '600' },
  daySub: { fontSize: 13, fontVariant: ['tabular-nums'] },
});
