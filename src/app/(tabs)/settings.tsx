import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ArchiveRestore,
  BatteryCharging,
  Bell,
  Cloud,
  DatabaseBackup,
  FlaskConical,
  FolderOpen,
  RefreshCw,
  Headphones,
  Leaf,
  MonitorSmartphone,
  Moon,
  Layers,
  LogOut,
  Share,
  Smartphone,
  Sun,
  Trash,
  Trophy,
  Users,
  type IconType,
} from '@/components/icons';
import { Button, Card, ICON_STROKE, Label, Screen, Segments, switchThumb, Title } from '@/components/ui';
import { analyze } from '@/lib/analyze';
import { autoBackup, chooseBackupFolder, removeAutoBackup, restoreBackup, shareBackup } from '@/lib/backup';
import { createSession, deleteEverything, finishSession, insertPoints, setPistes } from '@/lib/db';
import { generateDemoTrack } from '@/lib/demo';
import { dateLong, daysWord } from '@/lib/format';
import { disconnectAccount, useAccount } from '@/lib/friends/cloudflare';
import { pushFriendInfo, setSharing, useFriends } from '@/lib/friends/store';
import { askBackground, openBackgroundSettings, powerAvailable, useBackgroundAllowed, vendorGuide } from '@/lib/power';
import { updateSettings, useSettings, type GlassLevel, type ThemeMode } from '@/lib/settings';
import { updatesAvailable, useUpdate } from '@/lib/update';
import { useTracker } from '@/lib/tracker';
import { headphonesConnected, russianVoiceInstalled, say, sayForDebug, voiceAvailable } from '@/lib/voice';
import { PALETTES, space, swatches, useTheme } from '@/theme';

const ANDROID = Platform.OS === 'android';

const THEMES: { value: ThemeMode; title: string; icon: IconType }[] = [
  { value: 'system', title: 'Системная', icon: MonitorSmartphone },
  { value: 'light', title: 'Светлая', icon: Sun },
  { value: 'dark', title: 'Тёмная', icon: Moon },
];

// Как в настройках iPhone («Прозрачное» и «Тонированное»), плюс вариант совсем без стекла
const GLASS: { value: GlassLevel; title: string }[] = [
  { value: 'solid', title: 'Без стекла' },
  { value: 'tinted', title: 'Тонированное' },
  { value: 'clear', title: 'Прозрачное' },
];

