// Выбор времени двумя колёсами — часы и минуты, как в будильнике iPhone.
// Своё колесо, а не системное: на iPhone и Android выглядит и крутится одинаково.
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { space, useTheme } from '@/theme';

/** Высота одной строки колеса и сколько строк видно */
const ROW = 44;
const VISIBLE = 5;
/** Колесо «бесконечное»: значения повторяются столько раз, старт — в середине */
const LAPS = 9;

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

function Wheel({
  count,
  value,
  onChange,
  label,
}: {
  count: number;
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const t = useTheme();
  const scroll = useRef<ScrollViewInstance>(null);
  const middle = Math.floor(LAPS / 2) * count;
  const [rows] = useState(() => Array.from({ length: LAPS * count }, (_, i) => i));
  const [y] = useState(() => new Animated.Value((middle + value) * ROW));
  // Последнее значение, которое выставило само колесо: тогда снаружи прокручивать не нужно
  const own = useRef(value);

  // Значение сменили снаружи (кнопки «через 15 мин» и т. п.) — докручиваем колесо
  useEffect(() => {
    if (own.current === value) return;
    own.current = value;
    scroll.current?.scrollTo({ y: (middle + value) * ROW, animated: true });
  }, [value, middle]);

  // Где колесо сейчас и таймер доводки: после того как палец отпущен и колесо замерло,
  // оно всегда встаёт ровно на строку — даже если система не прислала «прокрутка закончилась»
  const offset = useRef((middle + value) * ROW);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const settle = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const at = offset.current;
    const index = Math.round(at / ROW);
    const v = ((index % count) + count) % count;
    // Ушли далеко от середины — тихо возвращаемся к ней, чтобы колесо не кончалось
    if (Math.abs(index - (middle + v)) > count * 2) {
      scroll.current?.scrollTo({ y: (middle + v) * ROW, animated: false });
    } else if (Math.abs(at - index * ROW) > 0.5) {
      // Остановилось между строками — доводим до ближайшей, как у будильника
      scroll.current?.scrollTo({ y: index * ROW, animated: true });
    }
    if (v !== own.current) {
      own.current = v;
      onChange(v);
    }
  };
  /** Колесо двигается: доводку переносим на «через мгновение после последнего движения» */
  const later = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(settle, ms);
  };


  return (
    <Animated.ScrollView
      ref={scroll}
      style={styles.wheel}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      snapToInterval={ROW}
      decelerationRate="fast"
      contentOffset={{ x: 0, y: (middle + value) * ROW }}
      contentContainerStyle={{ paddingVertical: ROW * ((VISIBLE - 1) / 2) }}
      scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true })}
      onScrollBeginDrag={() => {
        if (timer.current) clearTimeout(timer.current);
      }}
      onScrollEndDrag={(e) => {
        // Если колесо покатится по инерции, доводка сработает в конце инерции, иначе — сейчас
        offset.current = e.nativeEvent.contentOffset.y;
        later(120);
      }}
      onMomentumScrollBegin={() => {
        if (timer.current) clearTimeout(timer.current);
      }}
      onMomentumScrollEnd={(e) => {
        offset.current = e.nativeEvent.contentOffset.y;
        settle();
      }}
      accessibilityLabel={label}>
      {rows.map((i) => {
        // Чем дальше строка от середины, тем она бледнее и мельче — как у будильника
        const center = i * ROW;
        const range = [center - 2 * ROW, center - ROW, center, center + ROW, center + 2 * ROW];
        const opacity = y.interpolate({ inputRange: range, outputRange: [0.18, 0.45, 1, 0.45, 0.18], extrapolate: 'clamp' });
        const scale = y.interpolate({ inputRange: range, outputRange: [0.8, 0.9, 1, 0.9, 0.8], extrapolate: 'clamp' });
        return (
          <View key={i} style={styles.row}>
            <Animated.Text style={[styles.digit, { color: t.text, opacity, transform: [{ scale }] }]}>
              {pad(i % count)}
            </Animated.Text>
          </View>
        );
      })}
    </Animated.ScrollView>
  );
}

/** Часы и минуты колёсами, по центру — подсвеченная строка выбора. */
export function WheelTime({
  hour,
  minute,
  onChange,
}: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.box}>
      <View pointerEvents="none" style={[styles.band, { backgroundColor: t.line }]} />
      <View style={styles.wheels}>
        <Wheel count={24} value={hour} onChange={(h) => onChange(h, minute)} label="Часы" />
        <Text style={[styles.colon, { color: t.text }]}>:</Text>
        <Wheel count={60} value={minute} onChange={(m) => onChange(hour, m)} label="Минуты" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: ROW * VISIBLE, justifyContent: 'center', overflow: 'hidden' },
  band: {
    position: 'absolute',
    left: space.s,
    right: space.s,
    top: ROW * ((VISIBLE - 1) / 2),
    height: ROW,
    borderRadius: ROW / 2,
  },
  wheels: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  wheel: { width: 84, height: ROW * VISIBLE, flexGrow: 0 },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  digit: { fontSize: 28, fontWeight: '500', fontVariant: ['tabular-nums'] },
  colon: { fontSize: 26, fontWeight: '600', marginHorizontal: 2, marginBottom: 3 },
});
