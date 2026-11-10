import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import '@/lib/settings';
import { recoverUnfinished } from '@/lib/tracker';
import { useTheme } from '@/theme';

export default function RootLayout() {
  const t = useTheme();

  useEffect(() => {
    recoverUnfinished().catch(() => {});
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
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
          headerBackTitle: 'Назад',
          contentStyle: { backgroundColor: t.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="session/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="session/[id]/run/[n]" options={{ title: '' }} />
      </Stack>
    </ThemeProvider>
  );
}
