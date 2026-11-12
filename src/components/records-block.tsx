import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dateLong, dateShort } from '@/lib/format';
import { findRecords } from '@/lib/records';
import type { Session } from '@/lib/types';
import { useTheme } from '@/theme';

import { Card, Label, useOnAccent } from './ui';

/** Короткие подписи рекордов для маленьких плиток */
const SHORT: Record<string, string> = {
  longestRun: 'Длина спуска',
  biggestRunVertical: 'Перепад за спуск',
  runs: 'Спусков за день',
  distance: 'Путь за день',
  vertical: 'Перепад за день',
};

/** Личные рекорды: скорость крупно, остальное плитками. Нажатие открывает день рекорда. */
export function RecordsBlock({ sessions, title = 'Рекорды' }: { sessions: Session[]; title?: string }) {
  const t = useTheme();
  const onAccent = useOnAccent();
  const router = useRouter();
  const records = findRecords(sessions);
  if (records.length === 0) return null;
  // Главный рекорд — скорость; он один на экране выделен цветом
  const main = records.find((r) => r.key === 'maxSpeed');
  const rest = records.filter((r) => r !== main);
  const open = (id: number) => router.push(`/session/${id}`);

  return (
    <View style={styles.block}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {main ? (
        <Pressable onPress={() => open(main.sessionId)} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Card accent style={styles.hero}>
            <View style={styles.heroBody}>
              <Label color={onAccent}>Скорость</Label>
              <Text style={[styles.heroValue, { color: onAccent }]} numberOfLines={1} adjustsFontSizeToFit>
                {main.value}
                <Text style={styles.heroUnit}> {main.unit}</Text>
              </Text>
            </View>
            <Text style={[styles.heroDate, { color: onAccent }]}>{dateLong(main.startedAt)}</Text>
          </Card>
        </Pressable>
      ) : null}
      <View style={styles.records}>
        {rest.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => open(r.sessionId)}
            accessibilityRole="button"
            accessibilityLabel={r.label}
            style={({ pressed }) => [styles.record, pressed && { opacity: 0.6 }]}>
            <Card quiet style={styles.recordTile}>
              <Text style={[styles.recordLabel, { color: t.sub }]} numberOfLines={1} adjustsFontSizeToFit>
                {SHORT[r.key] ?? r.label}
              </Text>
              <Text style={[styles.recordValue, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit>
                {r.value}
                {r.unit ? <Text style={[styles.recordUnit, { color: t.sub }]}> {r.unit}</Text> : null}
              </Text>
              <Text style={[styles.recordDate, { color: t.sub }]} numberOfLines={1}>
                {dateShort(r.startedAt)}
              </Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, paddingHorizontal: 4, marginBottom: 2 },
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
  recordUnit: { fontSize: 12, fontWeight: '500', letterSpacing: 0 },
});
