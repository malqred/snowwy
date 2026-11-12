import { StyleSheet, Text, View } from 'react-native';

/** Метка точки встречи на карте: флажок на ножке. Общая для карт iPhone и Android. */
export function MeetFlag() {
  return (
    <View style={styles.meet}>
      <View style={styles.head}>
        <Text style={styles.text}>⚑</Text>
      </View>
      <View style={styles.leg} />
    </View>
  );
}

const styles = StyleSheet.create({
  meet: { alignItems: 'center' },
  head: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#E5484D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  leg: { width: 3, height: 10, backgroundColor: '#E5484D' },
});
