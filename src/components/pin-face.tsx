import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

/** Человек на карте: кружок с его аватаркой или первой буквой имени. Общий для карт iPhone и Android. */
export function PinFace({
  color,
  letter,
  image,
  dim,
  onLoad,
}: {
  color: string;
  letter: string;
  /** Файл аватарки; пусто — буква */
  image?: string;
  /** Место давно не обновлялось */
  dim?: boolean;
  /** Аватарка нарисовалась (iPhone после этого перестаёт перерисовывать метку) */
  onLoad?: () => void;
}) {
  return (
    <View style={[styles.pin, { backgroundColor: color, opacity: dim ? 0.55 : 1 }]}>
      {image ? (
        <Image source={{ uri: image }} style={styles.image} contentFit="cover" onLoad={onLoad} onError={onLoad} />
      ) : (
        <Text style={styles.letter}>{letter}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: 30, height: 30, borderRadius: 15 },
  letter: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
