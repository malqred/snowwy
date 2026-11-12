// Карта для Android. Вместо карт Google здесь MapLibre с открытыми картами:
// им не нужны ни ключ, ни аккаунт, ни сервисы Google на телефоне.
import {
  Camera,
  GeoJSONSource,
  Layer,
  LogManager,
  Map,
  NativeUserLocation,
  RasterSource,
  ViewAnnotation,
  type CameraRef,
  type MapProps,
} from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { updateSettings, useSettings } from '@/lib/settings';
import { useTheme } from '@/theme';

import { MeetFlag, type MapPin, type Props } from './track-map';

export type { MapPin } from './track-map';

/** Схема: OpenFreeMap на данных OpenStreetMap, без ключа и лимитов */
const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
/** Спутниковые снимки Esri World Imagery */
const SATELLITE: MapProps['mapStyle'] = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 18,
      attribution: '© Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
};
/** Трассы и подъёмники из OpenStreetMap (сервис OpenSnowMap). Нужен интернет. */
const PISTES_URL = 'https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png';

const PADDING = { top: 48, right: 36, bottom: 36, left: 36 };
/** Масштаб, когда на карте одна точка: примерно километр по высоте */
const CLOSE_ZOOM = 14.5;
const LIVE_ZOOM = 15;

// Служебные сообщения карты не нужны человеку. «Нет последнего места» приходит, пока GPS
// ещё ищет спутники, оборванные загрузки — при каждом сдвиге карты, а неподгрузившиеся
// участки — при плохой связи на склоне: всё это не ошибки, карта просто дорисуется позже.
LogManager.onLog(({ tag, message }) => {
  if (tag === 'Mbgl-LocationComponent') return true;
  if (tag === 'Mbgl-HttpRequest') return true;
  if (message.includes('Failed to load tile')) return true;
  return false;
});

type Feature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, string | number | boolean>>;
const collection = (features: Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });

