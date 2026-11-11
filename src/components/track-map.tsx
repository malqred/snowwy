import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Paths } from 'expo-file-system';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';

import type { Coord, MapLine } from '@/lib/lines';
import { updateSettings, useSettings } from '@/lib/settings';
import { useTheme } from '@/theme';

/** Трассы и подъёмники из OpenStreetMap (сервис OpenSnowMap). Нужен интернет. */
const PISTES_URL = 'https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png';
/** Загруженные участки карты трасс хранятся неделю и показываются без сети */
const PISTES_CACHE = `${Paths.cache.uri.replace(/\/+$/, '')}/pistes`;
const PISTES_MAX_AGE = 7 * 24 * 3600;

type Props = {
  lines: MapLine[];
  /** Следить за текущим положением (во время записи) вместо показа всего трека */
  live?: boolean;
  /** Точка на треке — положение при повторе спуска */
  marker?: Coord | null;
  style?: StyleProp<ViewStyle>;
};

const PADDING = { top: 36, right: 36, bottom: 36, left: 36 };

export function TrackMap({ lines, live = false, marker, style }: Props) {
  const t = useTheme();
  const map = useRef<MapView>(null);
  const [satellite, setSatellite] = useState(false);
  const { pistes } = useSettings();
  const [ready, setReady] = useState(false);

  // Показываем весь трек, когда карта готова или сменился набор линий
  const signature = live
    ? 'live'
    : `${lines.length}:${lines[0]?.id}:${lines[0]?.coords.length ?? 0}:${lines[lines.length - 1]?.id}`;
  useEffect(() => {
    if (!ready || live) return;
    const all = lines.flatMap((l) => l.coords);
    if (all.length > 1) map.current?.fitToCoordinates(all, { edgePadding: PADDING, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature]);

  return (
    <View style={[styles.wrap, { borderColor: t.line }, style]}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle={t.dark ? 'dark' : 'light'}
        mapType={satellite ? 'satellite' : 'standard'}
        showsUserLocation={live}
        followsUserLocation={live}
        showsCompass={false}
        showsPointsOfInterests={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onMapReady={() => setReady(true)}>
        {pistes ? (
          <UrlTile urlTemplate={PISTES_URL} maximumZ={18} tileCachePath={PISTES_CACHE} tileCacheMaxAge={PISTES_MAX_AGE} />
        ) : null}
        {lines.map((l) => (
          <Polyline
            key={l.id}
            coordinates={l.coords}
            strokeColor={satellite && !l.dashed && l.color === t.text ? '#FFFFFF' : l.color}
            strokeWidth={l.width}
            lineDashPattern={l.dashed ? [6, 6] : undefined}
            lineCap="round"
            lineJoin="round"
          />
        ))}
        {marker ? (
          <Marker coordinate={marker} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={[styles.marker, { backgroundColor: t.text, borderColor: t.bg }]} />
          </Marker>
        ) : null}
      </MapView>
      <View style={styles.toggles}>
        <Pressable
          onPress={() => updateSettings({ pistes: !pistes })}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ selected: pistes }}
          accessibilityLabel="Показывать трассы и подъёмники"
          style={[
            styles.toggle,
            { backgroundColor: pistes ? t.accent : t.card, borderColor: pistes ? t.accent : t.line },
          ]}>
          <Text style={[styles.toggleText, { color: pistes ? t.inverse : t.text }]}>Трассы</Text>
        </Pressable>
        <Pressable
          onPress={() => setSatellite((v) => !v)}
          hitSlop={6}
          accessibilityRole="button"
          style={[styles.toggle, { backgroundColor: t.card, borderColor: t.line }]}>
          <Text style={[styles.toggleText, { color: t.text }]}>{satellite ? 'Схема' : 'Спутник'}</Text>
        </Pressable>
      </View>
      {pistes ? (
        <Text style={[styles.credit, { color: satellite ? '#FFFFFF' : t.sub }]}>© OpenSnowMap, OpenStreetMap</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  toggles: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 6 },
  credit: { position: 'absolute', left: 10, bottom: 6, fontSize: 10 },
  toggle: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  toggleText: { fontSize: 13, fontWeight: '600' },
  marker: { width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
});
