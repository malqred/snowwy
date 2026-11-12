import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AchievementBadge, tierOf } from '@/components/achievement-badge';
import { Pencil } from '@/components/icons';
import { Logo } from '@/components/logo';
import { Prompt } from '@/components/prompt';
import { RecordsBlock } from '@/components/records-block';
import { Card, ICON_STROKE, Label, Screen, StatStrip } from '@/components/ui';
import {
  achievementTitle,
  CATEGORIES,
  computeAchievements,
  TOTAL_ACHIEVEMENTS,
  type Achievement,
} from '@/lib/achievements';
import { listSessions } from '@/lib/db';
import { dateIso, dateLong, int, km, span } from '@/lib/format';
import { NAME_MAX, pushFriendInfo, setFriendName, useFriends } from '@/lib/friends/store';
import { pickImage, remove, useProfileImages, type ImageKind } from '@/lib/profile';
import type { Session } from '@/lib/types';
import { space, useTheme } from '@/theme';

const AVATAR = 96;

export default function ProfileScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const friends = useFriends();
  const images = useProfileImages();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [achievements, setAchievements] = useState<Achievement[] | null>(null);
  const [renaming, setRenaming] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listSessions()
        .then(async (list) => {
          if (!active) return;
          setSessions(list);
          const all = await computeAchievements(list);
          if (active) setAchievements(all);
        })
        .catch(() => {
          if (active) setSessions([]);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  const name = friends.name.trim();
  const applyName = (text: string) => {
    if (!text.trim()) return;
    setFriendName(text).catch(() => {});
  };
  const rename = () => {
    // Системный вопрос с полем ввода есть только на iPhone
    if (Platform.OS !== 'ios') return setRenaming(true);
    Alert.prompt('Ваше имя', 'Под этим именем вас видят друзья в группе.', applyName, 'plain-text', friends.name);
  };

  const choose = async (kind: ImageKind) => {
    try {
      await pickImage(kind);
    } catch {
      Alert.alert('Не получилось', 'Не удалось открыть фото. Проверьте, что у Snowwy есть доступ к галерее.');
    }
  };

  const edit = (kind: ImageKind) => {
    const has = kind === 'avatar' ? images.avatar : images.banner;
    const title = kind === 'avatar' ? 'Аватарка' : 'Баннер';
    if (!has) return choose(kind);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, options: ['Выбрать другое фото', 'Убрать', 'Отмена'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        (i) => {
          if (i === 0) choose(kind);
          if (i === 1) remove(kind);
        }
      );
      return;
    }
    Alert.alert(title, undefined, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Убрать', style: 'destructive', onPress: () => remove(kind) },
      { text: 'Другое фото', onPress: () => choose(kind) },
    ]);
  };

  const earned = (achievements ?? []).filter((a) => a.earnedAt != null).length;
  const list = sessions ?? [];
  const days = new Set(list.map((s) => dateIso(s.startedAt))).size;
  let runs = 0;
  let dist = 0;
  let vertical = 0;
  let runTime = 0;
  for (const s of list) {
    if (!s.totals) continue;
    runs += s.totals.runs;
    dist += s.totals.distance;
    vertical += s.totals.vertical;
    runTime += s.totals.runTime;
  }

  const explain = (a: Achievement) => {
    Alert.alert(
      achievementTitle(a.category.id, a.value),
      a.earnedAt != null
        ? `Получено ${dateLong(a.earnedAt)}. Материал — ${tierOf(a.index, a.category.levels.length).name.toLowerCase()}.`
        : 'Ещё не получено.'
    );
  };

  return (
    <Screen contentContainerStyle={[styles.content, { paddingBottom: 120 }]}>
      <View>
        <Pressable onPress={() => edit('banner')} accessibilityRole="button" accessibilityLabel="Изменить баннер">
          <View style={[styles.banner, { height: 150 + insets.top, backgroundColor: t.card }]}>
            {images.banner ? (
              <Image source={{ uri: images.banner }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            ) : (
              <>
                <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
                  <Defs>
                    <LinearGradient id="banner" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={t.accent} stopOpacity={0.85} />
                      <Stop offset="1" stopColor={t.bg} stopOpacity={1} />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100" height="100" fill="url(#banner)" />
                </Svg>
                <View style={[styles.bannerMark, { top: insets.top + 18 }]} pointerEvents="none">
                  <Logo size={110} color={t.inverse} />
                </View>
                <Text style={[styles.bannerHint, { color: t.inverse }]}>Нажмите, чтобы поставить свой баннер</Text>
              </>
            )}
          </View>
        </Pressable>
        <Pressable
          onPress={() => edit('avatar')}
          accessibilityRole="button"
          accessibilityLabel="Изменить аватарку"
          style={[styles.avatarWrap, { borderColor: t.bg, backgroundColor: t.accent }]}>
          {images.avatar ? (
            <Image source={{ uri: images.avatar }} style={styles.avatar} contentFit="cover" transition={150} />
          ) : (
            <Text style={[styles.avatarLetter, { color: t.inverse }]}>{(Array.from(name)[0] ?? '?').toUpperCase()}</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.body}>
        <Pressable onPress={rename} accessibilityRole="button" style={styles.nameRow} hitSlop={6}>
          <Text style={[styles.name, { color: name ? t.text : t.sub }]} numberOfLines={1}>
            {name || 'Как вас зовут?'}
          </Text>
          <Pencil size={20} color={t.sub} strokeWidth={ICON_STROKE} />
        </Pressable>
        <Text style={[styles.sub, { color: t.sub }]}>
          {achievements ? `Достижений: ${earned} из ${TOTAL_ACHIEVEMENTS}` : 'Считаю достижения…'}
          {days > 0 ? ` · ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'} на склоне` : ''}
        </Text>

        {days > 0 ? (
          <StatStrip
            items={[
              { label: 'Спусков', value: int(runs) },
              { label: 'Км', value: km(dist) },
              { label: 'М вниз', value: int(vertical) },
              { label: 'На спусках', value: span(runTime) },
            ]}
          />
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text }]}>Достижения</Text>
          {CATEGORIES.map((category) => {
            const items = (achievements ?? []).filter((a) => a.category.id === category.id);
            const got = items.filter((a) => a.earnedAt != null).length;
            return (
              <Card key={category.id} style={styles.category}>
                <View style={styles.categoryHead}>
                  <Label>{category.title}</Label>
                  <Text style={[styles.count, { color: t.sub }]}>
                    {got} из {category.levels.length}
                  </Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badges}>
                  {category.levels.map((value, index) => {
                    const a = items[index];
                    return (
                      <Pressable
                        key={value}
                        onPress={() => a && explain(a)}
                        accessibilityRole="button"
                        accessibilityLabel={`${achievementTitle(category.id, value)}${a?.earnedAt ? ', получено' : ', ещё не получено'}`}
                        style={({ pressed }) => pressed && { opacity: 0.6 }}>
                        <AchievementBadge
                          category={category.id}
                          value={value}
                          index={index}
                          count={category.levels.length}
                          locked={!a?.earnedAt}
                          size={64}
                        />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Card>
            );
          })}
          <Text style={[styles.note, { color: t.sub }]}>
            Нажмите на значок, чтобы узнать, за что он и когда получен. Средняя скорость считается по спускам длиной от
            300 метров.
          </Text>
        </View>

        <RecordsBlock sessions={list} />
      </View>

      <Prompt
        visible={renaming}
        title="Ваше имя"
        message="Под этим именем вас видят друзья в группе."
        initial={friends.name}
        maxLength={NAME_MAX}
        onSubmit={(text) => {
          applyName(text);
          pushFriendInfo().catch(() => {});
        }}
        onClose={() => setRenaming(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 0 },
  banner: { overflow: 'hidden', justifyContent: 'flex-end' },
  bannerMark: { position: 'absolute', right: -18, opacity: 0.18 },
  bannerHint: { fontSize: 12, fontWeight: '600', opacity: 0.8, padding: space.m, textAlign: 'right' },
  avatarWrap: {
    position: 'absolute',
    left: space.m,
    bottom: -AVATAR / 2,
    width: AVATAR + 8,
    height: AVATAR + 8,
    borderRadius: (AVATAR + 8) / 2,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarLetter: { fontSize: 40, fontWeight: '800' },
  body: { paddingHorizontal: space.m, paddingTop: AVATAR / 2 + space.m, gap: space.l },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: -space.m },
  name: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, flexShrink: 1 },
  sub: { fontSize: 14 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, paddingHorizontal: 4 },
  category: { paddingTop: 12, paddingBottom: 10, gap: 8 },
  categoryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.m },
  count: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  badges: { paddingHorizontal: 10, gap: 4 },
  note: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
});
