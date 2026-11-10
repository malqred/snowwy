import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { thin } from '@/lib/analyze';
import { clock } from '@/lib/format';
import { space, useTheme } from '@/theme';

import { Card, Label } from './ui';

type Props = {
  title: string;
  values: number[];
  /** Длительность участка, с — для подписи оси времени */
  duration: number;
  format: (value: number) => string;
  unit: string;
  /** Начинать ось Y с нуля (для скорости) или с минимума (для высоты) */
  fromZero?: boolean;
};

const HEIGHT = 120;

/** Простой график с заливкой: значение по времени. */
export function Chart({ title, values, duration, format, unit, fromZero = false }: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);

  const data = thin(values, 160);
  const max = Math.max(...data);
  const min = fromZero ? 0 : Math.min(...data);
  const range = Math.max(max - min, 1e-6);

  let line = '';
  if (width > 0 && data.length > 1) {
    const dx = width / (data.length - 1);
    line = data
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * dx).toFixed(1)} ${(HEIGHT - 2 - ((v - min) / range) * (HEIGHT - 4)).toFixed(1)}`)
      .join(' ');
  }

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Label>{title}</Label>
        <Text style={[styles.range, { color: t.sub }]}>
          {format(min)}–{format(max)} {unit}
        </Text>
      </View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HEIGHT }}>
        {line ? (
          <Svg width={width} height={HEIGHT}>
            <Line x1={0} y1={HEIGHT / 2} x2={width} y2={HEIGHT / 2} stroke={t.line} strokeWidth={1} strokeDasharray="3 5" />
            <Path d={`${line} L${width} ${HEIGHT} L0 ${HEIGHT} Z`} fill={t.text} fillOpacity={0.08} />
            <Path d={line} stroke={t.text} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
            <Line x1={0} y1={HEIGHT - 0.5} x2={width} y2={HEIGHT - 0.5} stroke={t.line} strokeWidth={1} />
          </Svg>
        ) : null}
      </View>
      <View style={styles.axis}>
        <Text style={[styles.tick, { color: t.sub }]}>0:00</Text>
        <Text style={[styles.tick, { color: t.sub }]}>{clock(duration)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.m, gap: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  range: { fontSize: 13, fontVariant: ['tabular-nums'] },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  tick: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
