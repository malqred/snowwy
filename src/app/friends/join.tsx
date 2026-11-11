import { Camera, CameraView } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/field';
import { ScanLine, Users } from '@/components/icons';
import { Button, Card, Label, Screen } from '@/components/ui';
import { errorText } from '@/lib/friends/api';
import { parseInvite } from '@/lib/friends/codec';
import { joinGroup, leaveGroup, NAME_MAX, setFriendName, useFriends } from '@/lib/friends/store';
import { space, useTheme } from '@/theme';

/** Вход в группу: по QR-коду или по вставленному приглашению. Сюда же ведёт ссылка-приглашение. */
export default function JoinScreen() {
  const t = useTheme();
  const router = useRouter();
  const { d } = useLocalSearchParams<{ d?: string }>();
  const friends = useFriends();
  const [name, setName] = useState(friends.name);
  const [code, setCode] = useState(d ?? '');
  const [busy, setBusy] = useState(false);
  // Имя на момент срабатывания сканера: он живёт дольше одного кадра экрана
  const nameRef = useRef(name);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  const enter = async (text: string) => {
    const invite = parseInvite(text);
    if (!invite) {
      Alert.alert('Это не приглашение', 'Вставьте сообщение с приглашением целиком или отсканируйте QR-код в Snowwy у создателя группы.');
      return;
    }
    const who = nameRef.current.trim();
    if (!who) {
      Alert.alert('Укажите имя', 'Под этим именем вас увидят остальные в группе.');
      return;
    }
    setBusy(true);
    try {
      await setFriendName(who);
      // В группе можно состоять только одной: из прежней выходим
      if (friends.group) await leaveGroup();
      await joinGroup(invite);
      router.back();
    } catch (e) {
      Alert.alert('Не получилось войти', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = (text: string) => {
    if (!friends.group) return enter(text);
    Alert.alert(
      'Перейти в другую группу?',
      friends.group.admin
        ? 'Вы создатель нынешней группы: при переходе она будет удалена у всех участников.'
        : 'Состоять можно только в одной группе: из нынешней вы выйдете.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Перейти', style: 'destructive', onPress: () => enter(text) },
      ]
    );
  };

  const scan = async () => {
    const permission = await Camera.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Нет доступа к камере', 'Разрешите его в Настройках iPhone → Snowwy → Камера или вставьте приглашение текстом.');
      return;
    }
    const sub = CameraView.onModernBarcodeScanned(({ data }) => {
      sub.remove();
      CameraView.dismissScanner().catch(() => {});
      setCode(data);
      confirm(data);
    });
    try {
      await CameraView.launchScanner({ barcodeTypes: ['qr'] });
    } catch {
      sub.remove();
      Alert.alert('Сканер не открылся', 'Вставьте приглашение текстом в поле ниже.');
    }
  };

  return (
    <Screen
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      <View style={styles.section}>
        <Label>Ваше имя</Label>
        <Field
          value={name}
          onChangeText={setName}
          placeholder="Как вас показывать в группе"
          maxLength={NAME_MAX}
          returnKeyType="done"
          autoCapitalize="words"
        />
      </View>

      <View style={styles.section}>
        <Label>Если создатель группы рядом</Label>
        <Button title="Сканировать QR-код" icon={ScanLine} onPress={scan} disabled={busy} />
        <Text style={[styles.note, { color: t.sub }]}>
          Создатель открывает у себя «Друзья» → «Пригласить в группу» и показывает код.
        </Text>
      </View>

      <View style={styles.section}>
        <Label>Если приглашение прислали сообщением</Label>
        <Field
          value={code}
          onChangeText={setCode}
          placeholder="Вставьте сюда сообщение с приглашением"
          autoCapitalize="none"
          multiline
        />
        <Button
          title="Войти в группу"
          kind="secondary"
          icon={Users}
          onPress={() => confirm(code)}
          disabled={busy || code.trim().length === 0}
        />
      </View>

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={t.sub} />
          <Text style={[styles.text, { color: t.sub }]}>Вхожу в группу…</Text>
        </View>
      ) : null}

      <Card style={styles.pad}>
        <Text style={[styles.text, { color: t.sub }]}>
          Войдя в группу, вы соглашаетесь, что её участники видят ваше место, пока у вас идёт запись катания. Это
          выключается во вкладке «Друзья» и в настройках.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.m, paddingTop: space.s, paddingBottom: space.xl, gap: space.l },
  section: { gap: space.s },
  pad: { padding: space.m },
  text: { fontSize: 14, lineHeight: 20 },
  note: { fontSize: 13, lineHeight: 18 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