export default function SettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const { recording } = useTracker();
  const router = useRouter();
  const account = useAccount();
  const friends = useFriends();
  const [busy, setBusy] = useState(false);
  const backgroundOk = useBackgroundAllowed();
  const update = useUpdate();
  const guide = vendorGuide();

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
      const analysis = analyze(points);
      await finishSession(id, points[points.length - 1].t, analysis.totals);
      const demoPistes = [
        { name: 'Каскад', difficulty: 'intermediate' },
        { name: 'Горизонт', difficulty: 'easy' },
        { name: 'Вираж', difficulty: 'advanced' },
      ];
      await setPistes(
        id,
        analysis.segments
          .filter((s) => s.kind === 'run')
          .map((run, i) => ({
            t: run.startedAt,
            ...demoPistes[i % demoPistes.length],
            duration: run.duration,
            distance: run.distance,
            vertical: run.vertical,
            maxSpeed: run.maxSpeed,
            avgSpeed: run.avgSpeed,
          }))
      );
      Alert.alert('Готово', 'Демо-катание добавлено. Оно появилось во вкладке «История».');
    } catch {
      Alert.alert('Не получилось', 'Не удалось добавить демо-катание. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const toggleBackup = async (backup: boolean) => {
    // На Android копия кладётся в папку, которую выбирает человек
    if (backup && ANDROID && !settings.backupDir && !(await chooseBackupFolder())) return;
    updateSettings({ backup });
    if (backup) autoBackup();
    else removeAutoBackup();
  };

  const changeFolder = async () => {
    if (!(await chooseBackupFolder())) return;
    const ok = await autoBackup();
    Alert.alert(
      ok ? 'Готово' : 'Не получилось',
      ok ? 'Копия сохранена в новую папку.' : 'В эту папку записать не удалось. Выберите другую.'
    );
  };

  const saveCopy = async () => {
    setBusy(true);
    try {
      await shareBackup();
    } catch {
      Alert.alert('Не получилось', 'Не удалось подготовить копию. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const result = await restoreBackup();
      if (!result) return;
      const { added, skipped } = result;
      Alert.alert(
        added > 0 ? 'Готово' : 'Новых записей нет',
        added > 0
          ? `Добавлено: ${added} ${daysWord(added)} катания.${skipped > 0 ? ` Уже были в истории: ${skipped}.` : ''}`
          : 'Все дни из этой копии уже есть в истории.'
      );
    } catch {
      Alert.alert('Не получилось', 'Этот файл не похож на копию Snowwy или повреждён.');
    } finally {
      setBusy(false);
    }
  };

  const testVoice = async () => {
    const phrase = 'Спуск 3. Максимальная скорость 54 километра в час. Перепад 420 метров.';
    if (!russianVoiceInstalled()) {
      Alert.alert(
        'Нет русского голоса',
        ANDROID
          ? 'В телефоне не установлен голос для русского языка. Настройки телефона → Специальные возможности → Синтез речи (или «Преобразование текста в речь») → настройки движка → установите русский голос.'
          : 'В iPhone не установлен голос для русского языка: Настройки → Универсальный доступ → Устный контент → Голоса → Русский.'
      );
      return;
    }
    // Отладочная сборка на эмуляторе: наушников нет, проверяем голос через динамик
    if (__DEV__ && !headphonesConnected() && (await sayForDebug(phrase))) return;
    if (!headphonesConnected()) {
      Alert.alert('Наушники не подключены', 'Ассистент говорит только в наушниках. Подключите их и попробуйте ещё раз.');
      return;
    }
    await say(phrase);
  };

  const wipe = () => {
    Alert.alert('Удалить все записи?', 'Вся история катания будет удалена с этого телефона. Вернуть её нельзя.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить всё', style: 'destructive', onPress: () => deleteEverything().catch(() => {}) },
    ]);
  };

  return (
    <Screen contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l }]}>
      <Title>Настройки</Title>

      <View style={styles.section}>
        <Label>Тема</Label>
        <Segments options={THEMES} value={settings.theme} onChange={(theme) => updateSettings({ theme })} />
      </View>

      <View style={styles.section}>
        <Label icon={Layers}>Стекло</Label>
        <Segments options={GLASS} value={settings.glass} onChange={(glass) => updateSettings({ glass })} />
        <Text style={[styles.rowSub, { color: t.sub }]}>
          Насколько прозрачны плитки и кнопки. «Тонированное» читается лучше на ярком солнце, «Прозрачное» сильнее
          пропускает фон, «Без стекла» — плотные плитки.
        </Text>
      </View>

      <View style={styles.section}>
        <Label>Цвета</Label>
        <View style={styles.palettes}>
          {PALETTES.map((p) => {
            const active = settings.palette === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => updateSettings({ palette: p.id })}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Расцветка «${p.title}»`}
                style={({ pressed }) => [styles.palette, pressed && { opacity: 0.6 }]}>
                <Card style={[styles.paletteTile, active && { borderWidth: 2, borderColor: t.accent }]}>
                  <View style={styles.swatches}>
                    {swatches(p.id).map((color, i) => (
                      <View key={i} style={[styles.swatch, { backgroundColor: color }]} />
                    ))}
                  </View>
                  <Text style={[styles.paletteTitle, { color: t.text }]} numberOfLines={1}>
                    {p.title}
                  </Text>
                </Card>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.rowSub, { color: t.sub }]}>
          Расцветка меняет и светлую, и тёмную тему. Спуски всегда оранжевые, подъёмники синие. Иконка приложения и
          заставка при запуске остаются синими{ANDROID ? '' : ', окно на экране блокировки — чёрным'}.
        </Text>
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
              Экран остаётся включённым, пока идёт запись и приложение открыто. Это главный расход заряда: если
              батареи не хватает на день, выключите. Применится после следующего старта или паузы.
            </Text>
          </View>
          <Switch
            value={settings.keepAwake}
            onValueChange={(keepAwake) => updateSettings({ keepAwake })}
            trackColor={{ true: t.accent, false: t.line }}
            thumbColor={switchThumb(t, settings.keepAwake)}
          />
        </Card>
        <Card style={styles.switchRow}>
          <View style={styles.switchBody}>
            <View style={styles.rowHead}>
              <Bell size={18} color={t.text} strokeWidth={ICON_STROKE} />
              <Text style={[styles.rowTitle, { color: t.text }]}>Напоминать о записи</Text>
            </View>
            <Text style={[styles.rowSub, { color: t.sub }]}>
              Если полчаса оставаться на одном месте, придёт уведомление; через два часа запись завершится сама и
              сохранится. О записи, оставленной на паузе, напомним через час.
            </Text>
          </View>
          <Switch
            value={settings.remind}
            onValueChange={(remind) => updateSettings({ remind })}
            trackColor={{ true: t.accent, false: t.line }}
            thumbColor={switchThumb(t, settings.remind)}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <Label>Во время катания</Label>
        <Card style={styles.switchRow}>
          <View style={styles.switchBody}>
            <View style={styles.rowHead}>
              <Headphones size={18} color={t.text} strokeWidth={ICON_STROKE} />
              <Text style={[styles.rowTitle, { color: t.text }]}>Ассистент</Text>
            </View>
            <Text style={[styles.rowSub, { color: t.sub }]}>
              Голосом сообщает главное: после спуска — его номер, максимальную скорость и перепад; после подъёма —
              высоту; при завершении — итог дня. Говорит только в наушниках (Bluetooth-колонку телефон тоже считает
              наушниками), музыка на это время становится тише.
            </Text>
          </View>
          <Switch
            value={settings.voice}
            onValueChange={(voice) => updateSettings({ voice })}
            trackColor={{ true: t.accent, false: t.line }}
            thumbColor={switchThumb(t, settings.voice)}
          />
        </Card>
        {voiceAvailable && settings.voice ? (
          <Button title="Проверить ассистента" kind="secondary" icon={Headphones} onPress={testVoice} />
        ) : null}
        <Card style={styles.switchRow}>
          <View style={styles.switchBody}>
            <View style={styles.rowHead}>
              <Leaf size={18} color={t.text} strokeWidth={ICON_STROKE} />
              <Text style={[styles.rowTitle, { color: t.text }]}>Экономия заряда</Text>
            </View>
            <Text style={[styles.rowSub, { color: t.sub }]}>
              При заблокированном экране точки GPS обрабатываются пачками раз в 10 секунд. Сами точки пишутся все, как
              обычно, поэтому спуски считаются так же точно;{' '}
              {ANDROID ? 'уведомление о ходе катания и ассистент' : 'окно на экране блокировки, островок и ассистент'}{' '}
              запаздывают на несколько секунд. Применится после следующего старта или паузы.
            </Text>
          </View>
          <Switch
            value={settings.economy}
            onValueChange={(economy) => updateSettings({ economy })}
            trackColor={{ true: t.accent, false: t.line }}
            thumbColor={switchThumb(t, settings.economy)}
          />
        </Card>
      </View>

      {powerAvailable ? (
        <View style={styles.section}>
          <Label>Работа в фоне</Label>
          <Card style={styles.account}>
            <View style={styles.rowHead}>
              <BatteryCharging size={18} color={t.text} strokeWidth={ICON_STROKE} />
              <Text style={[styles.rowTitle, { color: t.text }]}>
                {backgroundOk ? 'Ограничение Android снято' : 'Android может закрыть Snowwy'}
              </Text>
            </View>
            <Text style={[styles.rowSub, { color: t.sub }]}>
              {backgroundOk
                ? 'Система не будет останавливать запись ради экономии батареи.'
                : 'Ради экономии батареи система может остановить запись, пока телефон лежит в кармане. Разрешите Snowwy работать в фоне без ограничений.'}{' '}
              На многих телефонах этого мало: у производителя есть ещё и своя защита, она выключается вручную.
            </Text>
            <Text style={[styles.rowSub, styles.guideHead, { color: t.text }]}>{guide.brand}</Text>
            {guide.steps.map((step, i) => (
              <Text key={i} style={[styles.rowSub, { color: t.sub }]}>
                {i + 1}. {step}
              </Text>
            ))}
            <Text style={[styles.rowSub, { color: t.sub }]}>
              Названия пунктов зависят от версии системы и могут немного отличаться.
            </Text>
          </Card>
          {backgroundOk ? null : (
            <Button title="Разрешить работу в фоне" icon={BatteryCharging} onPress={() => askBackground()} />
          )}
          <Button
            title="Открыть настройки автозапуска"
            kind="secondary"
            icon={Smartphone}
            onPress={openBackgroundSettings}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Label>Друзья</Label>
        <Card style={styles.switchRow}>
          <View style={styles.switchBody}>
            <View style={styles.rowHead}>
              <Users size={18} color={t.text} strokeWidth={ICON_STROKE} />
              <Text style={[styles.rowTitle, { color: t.text }]}>Показывать меня группе</Text>
            </View>
            <Text style={[styles.rowSub, { color: t.sub }]}>
              Пока идёт запись катания, участники вашей группы видят вас на карте; место обновляется раз в 30 секунд.
              Вне записи и при выключенном переключателе ваше место никуда не отправляется.
              {friends.group ? '' : ' Сейчас вы не состоите в группе — она создаётся во вкладке «Друзья».'}
            </Text>
          </View>
          <Switch
            value={settings.friends}
            onValueChange={setSharing}
            trackColor={{ true: t.accent, false: t.line }}
            thumbColor={switchThumb(t, settings.friends)}
          />
        </Card>
        <Card style={styles.switchRow}>
          <View style={styles.switchBody}>
            <View style={styles.rowHead}>
              <Trophy size={18} color={t.text} strokeWidth={ICON_STROKE} />
              <Text style={[styles.rowTitle, { color: t.text }]}>Итоги и заряд в карточке</Text>
            </View>
            <Text style={[styles.rowSub, { color: t.sub }]}>
              Участники группы видят в вашей карточке итоги сегодняшнего катания, личные рекорды и заряд телефона.
              Сводка обновляется раз в пару минут и шифруется так же, как место.
            </Text>
          </View>
          <Switch
            value={settings.friendsStats}
            onValueChange={(friendsStats) => {
              updateSettings({ friendsStats });
              pushFriendInfo().catch(() => {});
            }}
            trackColor={{ true: t.accent, false: t.line }}
            thumbColor={switchThumb(t, settings.friendsStats)}
          />
        </Card>
        <Card style={styles.account}>
          <View style={styles.rowHead}>
            <Cloud size={18} color={t.text} strokeWidth={ICON_STROKE} />
            <Text style={[styles.rowTitle, { color: t.text }]}>Аккаунт Cloudflare</Text>
          </View>
          <Text style={[styles.rowSub, { color: t.sub }]}>
            {account.connected
              ? `Подключён: ${account.accountName ?? 'Cloudflare'}. В нём работает сервер ваших групп.`
              : account.server
                ? 'Вы вышли из аккаунта. Сервер и группа продолжают работать; чтобы создать новую группу, подключите аккаунт снова.'
                : 'Не подключён. Аккаунт нужен только тому, кто создаёт группу: в нём работает её сервер. Чтобы войти в чужую группу, он не нужен.'}
          </Text>
        </Card>
        {account.connected ? (
          <>
            <Button title="Выйти из аккаунта" kind="secondary" icon={LogOut} onPress={signOut} />
            <Button
              title="Сервер и ключ доступа"
              kind="secondary"
              icon={Cloud}
              onPress={() => router.push('/friends/account')}
            />
          </>
        ) : (
          <Button
            title="Подключить аккаунт Cloudflare"
            kind="secondary"
            icon={Cloud}
            onPress={() => router.push('/friends/account')}
          />
        )}
      </View>

      <View style={styles.section}>
        <Label>Резервная копия</Label>
        <Card style={styles.switchRow}>
          <View style={styles.switchBody}>
            <View style={styles.rowHead}>
              <DatabaseBackup size={18} color={t.text} strokeWidth={ICON_STROKE} />
              <Text style={[styles.rowTitle, { color: t.text }]}>Копия после катания</Text>
            </View>
            <Text style={[styles.rowSub, { color: t.sub }]}>
              {ANDROID
                ? 'После каждого катания обновляется файл Snowwy-backup.db со всеми записями в папке, которую вы выберете, — например, в «Документах». Он остаётся в телефоне, даже если удалить приложение. Потерять его можно вместе с телефоном, поэтому время от времени сохраняйте копию в другое место кнопкой ниже.'
                : 'После каждого катания обновляется файл со всеми записями: «Файлы» → «На iPhone» → Snowwy → Snowwy-backup.db. Если удалить приложение, файл пропадёт вместе с ним — время от времени сохраняйте копию в другое место кнопкой ниже.'}
            </Text>
          </View>
          <Switch
            value={settings.backup === true}
            onValueChange={toggleBackup}
            trackColor={{ true: t.accent, false: t.line }}
            thumbColor={switchThumb(t, settings.backup === true)}
          />
        </Card>
        {ANDROID && settings.backup ? (
          <Button title="Выбрать другую папку" kind="secondary" icon={FolderOpen} onPress={changeFolder} disabled={busy} />
        ) : null}
        <Button title="Сохранить копию в другое место" kind="secondary" icon={Share} onPress={saveCopy} disabled={busy} />
        <Button
          title="Восстановить из копии"
          kind="secondary"
          icon={ArchiveRestore}
          onPress={restore}
          disabled={busy || recording}
        />
        <Text style={[styles.rowSub, { color: t.sub }]}>
          {settings.backupSharedAt > 0
            ? `Последний раз копию сохраняли в другое место ${dateLong(settings.backupSharedAt)}.`
            : `Копию ещё ни разу не сохраняли в другое место (${ANDROID ? 'Google Диск' : 'iCloud Drive'}, компьютер, мессенджер).`}{' '}
          При восстановлении добавляются только дни, которых нет в истории.
        </Text>
      </View>

      {updatesAvailable ? (
        <View style={styles.section}>
          <Label>Обновления</Label>
          <Button
            title={update.release ? `Обновить до ${update.release.version}` : 'Проверить обновления'}
            kind={update.release ? 'primary' : 'secondary'}
            icon={RefreshCw}
            onPress={() => router.push('/update')}
          />
          <Text style={[styles.rowSub, { color: t.sub }]}>
            Новые версии выходят на GitHub. Snowwy проверяет их раз в сутки сам и ставит обновление поверх, все записи
            сохраняются.
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Label>Данные</Label>
        <Button title="Добавить демо-катание" kind="secondary" icon={FlaskConical} onPress={addDemo} disabled={busy} />
        <Button title="Удалить все записи" kind="danger" icon={Trash} onPress={wipe} disabled={recording} />
        <Text style={[styles.rowSub, { color: t.sub }]}>
          Демо-катание — выдуманный вчерашний день на семь спусков с выдуманными трассами, чтобы посмотреть приложение
          без выезда на склон. Все записи хранятся только на этом телефоне. Интернет нужен для погоды (Open-Meteo),
          слоя трасс на карте (OpenSnowMap) и названий трасс у спусков (OpenStreetMap): этим сервисам передаётся
          только район катания — без самого трека и без ваших результатов. Если вы состоите в группе друзей, её
          серверу во время записи отправляются ваши имя и место в зашифрованном виде.
        </Text>
      </View>

      <Text style={[styles.version, { color: t.sub }]}>Snowwy {Constants.expoConfig?.version ?? ''}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.m, paddingBottom: 120, gap: space.l },
  section: { gap: space.s },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', padding: space.m, gap: space.m },
  switchBody: { flex: 1, gap: 4 },
  account: { padding: space.m, gap: 4 },
  rowTitle: { fontSize: 17, fontWeight: '600' },
  rowSub: { fontSize: 13, lineHeight: 18 },
  palettes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  palette: { flexBasis: '30%', flexGrow: 1 },
  paletteTile: { padding: 10, gap: 8, alignItems: 'center' },
  swatches: { flexDirection: 'row', alignSelf: 'stretch', height: 34, borderRadius: 17, overflow: 'hidden' },
  swatch: { flex: 1 },
  paletteTitle: { fontSize: 14, fontWeight: '600' },
  guideHead: { fontWeight: '600', marginTop: 6 },
  version: { fontSize: 13, textAlign: 'center' },
});
