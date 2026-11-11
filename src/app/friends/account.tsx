import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/field';
import { Cloud, KeyRound, LogOut, Trash, UserPlus } from '@/components/icons';
import { Button, Card, ICON_STROKE, Label, Screen } from '@/components/ui';
import { errorText } from '@/lib/friends/api';
import {
  cloudflareReachable,
  CloudflareError,
  connectAccount,
  destroyServer,
  serverOnline,
  disconnectAccount,
  NEW_TOKEN_URL,
  SIGNUP_URL,
  TOKENS_URL,
  useAccount,
} from '@/lib/friends/cloudflare';
import { createGroup, forgetGroup, getFriends } from '@/lib/friends/store';
import { space, useTheme } from '@/theme';

const open = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => {});

const problem = (e: unknown) => (e instanceof CloudflareError ? e.message : errorText(e));

/** Подключение аккаунта Cloudflare, в котором живёт сервер групп, и управление им. */
export default function AccountScreen() {
  const t = useTheme();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const account = useAccount();
  const [token, setToken] = useState('');
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Сервер размещён, но его адрес ещё не отвечает
  const [waiting, setWaiting] = useState(false);
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    cloudflareReachable().then((ok) => {
      if (active) setReachable(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  const connect = async () => {
    setError(null);
    setStep('Проверяю ключ доступа…');
    setWaiting(false);
    try {
      const online = await connectAccount(token, setStep);
      setToken('');
      if (!online) setWaiting(true);
      // Пришли сюда из «Создать группу» — сразу создаём её
      else if (next === 'create' && !getFriends().group) {
        setStep('Создаю группу…');
        await createGroup(setStep);
        router.back();
      }
    } catch (e) {
      setError(problem(e));
    } finally {
      setStep(null);
    }
  };

  const recheck = async () => {
    const url = account.server?.url;
    if (!url) return;
    setError(null);
    setStep('Проверяю сервер…');
    try {
      const online = await serverOnline(url, 5);
      setWaiting(!online);
      if (online && next === 'create' && !getFriends().group) {
        setStep('Создаю группу…');
        await createGroup(setStep);
        router.back();
      }
    } catch (e) {
      setError(problem(e));
    } finally {
      setStep(null);
    }
  };

  const signOut = () => {
    Alert.alert(
      'Выйти из аккаунта?',
      'Приложение забудет ключ доступа. Сервер и группа продолжат работать, вы по-прежнему сможете исключать участников и менять приглашение. Чтобы создать новую группу или удалить сервер, аккаунт нужно будет подключить снова.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выйти', style: 'destructive', onPress: () => disconnectAccount().catch(() => {}) },
      ]
    );
  };

  const destroy = () => {
    const server = account.server;
    Alert.alert(
      'Удалить сервер?',
      'Сервер и все группы на нём будут удалены из вашего аккаунта Cloudflare. У участников группы пропадут. Вернуть это нельзя.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            setStep('Удаляю сервер…');
            try {
              await destroyServer();
              if (server && getFriends().group?.url === server.url) forgetGroup();
            } catch (e) {
              setError(problem(e));
            } finally {
              setStep(null);
            }
          },
        },
      ]
    );
  };

  const progress = step ? (
    <View style={styles.busy}>
      <ActivityIndicator color={t.sub} />
      <Text style={[styles.text, styles.flex, { color: t.sub }]}>{step}</Text>
    </View>
  ) : null;
  const failure = error ? <Text style={[styles.text, { color: t.danger }]}>{error}</Text> : null;

  if (account.connected) {
    return (
      <Screen contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <Card style={styles.pad}>
          <View style={styles.rowHead}>
            <Cloud size={18} color={t.text} strokeWidth={ICON_STROKE} />
            <Text style={[styles.rowTitle, { color: t.text }]}>Аккаунт подключён</Text>
          </View>
          <Text style={[styles.text, { color: t.sub }]}>
            {account.accountName ?? 'Cloudflare'}
            {'\n'}
            {account.server
              ? 'Сервер групп размещён. Новые группы создаются во вкладке «Друзья» в одно нажатие.'
              : 'Сервера групп в этом аккаунте сейчас нет. Он появится, когда вы подключите аккаунт заново.'}
          </Text>
        </Card>

        {waiting ? (
          <Card style={styles.pad}>
            <Text style={[styles.text, { color: t.text }]}>
              Сервер размещён, но его адрес пока не отвечает. У нового аккаунта Cloudflare адрес начинает работать через
              несколько минут — подождите и проверьте ещё раз. Подключать аккаунт заново не нужно. Если адрес не
              заработал и через полчаса, значит, адреса workers.dev недоступны из вашей сети или через ваш VPN.
            </Text>
          </Card>
        ) : null}
        {progress}
        {failure}

        <View style={styles.section}>
          {waiting ? <Button title="Проверить сервер" icon={Cloud} onPress={recheck} disabled={step != null} /> : null}
          <Button title="Выйти из аккаунта" kind="secondary" icon={LogOut} onPress={signOut} disabled={step != null} />
          {account.server ? (
            <Button title="Удалить сервер и группы" kind="danger" icon={Trash} onPress={destroy} disabled={step != null} />
          ) : null}
          <Button title="Ключи доступа в Cloudflare" kind="secondary" icon={KeyRound} onPress={() => open(TOKENS_URL)} />
        </View>

        <Text style={[styles.note, { color: t.sub }]}>
          Ключ доступа хранится в защищённом хранилище этого iPhone и нужен только чтобы разместить, обновить или
          удалить сервер. Выход стирает ключ из приложения, но не отзывает его: чтобы ключ перестал действовать совсем,
          удалите его на странице ключей Cloudflare (ключ называется Snowwy).
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      <Text style={[styles.text, { color: t.sub }]}>
        Группа друзей работает на небольшом сервере в аккаунте Cloudflare её создателя. Аккаунт бесплатный, банковская
        карта не нужна. Приложение само разместит сервер — от вас нужны три шага.
      </Text>

      {reachable === false ? (
        <Card style={styles.pad}>
          <Text style={[styles.text, { color: t.danger }]}>
            Cloudflare сейчас не отвечает. Проверьте интернет. Если он есть, попробуйте включить или выключить VPN
            либо сменить его сервер: без доступа к Cloudflare подключить аккаунт не получится.
          </Text>
        </Card>
      ) : null}

      <View style={styles.section}>
        <Label>Шаг 1. Аккаунт</Label>
        <Card style={styles.pad}>
          <Text style={[styles.text, { color: t.sub }]}>
            Зарегистрируйтесь: почта и пароль, затем подтверждение по письму. Страница Cloudflare на английском и
            откроется поверх приложения; закончив, закройте её кнопкой «Готово» в углу экрана. Если аккаунт уже есть,
            пропустите этот шаг.
          </Text>
        </Card>
        <Button title="Зарегистрироваться в Cloudflare" kind="secondary" icon={UserPlus} onPress={() => open(SIGNUP_URL)} />
      </View>

      <View style={styles.section}>
        <Label>Шаг 2. Ключ доступа</Label>
        <Card style={styles.pad}>
          <Text style={[styles.text, { color: t.sub }]}>
            Откроется страница нового ключа, права на ней уже выбраны (если попросят — сначала войдите в аккаунт).
            Прокрутите вниз и нажмите Continue to summary, затем Create Token, затем Copy. Ключ показывают один раз.
          </Text>
        </Card>
        <Button title="Создать ключ доступа" kind="secondary" icon={KeyRound} onPress={() => open(NEW_TOKEN_URL)} />
      </View>

      <View style={styles.section}>
        <Label>Шаг 3. Вставьте ключ</Label>
        <Field
          value={token}
          onChangeText={setToken}
          placeholder="Ключ доступа из Cloudflare"
          autoCapitalize="none"
          secureTextEntry
          editable={step == null}
        />
        <Button title="Подключить" icon={Cloud} onPress={connect} disabled={step != null || token.trim().length === 0} />
        {progress}
        {failure}
      </View>

      <Text style={[styles.note, { color: t.sub }]}>
        Ключ даёт приложению право управлять только серверами Workers и базами D1 в вашем аккаунте. Он хранится в
        защищённом хранилище этого iPhone и никуда, кроме Cloudflare, не отправляется. Размещение сервера занимает
        около минуты.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.m, paddingTop: space.s, paddingBottom: space.xl, gap: space.l },
  section: { gap: space.s },
  flex: { flex: 1 },
  pad: { padding: space.m, gap: 6 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 17, fontWeight: '600' },
  text: { fontSize: 14, lineHeight: 20 },
  note: { fontSize: 13, lineHeight: 18 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
});