export function TrackMap({ lines, pins, focus, live = false, marker, meet, onPress, style }: Props) {
  const t = useTheme();
  const camera = useRef<CameraRef>(null);
  const [satellite, setSatellite] = useState(false);
  const { pistes } = useSettings();
  const [ready, setReady] = useState(false);

  // Показываем весь трек, когда карта готова или сменился набор линий
  const signature = live
    ? 'live'
    : `${lines.length}:${lines[0]?.id}:${lines[0]?.coords.length ?? 0}:${lines[lines.length - 1]?.id}:${(pins ?? []).map((p) => p.id).join()}:${meet ? 1 : 0}`;
  useEffect(() => {
    if (!ready || live) return;
    const all = lines
      .flatMap((l) => l.coords)
      .concat((pins ?? []).map((p) => p.coord))
      .concat(meet && !onPress ? [meet] : []);
    if (all.length === 0) return;
    let west = 180;
    let east = -180;
    let south = 90;
    let north = -90;
    for (const c of all) {
      west = Math.min(west, c.longitude);
      east = Math.max(east, c.longitude);
      south = Math.min(south, c.latitude);
      north = Math.max(north, c.latitude);
    }
    // Все точки в одном месте — показываем его крупно, а не «в упор»
    if (east - west < 0.0005 && north - south < 0.0005) {
      camera.current?.jumpTo({ center: [(west + east) / 2, (south + north) / 2], zoom: CLOSE_ZOOM });
    } else {
      camera.current?.fitBounds([west, south, east, north], { padding: PADDING, duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature]);

  useEffect(() => {
    if (ready && focus) {
      camera.current?.easeTo({
        center: [focus.coord.longitude, focus.coord.latitude],
        zoom: CLOSE_ZOOM,
        duration: 300,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focus?.n]);

  const lineData = useMemo(
    () =>
      collection(
        lines
          .filter((l) => l.coords.length > 1)
          .map((l) => ({
            type: 'Feature',
            properties: {
              color: satellite && !l.dashed && l.color === t.text ? '#FFFFFF' : l.color,
              width: l.width,
              dashed: !!l.dashed,
            },
            geometry: { type: 'LineString', coordinates: l.coords.map((c) => [c.longitude, c.latitude]) },
          }))
      ),
    [lines, satellite, t.text]
  );

  const pinData = useMemo(
    () =>
      collection(
        (pins ?? []).map((p: MapPin) => ({
          type: 'Feature',
          properties: { color: p.color, letter: p.letter, opacity: p.dim ? 0.55 : 1 },
          geometry: { type: 'Point', coordinates: [p.coord.longitude, p.coord.latitude] },
        }))
      ),
    [pins]
  );

  const markerData = useMemo(
    () =>
      collection(
        marker
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Point', coordinates: [marker.longitude, marker.latitude] },
              },
            ]
          : []
      ),
    [marker]
  );

  return (
    <View style={[styles.wrap, { borderColor: t.line }, style]}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={satellite ? SATELLITE : t.dark ? STYLE_DARK : STYLE_LIGHT}
        // Обычный вид рисуется вместе с остальным экраном: карта не «просвечивает» сквозь
        // соседние экраны и правильно обрезается по скруглённым углам
        androidView="texture"
        touchRotate={false}
        touchPitch={false}
        compass={false}
        logo={false}
        attribution
        attributionPosition={{ bottom: 6, right: 6 }}
        onPress={onPress ? (e) => onPress({ latitude: e.nativeEvent.lngLat[1], longitude: e.nativeEvent.lngLat[0] }) : undefined}
        onDidFinishLoadingMap={() => setReady(true)}>
        <Camera
          ref={camera}
          trackUserLocation={live ? 'default' : undefined}
          zoom={live ? LIVE_ZOOM : undefined}
        />
        {live ? <NativeUserLocation /> : null}

        <GeoJSONSource id="snowwy-lines" data={lineData}>
          <Layer
            id="snowwy-lines-solid"
            type="line"
            filter={['!', ['get', 'dashed']]}
            paint={{ 'line-color': ['get', 'color'], 'line-width': ['get', 'width'] }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="snowwy-lines-dashed"
            type="line"
            filter={['get', 'dashed']}
            paint={{ 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-dasharray': [2.4, 2.4] }}
            layout={{ 'line-join': 'round' }}
          />
        </GeoJSONSource>

        {pistes ? (
          <RasterSource id="snowwy-pistes" tiles={[PISTES_URL]} tileSize={256} maxzoom={18}>
            {/* Трассы лежат под треком */}
            <Layer id="snowwy-pistes-layer" type="raster" beforeId="snowwy-lines-solid" />
          </RasterSource>
        ) : null}

        <GeoJSONSource id="snowwy-pins" data={pinData}>
          <Layer
            id="snowwy-pins-circle"
            type="circle"
            paint={{
              'circle-radius': 13,
              'circle-color': ['get', 'color'],
              'circle-opacity': ['get', 'opacity'],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-opacity': ['get', 'opacity'],
            }}
          />
          <Layer
            id="snowwy-pins-letter"
            type="symbol"
            layout={{
              'text-field': ['get', 'letter'],
              'text-font': ['Noto Sans Bold'],
              'text-size': 14,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
            paint={{ 'text-color': '#FFFFFF' }}
          />
        </GeoJSONSource>

        {meet ? (
          <ViewAnnotation id="snowwy-meet" lngLat={[meet.longitude, meet.latitude]} anchor="bottom">
            <MeetFlag />
          </ViewAnnotation>
        ) : null}

        <GeoJSONSource id="snowwy-marker" data={markerData}>
          <Layer
            id="snowwy-marker-circle"
            type="circle"
            paint={{
              'circle-radius': 6,
              'circle-color': t.text,
              'circle-stroke-width': 3,
              'circle-stroke-color': t.bg,
            }}
          />
        </GeoJSONSource>
      </Map>
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
});
