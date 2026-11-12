import { useRef, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { thin } from '@/lib/analyze';
import { niceScale, valueAt } from '@/lib/chart-scale';
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
  /** Подпись точки под палочкой по доле ширины (0..1); по умолчанию — время от начала */
  at?: (fraction: number) => string;
};

/** Цвет второй линии на графиках и второго спуска на карте сравнения */
export const SECOND_COLOR = '#E07C3A';

const HEIGHT = 120;
/** Полоса над графиком для подписи палочки */
const BUBBLE = 26;
/** Ширина колонки с числами слева */
const AXIS_W = 40;
/** Сдвиг пальца по горизонтали, после которого жест считается «водим палочкой», а не прокруткой */
const SLOP = 6;

/** Простой график с заливкой: значение по времени. Числа слева, палочку можно водить пальцем. */
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
  at,
}: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  /** Где стоит палочка: доля ширины 0..1, null — не показана */
  const [pick, setPick] = useState<number | null>(null);
  // Жест начался в этой точке; «держим» его, когда палец пошёл вбок
  const touch = useRef({ x0: 0, held: false });

  const data = thin(values, 160);
  const other = second ? thin(second, 160) : [];
  const all = data.concat(other);
  const lo = all.length > 0 ? Math.min(...all) : 0;
  const hi = all.length > 0 ? Math.max(...all) : 1;
  const scale = niceScale(fromZero ? Math.min(0, lo) : lo, hi);
  const { min, max } = scale;
  const range = Math.max(max - min, 1e-6);
  const yOf = (v: number) => HEIGHT - 2 - ((v - min) / range) * (HEIGHT - 4);

  const path = (series: number[], part: number) => {
    if (width <= 0 || series.length < 2) return '';
    const dx = (width * part) / (series.length - 1);
    return series.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * dx).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ');
  };
  const line = path(data, span);
  const secondLine = path(other, secondSpan);
  const end = (width * span).toFixed(1);

  const place = (e: GestureResponderEvent) => {
    if (width <= 0) return;
    setPick(Math.min(1, Math.max(0, e.nativeEvent.locationX / width)));
  };

  // Значения под палочкой — по полным данным, а не по прореженным для рисования
  const first = pick == null ? null : valueAt(values, pick, span);
  const next = pick == null || !second ? null : valueAt(second, pick, secondSpan);
  const px = pick == null ? 0 : pick * width;
  const label = pick == null ? '' : at ? at(pick) : clock(pick * duration);
  // Подпись не вылезает за края графика
  const bubbleW = second ? 150 : 110;
  const bubbleLeft = Math.min(Math.max(px - bubbleW / 2, 0), Math.max(width - bubbleW, 0));

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Label>{title}</Label>
        <Text style={[styles.range, { color: t.sub }]}>{unit}</Text>
      </View>
      <View style={styles.body}>
        <View style={[styles.yAxis, { marginTop: BUBBLE }]}>
          {scale.ticks.map((v) => (
            <Text key={v} style={[styles.yTick, { color: t.sub, top: yOf(v) - 7 }]} numberOfLines={1}>
              {format(v)}
            </Text>
          ))}
        </View>
        <View
          style={styles.plot}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          // Касание ставит палочку. Ведём вбок — палочка едет, прокрутка экрана не мешает.
          // Ведём вверх-вниз — экран прокручивается, палочка прячется.
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => {
            touch.current.x0 = e.nativeEvent.pageX;
            touch.current.held = false;
            place(e);
          }}
          onResponderMove={(e) => {
            if (Math.abs(e.nativeEvent.pageX - touch.current.x0) > SLOP) touch.current.held = true;
            place(e);
          }}
          onResponderTerminationRequest={() => !touch.current.held}
          onResponderTerminate={() => setPick(null)}
          accessibilityLabel={`${title}: проведите пальцем по графику, чтобы увидеть значение`}>
          <View style={{ height: BUBBLE }} pointerEvents="none">
            {pick != null && first != null ? (
              <View style={[styles.bubble, { left: bubbleLeft, width: bubbleW, backgroundColor: t.text }]}>
                <Text style={[styles.bubbleText, { color: t.bg }]} numberOfLines={1}>
                  {format(first)}
                  {next != null ? ` / ${format(next)}` : ''} {unit}
                  <Text style={styles.bubbleSub}> · {label}</Text>
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ height: HEIGHT }} pointerEvents="none">
            {line ? (
              <Svg width={width} height={HEIGHT}>
                {scale.ticks.slice(1).map((v) => (
                  <Line key={v} x1={0} y1={yOf(v)} x2={width} y2={yOf(v)} stroke={t.line} strokeWidth={1} strokeDasharray="3 5" />
                ))}
                <Path d={`${line} L${end} ${HEIGHT} L0 ${HEIGHT} Z`} fill={t.text} fillOpacity={0.08} />
                <Path d={line} stroke={t.text} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
                {secondLine ? (
                  <Path d={secondLine} stroke={SECOND_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
                ) : null}
                <Line x1={0} y1={HEIGHT - 0.5} x2={width} y2={HEIGHT - 0.5} stroke={t.line} strokeWidth={1} />
                {pick != null ? (
                  <>
                    <Line x1={px} y1={0} x2={px} y2={HEIGHT} stroke={t.text} strokeWidth={1.5} />
                    {first != null ? <Circle cx={px} cy={yOf(first)} r={4.5} fill={t.text} stroke={t.card} strokeWidth={2} /> : null}
                    {next != null ? <Circle cx={px} cy={yOf(next)} r={4.5} fill={SECOND_COLOR} stroke={t.card} strokeWidth={2} /> : null}
                  </>
                ) : null}
              </Svg>
            ) : null}
          </View>
        </View>
      </View>
      <View style={[styles.axis, { marginLeft: AXIS_W }]}>
        <Text style={[styles.tick, { color: t.sub }]}>{axis ? axis[0] : '0:00'}</Text>
        <Text style={[styles.tick, { color: t.sub }]}>{axis ? axis[1] : clock(duration)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: space.m, gap: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  range: { fontSize: 13 },
  body: { flexDirection: 'row' },
  yAxis: { width: AXIS_W, height: HEIGHT },
  yTick: { position: 'absolute', right: 6, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
  plot: { flex: 1 },
  bubble: { position: 'absolute', top: 0, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bubbleText: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  bubbleSub: { fontWeight: '400' },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  tick: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
