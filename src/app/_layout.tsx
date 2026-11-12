import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';

import { autoBackup, chooseBackupFolder } from '@/lib/backup';
import { getSettings, updateSettings } from '@/lib/settings';
import { recoverUnfinished } from '@/lib/tracker';
import { useTheme } from '@/theme';

export default function RootLayout() {
  const t = useTheme();

  useEffect(() => {
    recoverUnfinished().catch(() => {});
    // Один раз спрашиваем, нужна ли резервная копия. Потом это меняется в настройках.
    if (getSettings().backup === null && Platform.OS === 'android') {
      Alert.alert(
        'Сохранять резервную копию?',
        'После каждого катания Snowwy будет обновлять файл со всеми записями в папке, которую вы выберете, — например, в «Документах». Файл останется в телефоне, даже если удалить Snowwy. Изменить выбор можно в настройках.',
        [
          { text: 'Не нужно', style: 'cancel', onPress: () => updateSettings({ backup: false }) },
          {
            text: 'Выбрать папку',
            onPress: async () => {
              const chosen = await chooseBackupFolder();
              updateSettings({ backup: chosen });
              if (chosen) autoBackup();
            },
          },
        ]
      );
    } else if (getSettings().backup === null) {
      Alert.alert(
        'Сохранять резервную копию?',
        'После каждого катания Snowwy будет обновлять файл со всеми записями. Он лежит в приложении «Файлы» → «На iPhone» → Snowwy, оттуда его можно скопировать в iCloud Drive или на компьютер. Если удалить Snowwy, файл удалится вместе с ним. Изменить выбор можно в настройках.',
        [
          { text: 'Не нужно', style: 'cancel', onPress: () => updateSettings({ backup: false }) },
          {
            text: 'Сохранять',
            onPress: () => {
              updateSettings({ backup: true });
              autoBackup();
            },
          },
        ]
      );
    }
  }, []);

  const base = t.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: t.bg, card: t.bg, text: t.text, border: t.line, primary: t.text },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          // На iPhone содержимое само уходит под прозрачную шапку с отступом, на Android — нет:
          // там шапка плотная, цвета верха фона, и содержимое начинается под ней
          headerTransparent: Platform.OS === 'ios',
          headerStyle: Platform.OS === 'ios' ? undefined : { backgroundColor: t.bgTop },
          headerTintColor: t.text,
          headerShadowVisible: false,
          headerBackTitle: 'Назад',
          contentStyle: { backgroundColor: t.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="session/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="session/[id]/run/[n]" options={{ title: '' }} />
        <Stack.Screen name="session/[id]/compare" options={{ title: 'Сравнение' }} />
        <Stack.Screen name="session/[id]/done" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="friends/account" options={{ title: 'Аккаунт Cloudflare' }} />
        <Stack.Screen name="friends/join" options={{ title: 'Вход в группу' }} />
        <Stack.Screen name="friends/invite" options={{ title: 'Приглашение' }} />
      </Stack>
    </ThemeProvider>
  );
}
