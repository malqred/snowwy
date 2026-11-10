import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bell, FlaskConical, MonitorSmartphone, Moon, Smartphone, Sun, Trash, type IconType } from '@/components/icons';
import { Button, Card, ICON_STROKE, Label, Title } from '@/components/ui';
import { analyze } from '@/lib/analyze';
import { createSession, deleteEverything, finishSession, insertPoints } from '@/lib/db';
import { generateDemoTrack } from '@/lib/demo';
import { updateSettings, useSettings, type ThemeMode } from '@/lib/settings';
import { useTracker } from '@/lib/tracker';
import { space, useTheme } from '@/theme';

const THEMES: { mode: ThemeMode; title: string; icon: IconType }[] = [
  { mode: 'system', title: 'Системная', icon: MonitorSmartphone },
  { mode: 'light', title: 'Светлая', icon: Sun },
  { mode: 'dark', title: 'Тёмная', icon: Moon },
];

export default function SettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const { recording } = useTracker();
  const [busy, setBusy] = useState(false);

  const addDemo = async () => {
    setBusy(true);
    try {
      // Вчера с 10:00, каждый раз немного другой день
      const start = new Date();
      start.setDate(start.getDate() - 1);
      start.setHours(10, 0, 0, 0);
      const points = generateDemoTrack(start.getTime(), 7, Date.now() % 1000);
      const id = await createSession(start.getTime());
      await insertPoints(id, points);
      await finishSession(id, points[points.length - 1].t, analyze(points).totals);
      Alert.alert('Готово', 'Демо-катание добавлено. Оно появилось во вкладке «История».');
    } catch {
      Alert.alert('Не получилось', 'Не удалось добавить демо-катание. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const wipe = () => {
    Alert.alert('Удалить все записи?', 'Вся история катания будет удалена с этого телефона. Вернуть её нельзя.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить всё', style: 'destructive', onPress: () => deleteEverything().catch(() => {}) },
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l }]}
      showsVerticalScrollIndicator={false}>
      <Title>Настройки</Title>

      <View style={styles.section}>
        <Label>Тема</Label>
        <View style={[styles.segments, { backgroundColor: t.card, borderColor: t.line }]}>
          {THEMES.map(({ mode, title, icon: Icon }) => {
            const active = settings.theme === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => updateSettings({ theme: mode })}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.segment, active && { backgroundColor: t.accent }]}>
                <Icon size={16} color={active ? t.inverse : t.text} strokeWidth={ICON_STROKE} />
                <Text style={[styles.segmentText, { color: active ? t.inverse : t.text }]}>{title}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Label>Запись</Label>
        <Card style={styles.switchRow}>
          <View style={styles.switchBody}>
            <View style={styles.rowHead}>
              <Smartphone size={18} color={t.text} strokeWidth={ICON_STROKE} />
              <Text style={[styles.rowTitle, { color: t.text }]}>Не гасить экран</Text>
            </View>
            <Text style={[styles.rowSub, { color: t.sub }]}>
              Экран остаётся включённым, пока идёт запись. Применится со следующего катания.
            </Text>
          </View>
          <Switch
            value={settings.keepAwake}
            onValueChange={(keepAwake) => updateSettings({ keepAwake })}
            trackColor={{ true: t.accent, false: t.line }}
            thumbColor={t.dark && settings.keepAwake ? t.inverse : undefined}
          />
        </Card>
        <Card style={styles.switchRow}>
          <View style={styles.switchBody}>
            <View style={styles.rowHead}>
              <Bell size={18} color={t.text} strokeWidth={ICON_STROKE} />
              <Text style={[styles.rowTitle, { color: t.text }]}>Напоминать о записи</Text>
            </View>
            <Text style={[styles.rowSub, { color: t.sub }]}>
              Через полчаса без движения придёт уведомление, через два часа запись завершится сама. О паузе
              напомним через час.
            </Text>
          </View>
          <Switch
            value={settings.remind}
            onValueChange={(remind) => updateSettings({ remind })}
            trackColor={{ true: t.accent, false: t.line }}
            thumbColor={t.dark && settings.remind ? t.inverse : undefined}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <Label>Данные</Label>
        <Button title="Добавить демо-катание" kind="secondary" icon={FlaskConical} onPress={addDemo} disabled={busy} />
        <Button title="Удалить все записи" kind="danger" icon={Trash} onPress={wipe} disabled={recording} />
        <Text style={[styles.rowSub, { color: t.sub }]}>
          Демо-катание — выдуманный день на семь спусков, чтобы посмотреть приложение без выезда на склон. Все данные
          хранятся только на этом телефоне.
        </Text>
      </View>

      <Text style={[styles.version, { color: t.sub }]}>Snowwy {Constants.expoConfig?.version ?? ''}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.m, paddingBottom: 120, gap: space.l },
  section: { gap: space.s },
  segments: {
    flexDirection: 'row',
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    gap: 4,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segment: { flex: 1, flexDirection: 'row', gap: 6, height: 40, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', padding: space.m, gap: space.m },
  switchBody: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 17, fontWeight: '600' },
  rowSub: { fontSize: 13, lineHeight: 18 },
  version: { fontSize: 13, textAlign: 'center' },
});
