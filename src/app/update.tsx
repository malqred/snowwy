import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';

import { Download, RefreshCw } from '@/components/icons';
import { Button, Card, Label, Screen } from '@/components/ui';
import { useTracker } from '@/lib/tracker';
import {
  askInstallPermission,
  canInstall,
  checkForUpdate,
  currentVersion,
  downloadAndInstall,
  useUpdate,
} from '@/lib/update';
import { space, useTheme } from '@/theme';

const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1048576))} МБ`;

/** Обновление на Android: что нового, скачивание и установка. */
export default function UpdateScreen() {
  const t = useTheme();
  const update = useUpdate();
  const { recording } = useTracker();
  const [allowed, setAllowed] = useState(canInstall);

  // Проверяем при открытии экрана и при возвращении из настроек разрешений
  useFocusEffect(
    useCallback(() => {
      if (update.status === 'idle' || update.status === 'error') checkForUpdate();
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') setAllowed(canInstall());
      });
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const release = update.release;
  const downloading = update.status === 'downloading';

  return (
    <Screen contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Card style={styles.pad}>
        <Label>Установлена</Label>
        <Text style={[styles.version, { color: t.text }]}>Snowwy {currentVersion}</Text>
        <Text style={[styles.text, { color: t.sub }]}>
          {update.status === 'checking'
            ? 'Проверяю, есть ли новая версия…'
            : update.status === 'latest'
              ? 'Это последняя версия.'
              : release
                ? `Доступна версия ${release.version}.`
                : 'Новые версии выходят на GitHub, приложение проверяет их раз в сутки само.'}
        </Text>
      </Card>

      {update.error ? <Text style={[styles.text, { color: t.danger }]}>{update.error}</Text> : null}

      {release ? (
        <>
          <Card style={styles.pad}>
            <Label>Что нового в {release.version}</Label>
            <Text style={[styles.text, { color: t.text }]}>{release.notes || 'Исправления и улучшения.'}</Text>
          </Card>

          {downloading ? (
            <View style={styles.section}>
              <View style={[styles.bar, { backgroundColor: t.line }]}>
                <View style={[styles.fill, { backgroundColor: t.accent, width: `${update.progress * 100}%` }]} />
              </View>
              <Text style={[styles.text, { color: t.sub }]}>
                Скачиваю: {Math.round(update.progress * 100)}% из {mb(release.size)}
              </Text>
            </View>
          ) : recording ? (
            <Text style={[styles.text, { color: t.sub }]}>
              Сейчас идёт запись катания. Установка закроет приложение и оборвёт её — обновитесь после того, как
              завершите катание.
            </Text>
          ) : allowed ? (
            <View style={styles.section}>
              <Button title={`Обновить до ${release.version}`} icon={Download} onPress={() => downloadAndInstall()} />
              <Text style={[styles.text, { color: t.sub }]}>
                Файл {mb(release.size)} — лучше скачивать по Wi‑Fi. После скачивания откроется окно Android: нажмите
                «Установить». Все записи и настройки сохранятся.
              </Text>
            </View>
          ) : (
            <View style={styles.section}>
              <Button title="Разрешить установку" icon={Download} onPress={askInstallPermission} />
              <Text style={[styles.text, { color: t.sub }]}>
                Android один раз спросит, можно ли Snowwy устанавливать обновления: включите «Разрешить установку из
                этого источника» и вернитесь сюда.
              </Text>
            </View>
          )}
        </>
      ) : update.status === 'checking' ? (
        <ActivityIndicator color={t.sub} />
      ) : (
        <Button title="Проверить ещё раз" kind="secondary" icon={RefreshCw} onPress={() => checkForUpdate()} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.m, paddingTop: space.s, paddingBottom: space.xl, gap: space.l },
  section: { gap: space.s },
  pad: { padding: space.m, gap: 6 },
  version: { fontSize: 24, fontWeight: '700' },
  text: { fontSize: 15, lineHeight: 21 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
