import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import type { Coord, MapLine } from '@/lib/lines';
import { useTheme } from '@/theme';

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
  const [ready, setReady] = useState(false);

  // Показываем весь трек, когда карта готова или сменился набор линий
  const signature = live ? 'live' : `${lines.length}:${lines[0]?.coords.length ?? 0}`;
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
      <Pressable
        onPress={() => setSatellite((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        style={[styles.toggle, { backgroundColor: t.card, borderColor: t.line }]}>
        <Text style={[styles.toggleText, { color: t.text }]}>{satellite ? 'Схема' : 'Спутник'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  toggle: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  toggleText: { fontSize: 13, fontWeight: '600' },
  marker: { width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
});
