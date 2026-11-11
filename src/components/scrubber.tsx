import { Host, Slider } from '@expo/ui/swift-ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { requireOptionalNativeModule } from 'expo';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  /** Доля пройденного, 0…1 */
  progress: number;
  onSeek: (fraction: number) => void;
  /** Палец взял ползунок (true) или отпустил (false) */
  onHold?: (held: boolean) => void;
};

// Системный ползунок сам удерживает касание: пока он зажат, экран под ним не прокручивается
const NATIVE = Platform.OS === 'ios' && requireOptionalNativeModule('ExpoUI') != null;

/** Ползунок перемотки. */
export function Scrubber(props: Props) {
  return NATIVE ? <NativeScrubber {...props} /> : <PlainScrubber {...props} />;
}

function NativeScrubber({ progress, onSeek, onHold }: Props) {
  const t = useTheme();
  return (
    <Host style={styles.host}>
      <Slider
        value={progress}
        min={0}
        max={1}
        onValueChange={onSeek}
        onEditingChanged={onHold}
        modifiers={[tint(t.accent)]}
      />
    </Host>
  );
}

/** Запасной вариант там, где системного ползунка нет. */
function PlainScrubber({ progress, onSeek, onHold }: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const seek = (x: number) => {
    if (width > 0) onSeek(x / width);
  };
  return (
    <View
      style={styles.plain}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        onHold?.(true);
        seek(e.nativeEvent.locationX);
      }}
      onResponderMove={(e) => seek(e.nativeEvent.locationX)}
      onResponderRelease={() => onHold?.(false)}
      onResponderTerminate={() => onHold?.(false)}
      accessibilityRole="adjustable"
      accessibilityLabel="Перемотка повтора"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
      <View pointerEvents="none" style={[styles.bar, { backgroundColor: t.line }]}>
        <View style={[styles.fill, { backgroundColor: t.accent, width: `${progress * 100}%` }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.knob, { backgroundColor: t.accent, borderColor: t.card, left: progress * Math.max(width - 18, 0) }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { height: 36 },
  plain: { height: 36, justifyContent: 'center' },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  knob: { position: 'absolute', top: 9, width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
});
