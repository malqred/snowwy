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
  /** Вторая линия для сравнения. Рисуется другим цветом, без заливки */
  second?: number[];
  /** Какую долю ширины занимает каждая линия (0..1), если они разной длины */
  span?: number;
  secondSpan?: number;
  /** Подписи под осью X вместо времени */
  axis?: [string, string];
};

/** Цвет второй линии на графиках и второго спуска на карте сравнения */
export const SECOND_COLOR = '#E07C3A';

const HEIGHT = 120;

/** Простой график с заливкой: значение по времени. */
export function Chart({
  title,
  values,
  duration,
  format,
  unit,
  fromZero = false,
  second,
  span = 1,
  secondSpan = 1,
  axis,
}: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);

  const data = thin(values, 160);
  const other = second ? thin(second, 160) : [];
  const all = data.concat(other);
  const max = all.length > 0 ? Math.max(...all) : 0;
  const min = fromZero || all.length === 0 ? 0 : Math.min(...all);
  const range = Math.max(max - min, 1e-6);

  const path = (series: number[], part: number) => {
    if (width <= 0 || series.length < 2) return '';
    const dx = (width * part) / (series.length - 1);
    return series
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * dx).toFixed(1)} ${(HEIGHT - 2 - ((v - min) / range) * (HEIGHT - 4)).toFixed(1)}`)
      .join(' ');
  };
  const line = path(data, span);
  const secondLine = path(other, secondSpan);
  const end = (width * span).toFixed(1);

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
            <Path d={`${line} L${end} ${HEIGHT} L0 ${HEIGHT} Z`} fill={t.text} fillOpacity={0.08} />
            <Path d={line} stroke={t.text} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
            {secondLine ? (
              <Path d={secondLine} stroke={SECOND_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
            ) : null}
            <Line x1={0} y1={HEIGHT - 0.5} x2={width} y2={HEIGHT - 0.5} stroke={t.line} strokeWidth={1} />
          </Svg>
        ) : null}
      </View>
      <View style={styles.axis}>
        <Text style={[styles.tick, { color: t.sub }]}>{axis ? axis[0] : '0:00'}</Text>
        <Text style={[styles.tick, { color: t.sub }]}>{axis ? axis[1] : clock(duration)}</Text>
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
