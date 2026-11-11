import createQr from 'qrcode-generator';
import { useState } from 'react';
import { Alert, Share as ShareSheet, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { QrCode, Share } from '@/components/icons';
import { Button, Card, Plain, Screen } from '@/components/ui';
import { errorText } from '@/lib/friends/api';
import { currentInvite, renewInvite, useFriends } from '@/lib/friends/store';
import { space, useTheme } from '@/theme';

/** Рисунок QR-кода одной линией: по квадратику на каждую тёмную клетку. */
function qrPath(text: string): { path: string; size: number } {
  const qr = createQr(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
    }
  }
  return { path, size };
}

/** Приглашение в группу: QR-код и ссылка. Только для создателя группы. */
export default function InviteScreen() {
  const t = useTheme();
  // Перечитываем приглашение, когда группа меняется (например, после смены приглашения)
  useFriends();
  const link = currentInvite();
  const [busy, setBusy] = useState(false);

  if (!link) {
    return (
      <Plain style={styles.center}>
        <Text style={[styles.text, { color: t.sub }]}>Приглашать может только создатель группы.</Text>
      </Plain>
    );
  }

  const { path, size } = qrPath(link);
  // Вокруг кода нужно светлое поле в четыре клетки, иначе камеры читают его хуже
  const box = size + 8;

  const send = () => {
    ShareSheet.share({
      message:
        'Приглашение в группу Snowwy. Скопируйте это сообщение целиком и вставьте в Snowwy: «Друзья» → «Войти по приглашению».\n\n' +
        link,
    }).catch(() => {});
  };

  const renew = () => {
    Alert.alert(
      'Сменить приглашение?',
      'Прежние QR-код и ссылка перестанут действовать. Те, кто уже в группе, останутся в ней.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сменить',
          onPress: async () => {
            setBusy(true);
            try {
              await renewInvite();
            } catch (e) {
              Alert.alert('Не получилось', errorText(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <Card style={styles.qrCard}>
        <View style={styles.qr}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${box} ${box}`}>
            <Rect x={0} y={0} width={box} height={box} fill="#FFFFFF" />
            <Path d={path} fill="#000000" transform={`translate(4 4)`} />
          </Svg>
        </View>
      </Card>

      <Text style={[styles.text, { color: t.sub }]}>
        Знакомый открывает у себя Snowwy → «Друзья» → «Войти по приглашению» → «Сканировать QR-код» и наводит камеру на
        этот код. Если вы не рядом — отправьте приглашение сообщением.
      </Text>

      <View style={styles.section}>
        <Button title="Отправить приглашение" icon={Share} onPress={send} />
        <Button title="Сменить приглашение" kind="secondary" icon={QrCode} onPress={renew} disabled={busy} />
      </View>

      <Text style={[styles.note, { color: t.sub }]}>
        Приглашение — это ключ от группы: любой, кто его получил, может войти и видеть участников. Если оно попало не
        туда, смените его и исключите лишних во вкладке «Друзья».
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: space.l },
  content: { paddingHorizontal: space.m, paddingTop: space.s, paddingBottom: space.xl, gap: space.l },
  section: { gap: space.s },
  qrCard: { padding: space.m, alignItems: 'center' },
  qr: { width: '100%', maxWidth: 320, aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  text: { fontSize: 14, lineHeight: 20 },
  note: { fontSize: 13, lineHeight: 18 },
});
