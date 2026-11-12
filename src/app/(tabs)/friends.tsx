import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field } from '@/components/field';
import { Prompt } from '@/components/prompt';
import { Battery } from '@/components/battery';
import { FriendCard } from '@/components/friend-card';
import { Flag, LogOut, MapPin, Pencil, QrCode, ScanLine, Trash, UserMinus, Users } from '@/components/icons';
import { TrackMap, type MapPin as Pin } from '@/components/track-map';
import { Button, Card, ICON_STROKE, Label, Screen, switchThumb, Title } from '@/components/ui';
import { ApiError, errorText } from '@/lib/friends/api';
import { upgradeServer, useAccount } from '@/lib/friends/cloudflare';
import { ago } from '@/lib/friends/codec';
import {
  cancelMeet,
  clearFriendsNotice,
  createGroup,
  getFriends,
  kickMember,
  leaveGroup,
  NAME_MAX,
  refreshFriends,
  setFriendName,
  setSharing,
  SYNC_EVERY,
  useFriends,
  type Member,
} from '@/lib/friends/store';
import { inTime, plural, time } from '@/lib/format';
import { ensureNotifyPermission } from '@/lib/notify';
import { relative, relativeShort, useMySpot } from '@/lib/relative';
import { useProfileImages } from '@/lib/profile';
import { useSettings } from '@/lib/settings';
import { useTracker } from '@/lib/tracker';
import { space, useTheme } from '@/theme';

/** Цвета людей на карте: различимы между собой и на светлой, и на тёмной карте */
const COLORS = ['#F0872E', '#3F97F0', '#3FA672', '#C2459B', '#7A5AF0', '#D9A520', '#2EB8C4', '#CC3A2E'];
/** Место не обновлялось дольше этого — у человека пропала связь, мс */
const STALE = 3 * 60 * 1000;

const peopleWord = (n: number) => plural(n, 'человек', 'человека', 'человек');

/** Первая буква имени для метки на карте. */
const letter = (name: string) => (Array.from(name.trim())[0] ?? '?').toUpperCase();

function status(m: Member, age: number): string {
  if (!m.pos) return 'не на склоне';
  if (age > STALE) return 'нет связи';
  if (m.pos.s === 'pause') return 'на паузе';
  if (m.pos.st === 'lift') return 'на подъёмнике';
  if (m.pos.st === 'run') return 'на спуске';
  return 'катается';
}

/** Встреча ещё актуальна: показываем её час после назначенного времени */
const MEET_SHOWN = 60 * 60 * 1000;

