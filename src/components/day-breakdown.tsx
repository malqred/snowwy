import { StyleSheet, Text, View } from 'react-native';

import type { DayParts } from '@/lib/compare';
import { num, span } from '@/lib/format';
import { LIFT_COLOR, RUN_COLOR, space, useTheme } from '@/theme';

import { CableCar, Coffee, TrendingDown, type IconType } from './icons';
import { Card, ICON_STROKE } from './ui';

/** На что ушёл день: полоса времени и три строки — спуски, подъёмники, отдых. */
export function DayBreakdown({ parts }: { parts: DayParts }) {
  const t = useTheme();
  const total = parts.run + parts.lift + parts.rest;
  if (total <= 0) return null;

  const color = { run: RUN_COLOR, lift: LIFT_COLOR, rest: t.line };
  const rows: { kind: keyof typeof color; icon: IconType; title: string; seconds: number }[] = [
    { kind: 'run', icon: TrendingDown, title: 'Спуски', seconds: parts.run },
    { kind: 'lift', icon: CableCar, title: 'Подъёмники', seconds: parts.lift },
    { kind: 'rest', icon: Coffee, title: 'Отдых и очереди', seconds: parts.rest },
  ];

  return (
    <Card style={styles.card}>
      <View style={styles.strip}>
        {parts.strip.map((p, i) => (
          <View key={i} style={{ flex: Math.max(p.seconds, 1), backgroundColor: color[p.kind] }} />
        ))}
      </View>
      {rows.map(({ kind, icon: Icon, title, seconds }) => (
        <View key={kind} style={styles.row}>
          <View style={[styles.swatch, { backgroundColor: color[kind] }]} />
          <Icon size={16} color={kind === 'rest' ? t.sub : color[kind]} strokeWidth={ICON_STROKE} />
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          <Text style={[styles.value, { color: t.text }]}>{span(seconds)}</Text>
          <Text style={[styles.share, { color: t.sub }]}>{num((seconds / total) * 100)}%</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.m, gap: 12 },
  strip: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  title: { flex: 1, fontSize: 15, fontWeight: '500' },
  value: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  share: { width: 44, textAlign: 'right', fontSize: 13, fontVariant: ['tabular-nums'] },
});
