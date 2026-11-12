import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dayKey } from '@/lib/friends/info';
import type { Member } from '@/lib/friends/store';
import { ago } from '@/lib/friends/codec';
import { distance, int, kmh, span } from '@/lib/format';
import { relativeLong, type Relative } from '@/lib/relative';
import { space, useTheme } from '@/theme';

import { CATEGORIES, earnedFromLevels, TOTAL_ACHIEVEMENTS } from '@/lib/achievements';

import { AchievementBadge } from './achievement-badge';
import { Battery } from './battery';
import { MapPin } from './icons';
import { Button, ICON_STROKE, Label, StatGrid, type StatItem } from './ui';

type Props = {
  member: Member | null;
  color: string;
  /** Что человек делает сейчас: «катается», «на паузе» */
  status: string;
  /** Сколько прошло с обновления места, мс */
  age: number;
  /** Где он относительно меня; null — неизвестно */
  where: Relative | null;
  onShowOnMap: (() => void) | null;
  onClose: () => void;
  /** Текущее время, мс: по нему понятно, сегодняшние ли итоги */
  now: number;
};

const firstLetter = (name: string) => (Array.from(name.trim())[0] ?? '?').toUpperCase();

/** Карточка участника группы: итоги дня, рекорды, где он и сколько заряда. */
export function FriendCard({ member, color, status, age, where, onShowOnMap, onClose, now }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  if (!member) return null;
  const info = member.info;
  const today = info?.day && info.day.date === dayKey(now) ? info.day : null;

  const todayItems: StatItem[] = today
    ? [
        { label: 'Макс. скорость', value: kmh(today.maxSpeed), unit: 'км/ч' },
        { label: 'Перепад', value: int(today.vertical), unit: 'м' },
        { label: 'Самый длинный', ...distance(today.longest) },
        { label: 'На спусках', value: span(today.runTime) },
        { label: 'Спусков', value: `${today.runs}` },
        { label: 'Путь', ...distance(today.distance) },
      ]
    : [];
  const rec = info?.rec;
  const recordItems: StatItem[] = rec
    ? [
        { label: 'Скорость', value: kmh(rec.maxSpeed), unit: 'км/ч' },
        { label: 'Перепад за спуск', value: int(rec.biggestRunVertical), unit: 'м' },
        { label: 'Самый длинный', ...distance(rec.longestRun) },
        { label: 'Перепад за день', value: int(rec.dayVertical), unit: 'м' },
      ]
    : [];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.shade} onPress={onClose} accessibilityLabel="Закрыть карточку" />
      <View style={[styles.sheet, { backgroundColor: t.bg, borderColor: t.line, paddingBottom: insets.bottom + space.m }]}>
        <View style={[styles.grip, { backgroundColor: t.line }]} />
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.head}>
            <View style={[styles.avatar, { backgroundColor: color }]}>
              <Text style={styles.avatarText}>{firstLetter(member.name)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
                {member.name}
                {member.me ? <Text style={{ color: t.sub }}> · вы</Text> : null}
              </Text>
              <Text style={[styles.sub, { color: t.sub }]}>
                {member.owner ? 'создатель · ' : ''}
                {status}
                {member.at > 0 ? ` · ${ago(age)} назад` : ''}
              </Text>
            </View>
          </View>

          <View style={styles.facts}>
            {where && !member.me ? (
              <View style={styles.fact}>
                <MapPin size={16} color={t.sub} strokeWidth={ICON_STROKE} />
                <Text style={[styles.factText, { color: t.text }]}>{relativeLong(where)}</Text>
              </View>
            ) : null}
            {info?.bat != null ? (
              <View style={styles.fact}>
                <Battery level={info.bat} charging={info.chg} height={18} />
                <Text style={[styles.factText, { color: info.bat <= 20 && !info.chg ? t.danger : t.text }]}>
                  {info.chg ? 'Заряжается' : info.bat <= 20 ? 'Телефон скоро сядет' : 'Заряд телефона'}
                </Text>
              </View>
            ) : null}
          </View>

          {!info ? (
            <Text style={[styles.note, { color: t.sub }]}>
              {member.infoAt > 0
                ? 'Человек скрыл свои итоги и рекорды.'
                : 'Итоги и рекорды появятся, когда человек откроет Snowwy версии 1.0.4 или новее.'}
            </Text>
          ) : (
            <>
              <View style={styles.section}>
                <Label>Сегодня</Label>
                {today ? (
                  <StatGrid items={todayItems} columns={2} />
                ) : (
                  <Text style={[styles.note, { color: t.sub }]}>Сегодня ещё не катался.</Text>
                )}
              </View>
              {info.ach ? (
                <View style={styles.section}>
                  <Label>
                    Достижения · {earnedFromLevels(info.ach).length} из {TOTAL_ACHIEVEMENTS}
                  </Label>
                  {earnedFromLevels(info.ach).length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badges}>
                      {CATEGORIES.map((c) => {
                        // В карточке — старший значок каждой категории
                        const n = info.ach?.[c.id] ?? 0;
                        if (n <= 0) return null;
                        const value = c.levels[n - 1];
                        return (
                          <Pressable
                            key={c.id}
                            onPress={() => Alert.alert(c.title, `Получено ${n} из ${c.levels.length}.`)}
                            accessibilityRole="button"
                            accessibilityLabel={`${c.title}: ${n} из ${c.levels.length}`}>
                            <AchievementBadge category={c.id} value={value} index={n - 1} count={c.levels.length} size={60} />
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <Text style={[styles.note, { color: t.sub }]}>Пока ни одного.</Text>
                  )}
                </View>
              ) : null}
              {recordItems.length > 0 && rec && rec.maxSpeed > 0 ? (
                <View style={styles.section}>
                  <Label>Рекорды</Label>
                  <StatGrid items={recordItems} columns={2} />
                </View>
              ) : null}
            </>
          )}

          {onShowOnMap ? (
            <Button
              title="Показать на карте"
              kind="secondary"
              icon={MapPin}
              onPress={() => {
                onClose();
                onShowOnMap();
              }}
            />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingTop: 10,
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: space.s },
  body: { paddingHorizontal: space.m, gap: space.l, paddingBottom: space.s },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flex: { flex: 1 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 14, marginTop: 2 },
  facts: { gap: 8 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factText: { fontSize: 15, flexShrink: 1 },
  section: { gap: space.s },
  note: { fontSize: 14, lineHeight: 20 },
  badges: { gap: 4 },
});
