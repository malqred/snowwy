import { CameraView } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onScan: (data: string) => void;
  onClose: () => void;
};

/**
 * Сканер QR-кода во весь экран. Нужен на Android: системный сканер там требует
 * сервисы Google, которых на части телефонов нет. Этот работает на любом.
 */
export function QrScanner({ visible, onScan, onClose }: Props) {
  const insets = useSafeAreaInsets();
  // Камера присылает один и тот же код много раз в секунду — берём первый
  const done = useRef(false);
  useEffect(() => {
    if (visible) done.current = false;
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.fill}>
        {visible ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (done.current) return;
              done.current = true;
              onScan(data);
            }}
          />
        ) : null}
        <View style={styles.frame} pointerEvents="none" />
        <Text style={[styles.hint, { top: insets.top + 24 }]}>Наведите камеру на QR-код приглашения</Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={[styles.close, { bottom: insets.bottom + 32 }]}>
          <Text style={styles.closeText}>Закрыть</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderRadius: 28, borderWidth: 3, borderColor: '#FFFFFF' },
  hint: { position: 'absolute', left: 24, right: 24, textAlign: 'center', color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  close: {
    position: 'absolute',
    height: 52,
    paddingHorizontal: 32,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
  },
  closeText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});