export default function FriendsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const friends = useFriends();
  const account = useAccount();
  const settings = useSettings();
  const tracker = useTracker();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState(friends.name);
  const [focus, setFocus] = useState<{ coord: Pin['coord']; n: number } | null>(null);
  const triedAt = useRef(0);
  const [renaming, setRenaming] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);

  const { group, members } = friends;
  const inGroup = group != null;
  const me = useMySpot(inGroup);
  const myImages = useProfileImages();

  // Пока вкладка открыта, список обновляется раз в полминуты, а «20 с назад» — каждые 5 секунд
  useFocusEffect(
    useCallback(() => {
      if (!inGroup) return;
      const tick = () => {
        const at = Date.now();
        setNow(at);
        // Во время записи список и так обновляется вместе с отправкой своей точки
        if (at - Math.max(getFriends().syncedAt, triedAt.current) >= SYNC_EVERY - 2000) {
          triedAt.current = at;
          refreshFriends();
        }
      };
      triedAt.current = 0;
      tick();
      const timer = setInterval(tick, 5000);
      // Без разрешения на уведомления не придут напоминания о встречах
      ensureNotifyPermission();
      // Создатель группы обновляет её сервер, если в приложении более новая версия
      if (getFriends().group?.admin) {
        upgradeServer().then((fresh) => {
          if (fresh && getFriends().serverVersion < 2) refreshFriends();
        });
      }
      return () => clearInterval(timer);
    }, [inGroup])
  );

  const create = async () => {
    const name = draft.trim();
    if (!name) {
      Alert.alert('Укажите имя', 'Под этим именем вас увидят остальные в группе.');
      return;
    }
    await setFriendName(name);
    if (!account.server) {
      router.push('/friends/account?next=create');
      return;
    }
    setBusy('Создаю группу…');
    try {
      await createGroup(setBusy);
    } catch (e) {
      Alert.alert(
        'Не получилось',
        e instanceof ApiError && e.code === 'network'
          ? 'Сервер группы не отвечает. Если вы только что подключили аккаунт Cloudflare, подождите несколько минут: новый адрес начинает работать не сразу. Иначе проверьте интернет и VPN.'
          : errorText(e)
      );
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    await setFriendName(draft);
    router.push('/friends/join');
  };

  const applyName = (text: string) => {
    if (!text.trim()) return;
    setDraft(text.trim().slice(0, NAME_MAX));
    setFriendName(text).catch(() => {});
  };

  const rename = () => {
    // Системный вопрос с полем ввода есть только на iPhone
    if (Platform.OS !== 'ios') return setRenaming(true);
    Alert.prompt('Ваше имя', 'Под этим именем вас видят остальные в группе.', applyName, 'plain-text', friends.name);
  };

  const kick = (m: Member) => {
    Alert.alert(
      `Исключить «${m.name}»?`,
      'Человек перестанет видеть группу. Приглашение сменится, чтобы он не вошёл снова: прежние QR-код и ссылка перестанут действовать.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Исключить',
          style: 'destructive',
          onPress: () => kickMember(m.id).catch((e) => Alert.alert('Не получилось', errorText(e))),
        },
      ]
    );
  };

  const leave = () => {
    const admin = group?.admin != null;
    Alert.alert(
      admin ? 'Удалить группу?' : 'Выйти из группы?',
      admin
        ? 'Группа исчезнет у всех участников. Чтобы кататься вместе снова, придётся создать новую и заново всех пригласить.'
        : 'Вы перестанете видеть остальных, а они — вас. Вернуться можно по новому приглашению.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: admin ? 'Удалить' : 'Выйти',
          style: 'destructive',
          onPress: () => leaveGroup().catch((e) => Alert.alert('Не получилось', errorText(e))),
        },
      ]
    );
  };

  if (!inGroup) {
    return (
      <Screen
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <Title>Друзья</Title>

        {friends.notice ? (
          <Card style={styles.notice}>
            <Text style={[styles.text, styles.flex, { color: t.text }]}>{friends.notice}</Text>
            <Pressable onPress={clearFriendsNotice} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.link, { color: t.text }]}>Понятно</Text>
            </Pressable>
          </Card>
        ) : null}

        <Card style={styles.pad}>
          <View style={styles.rowHead}>
            <MapPin size={18} color={t.text} strokeWidth={ICON_STROKE} />
            <Text style={[styles.rowTitle, { color: t.text }]}>Видеть друг друга на склоне</Text>
          </View>
          <Text style={[styles.text, { color: t.sub }]}>
            Создайте группу или войдите по приглашению. Пока у вас идёт запись катания, остальные видят вас на карте;
            место обновляется раз в 30 секунд. Вне записи вас не видно.
          </Text>
        </Card>

        <View style={styles.section}>
          <Label>Ваше имя</Label>
          <Field
            value={draft}
            onChangeText={setDraft}
            onEndEditing={() => setFriendName(draft).catch(() => {})}
            placeholder="Как вас показывать в группе"
            maxLength={NAME_MAX}
            returnKeyType="done"
            autoCapitalize="words"
          />
        </View>

        <View style={styles.section}>
          <Button title="Создать группу" icon={Users} onPress={create} disabled={busy != null} />
          <Button title="Войти по приглашению" kind="secondary" icon={ScanLine} onPress={join} disabled={busy != null} />
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={t.sub} />
              <Text style={[styles.text, { color: t.sub }]}>{busy}</Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.note, { color: t.sub }]}>
          Группа работает на сервере её создателя — в его бесплатном аккаунте Cloudflare
          {account.server ? ' (у вас он уже подключён)' : ''}. Остальным участникам аккаунт не нужен. Имена и места
          шифруются на телефоне ключом группы: сервер хранит их, но прочитать не может.
        </Text>
      </Screen>
    );
  }

  const serverNow = now + friends.skew;
  const rows = members.map((m, i) => {
    const age = m.at > 0 ? Math.max(0, serverNow - m.at) : 0;
    return { m, age, color: COLORS[i % COLORS.length] };
  });
  const pins: Pin[] = rows
    .filter((r) => r.m.pos)
    .map((r) => ({
      id: r.m.id,
      coord: { latitude: r.m.pos!.lat, longitude: r.m.pos!.lon },
      color: r.color,
      letter: letter(r.m.name),
      dim: r.age > STALE,
    }));

  const showOnMap = (m: Member) => {
    if (!m.pos) return;
    setFocus((f) => ({ coord: { latitude: m.pos!.lat, longitude: m.pos!.lon }, n: (f?.n ?? 0) + 1 }));
  };
  const whereIs = (m: Member) =>
    me && m.pos && !m.me ? relative(me, { lat: m.pos.lat, lon: m.pos.lon, alt: m.pos.alt }) : null;

  const meet = friends.meet && friends.meet.at > serverNow - MEET_SHOWN ? friends.meet : null;
  const canCancel = meet != null && (meet.mine || group.admin != null);
  const dropMeet = () => {
    Alert.alert('Отменить встречу?', 'Точка встречи исчезнет у всех в группе.', [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Отменить встречу',
        style: 'destructive',
        onPress: () => cancelMeet().catch((e) => Alert.alert('Не получилось', errorText(e))),
      },
    ]);
  };
  const openedRow = rows.find((r) => r.m.id === opened) ?? null;

  const sharing = settings.friends;
  const mine = !sharing
    ? 'Группа вас не видит.'
    : !tracker.recording
      ? 'Вы появитесь на карте, когда начнёте запись катания.'
      : tracker.paused
        ? 'Запись на паузе: группа видит место, где вы остановились.'
        : 'Группа видит вас. Место обновляется раз в 30 секунд.';

  return (
    <Screen contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l }]}>
      <Title>Друзья</Title>

      <View>
        <TrackMap
          lines={[]}
          pins={pins}
          focus={focus}
          meet={meet ? { latitude: meet.lat, longitude: meet.lon } : null}
          style={styles.map}
        />
        {pins.length === 0 ? (
          <View style={styles.empty} pointerEvents="none">
            <Card style={styles.emptyCard}>
              <Text style={[styles.text, { color: t.text }]}>
                {friends.syncedAt === 0 && !friends.error ? 'Загружаю…' : 'Сейчас никто из группы не катается'}
              </Text>
            </Card>
          </View>
        ) : null}
      </View>

      {friends.error ? <Text style={[styles.note, { color: t.danger }]}>{friends.error}</Text> : null}

      <View style={styles.section}>
        {meet ? (
          <Card style={styles.pad}>
            <View style={styles.rowHead}>
              <Flag size={18} color={t.text} strokeWidth={ICON_STROKE} />
              <Text style={[styles.rowTitle, { color: t.text }]}>
                Встреча в {time(meet.at)} · {meet.at > serverNow ? inTime(meet.at - serverNow) : 'уже прошла'}
              </Text>
            </View>
            <Text style={[styles.text, { color: t.text }]}>{meet.text}</Text>
            <Text style={[styles.note, { color: t.sub }]}>
              Назначено: {meet.mine ? 'вы' : meet.byName}
              {me ? ` · ${relativeShort(relative(me, { lat: meet.lat, lon: meet.lon }))}` : ''}
            </Text>
            <View style={styles.meetActions}>
              <Pressable
                onPress={() => setFocus((f) => ({ coord: { latitude: meet.lat, longitude: meet.lon }, n: (f?.n ?? 0) + 1 }))}
                hitSlop={8}
                accessibilityRole="button">
                <Text style={[styles.link, { color: t.text }]}>Показать на карте</Text>
              </Pressable>
              {canCancel ? (
                <Pressable onPress={dropMeet} hitSlop={8} accessibilityRole="button">
                  <Text style={[styles.link, { color: t.danger }]}>Отменить</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        ) : null}
        <Button
          title={meet ? 'Назначить другую встречу' : 'Назначить встречу'}
          kind="secondary"
          icon={Flag}
          onPress={() => router.push('/friends/meet')}
        />
      </View>

      <Card style={styles.switchRow}>
        <View style={styles.switchBody}>
          <Text style={[styles.rowTitle, { color: t.text }]}>Показывать меня</Text>
          <Text style={[styles.text, { color: t.sub }]}>{mine}</Text>
        </View>
        <Switch
          value={sharing}
          onValueChange={setSharing}
          trackColor={{ true: t.accent, false: t.line }}
          thumbColor={switchThumb(t, sharing)}
        />
      </Card>

      <View style={styles.section}>
        <Label icon={Users}>
          {members.length > 0 ? `В группе ${members.length} ${peopleWord(members.length)}` : 'Группа'}
        </Label>
        {rows.map(({ m, age, color }) => {
          const where = whereIs(m);
          const bat = m.info?.bat;
          return (
          <Pressable
            key={m.id}
            onPress={() => setOpened(m.id)}
            accessibilityRole="button"
            accessibilityLabel={`${m.name}, ${status(m, age)}. Открыть карточку`}
            style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Card style={styles.member}>
              <Pressable
                onPress={() => showOnMap(m)}
                disabled={!m.pos}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Показать ${m.name} на карте`}
                style={({ pressed }) => [
                  styles.onMap,
                  { borderColor: t.line, opacity: m.pos ? (pressed ? 0.5 : 1) : 0.3 },
                ]}>
                <MapPin size={18} color={t.text} strokeWidth={ICON_STROKE} />
              </Pressable>
              <View style={[styles.avatar, { backgroundColor: color, opacity: m.pos && age <= STALE ? 1 : 0.45 }]}>
                {(m.me ? myImages.avatar : friends.pics[m.id]?.avatar) ? (
                  <Image
                    source={{ uri: m.me ? myImages.avatar : friends.pics[m.id]?.avatar }}
                    style={styles.avatarImage}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={styles.avatarText}>{letter(m.name)}</Text>
                )}
              </View>
              <View style={styles.memberBody}>
                <Text style={[styles.memberName, { color: t.text }]} numberOfLines={1}>
                  {m.name}
                  {m.me ? <Text style={{ color: t.sub }}> · вы</Text> : null}
                </Text>
                <Text style={[styles.memberSub, { color: t.sub }]} numberOfLines={1}>
                  {m.owner ? 'создатель · ' : ''}
                  {status(m, age)}
                </Text>
                {where ? (
                  <Text style={[styles.memberSub, { color: t.text }]} numberOfLines={1}>
                    {relativeShort(where)}
                  </Text>
                ) : null}
              </View>
              <View style={styles.side}>
                <Text style={[styles.age, { color: t.sub }]}>{m.at > 0 ? ago(age) : '—'}</Text>
                {bat != null ? (
                  <Battery level={bat} charging={m.info?.chg} height={16} />
                ) : null}
              </View>
              {group.admin && !m.me ? (
                <Pressable
                  onPress={() => kick(m)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Исключить ${m.name}`}
                  style={({ pressed }) => [styles.kick, pressed && { opacity: 0.5 }]}>
                  <UserMinus size={20} color={t.danger} strokeWidth={ICON_STROKE} />
                </Pressable>
              ) : null}
            </Card>
          </Pressable>
          );
        })}
        <Text style={[styles.note, { color: t.sub }]}>
          Нажмите на человека — откроется его карточка с итогами дня и рекордами. Значок слева показывает его на карте.
          Справа — сколько прошло с последнего обновления места и заряд телефона.
        </Text>
      </View>

      <View style={styles.section}>
        {group.admin ? (
          <Button title="Пригласить в группу" icon={QrCode} onPress={() => router.push('/friends/invite')} />
        ) : null}
        <Button title="Изменить моё имя" kind="secondary" icon={Pencil} onPress={rename} />
        <Button
          title={group.admin ? 'Удалить группу' : 'Выйти из группы'}
          kind="danger"
          icon={group.admin ? Trash : LogOut}
          onPress={leave}
        />
      </View>
      {openedRow ? (
        <FriendCard
          member={openedRow.m}
          color={openedRow.color}
          status={status(openedRow.m, openedRow.age)}
          age={openedRow.age}
          where={whereIs(openedRow.m)}
          onShowOnMap={openedRow.m.pos ? () => showOnMap(openedRow.m) : null}
          onClose={() => setOpened(null)}
          now={now}
          avatar={openedRow.m.me ? myImages.avatar : (friends.pics[openedRow.m.id]?.avatar ?? '')}
          banner={openedRow.m.me ? myImages.banner : (friends.pics[openedRow.m.id]?.banner ?? '')}
        />
      ) : null}
      <Prompt
        visible={renaming}
        title="Ваше имя"
        message="Под этим именем вас видят остальные в группе."
        initial={friends.name}
        maxLength={NAME_MAX}
        onSubmit={applyName}
        onClose={() => setRenaming(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.m, paddingBottom: 120, gap: space.l },
  section: { gap: space.s },
  flex: { flex: 1 },
  pad: { padding: space.m, gap: 6 },
  notice: { flexDirection: 'row', alignItems: 'center', padding: space.m, gap: space.m },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 17, fontWeight: '600' },
  text: { fontSize: 14, lineHeight: 20 },
  link: { fontSize: 15, fontWeight: '600' },
  note: { fontSize: 13, lineHeight: 18 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  map: { height: 320 },
  empty: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { paddingHorizontal: space.m, paddingVertical: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', padding: space.m, gap: space.m },
  switchBody: { flex: 1, gap: 4 },
  member: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 40, height: 40 },
  avatarText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  memberBody: { flex: 1, gap: 2 },
  memberName: { fontSize: 16, fontWeight: '600' },
  memberSub: { fontSize: 13 },
  age: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  kick: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  onMap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  side: { alignItems: 'flex-end', gap: 2 },
  meetActions: { flexDirection: 'row', gap: space.l, marginTop: 4 },
});
