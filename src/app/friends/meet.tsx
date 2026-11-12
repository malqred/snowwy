import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/field';
import { Flag, Minus, Plus } from '@/components/icons';
import { TrackMap } from '@/components/track-map';
import { Button, Card, ICON_STROKE, Label, Screen } from '@/components/ui';
import { errorText } from '@/lib/friends/api';
import { createMeet, MEET_TEXT_MAX, OldServerError, useFriends } from '@/lib/friends/store';
import { inTime, time } from '@/lib/format';
import type { Coord } from '@/lib/lines';
import { ensureNotifyPermission } from '@/lib/notify';
import { useMySpot } from '@/lib/relative';
import { space, useTheme } from '@/theme';

const MINUTE = 60 * 1000;
/** Время встречи округляется до 5 минут */
const STEP = 5 * MINUTE;

const roundUp = (ts: number) => Math.ceil(ts / STEP) * STEP;

/** Назначение точки встречи: место на карте, описание и время. */
export default function MeetScreen() {
  const t = useTheme();
  const router = useRouter();
  const friends = useFriends();
  const me = useMySpot(true);
  const [point, setPoint] = useState<Coord | null>(null);
  const [text, setText] = useState('');
  const [at, setAt] = useState(() => roundUp(Date.now() + 30 * MINUTE));
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ensureNotifyPermission();
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Пока место не выбрано, ставим точку туда, где вы сейчас
  const chosen = point ?? (me ? { latitude: me.lat, longitude: me.lon } : null);
  const pins = friends.members
    .filter((m) => m.pos)
    .map((m, i) => ({
      id: m.id,
      coord: { latitude: m.pos!.lat, longitude: m.pos!.lon },
      color: m.me ? '#3F97F0' : '#8A94A6',
      letter: (Array.from(m.name.trim())[0] ?? '?').toUpperCase(),
      dim: !m.me && i >= 0,
    }));

  const shift = (minutes: number) => setAt((v) => Math.max(roundUp(Date.now() + STEP), v + minutes * MINUTE));

  const submit = async () => {
    if (!chosen) {
      Alert.alert('Выберите место', 'Нажмите на карту там, где хотите встретиться.');
      return;
    }
    if (!text.trim()) {
      Alert.alert('Добавьте описание', 'Например: «у кафе на верхней станции» или «на развилке трасс».');
      return;
    }
    setBusy(true);
    try {
      await createMeet({ lat: chosen.latitude, lon: chosen.longitude, text, at });
      router.back();
    } catch (e) {
      Alert.alert(
        'Не получилось',
        e instanceof OldServerError
          ? 'Сервер группы ещё старой версии. Он обновится сам, когда создатель группы откроет вкладку «Друзья» в Snowwy 1.0.4 или новее.'
          : errorText(e)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <Label>Где</Label>
        <TrackMap lines={[]} pins={pins} meet={chosen} onPress={setPoint} style={styles.map} />
        <Text style={[styles.note, { color: t.sub }]}>
          {chosen ? 'Нажмите на карту, чтобы перенести точку.' : 'Нажмите на карту там, где хотите встретиться.'}
        </Text>
      </View>

      <View style={styles.section}>
        <Label>Описание</Label>
        <Field
          value={text}
          onChangeText={setText}
          placeholder="Например: у кафе на верхней станции"
          maxLength={MEET_TEXT_MAX}
          returnKeyType="done"
        />
      </View>

      <View style={styles.section}>
        <Label>Когда</Label>
        <Card style={styles.when}>
          <Pressable onPress={() => shift(-5)} hitSlop={8} accessibilityRole="button" accessibilityLabel="На 5 минут раньше" style={styles.step}>
            <Minus size={22} color={t.text} strokeWidth={ICON_STROKE} />
          </Pressable>
          <View style={styles.whenBody}>
            <Text style={[styles.clock, { color: t.text }]}>{time(at)}</Text>
            <Text style={[styles.note, { color: t.sub }]}>{inTime(at - now)}</Text>
          </View>
          <Pressable onPress={() => shift(5)} hitSlop={8} accessibilityRole="button" accessibilityLabel="На 5 минут позже" style={styles.step}>
            <Plus size={22} color={t.text} strokeWidth={ICON_STROKE} />
          </Pressable>
        </Card>
        <View style={styles.chips}>
          {[15, 30, 60, 120].map((m) => (
            <Pressable
              key={m}
              onPress={() => setAt(roundUp(Date.now() + m * MINUTE))}
              accessibilityRole="button"
              style={[styles.chip, { borderColor: t.line, backgroundColor: t.card }]}>
              <Text style={[styles.chipText, { color: t.text }]}>{m < 60 ? `${m} мин` : `${m / 60} ч`}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Button title="Назначить встречу" icon={Flag} onPress={submit} disabled={busy} />
      {busy ? <ActivityIndicator color={t.sub} /> : null}
      <Text style={[styles.note, { color: t.sub }]}>
        Все в группе получат уведомление, а за 20 минут и в само время — напоминание. Телефоны узнают о встрече при
        следующем обновлении группы: во время записи — в течение 30 секунд, иначе — когда откроют Snowwy или проверят
        группу в фоне.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.m, paddingTop: space.s, paddingBottom: space.xl, gap: space.l },
  section: { gap: space.s },
  map: { height: 300 },
  note: { fontSize: 13, lineHeight: 18 },
  when: { flexDirection: 'row', alignItems: 'center', padding: space.s },
  whenBody: { flex: 1, alignItems: 'center', gap: 2 },
  clock: { fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
  step: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
});
