import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { space, useTheme } from '@/theme';

import { Field } from './field';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  initial?: string;
  maxLength?: number;
  onSubmit: (text: string) => void;
  onClose: () => void;
};

/**
 * Окно с одним полем ввода. На iPhone для этого есть системный вопрос (Alert.prompt),
 * на Android такого нет — показываем своё окно.
 */
export function Prompt({ visible, onClose, ...rest }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* Содержимое создаётся заново при каждом открытии, поэтому поле начинает с текущего значения */}
      {visible ? <Body onClose={onClose} {...rest} /> : null}
    </Modal>
  );
}

function Body({ title, message, initial = '', maxLength, onSubmit, onClose }: Omit<Props, 'visible'>) {
  const t = useTheme();
  const [text, setText] = useState(initial);

  const submit = () => {
    onClose();
    onSubmit(text);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <Pressable style={styles.shade} onPress={onClose} accessibilityLabel="Закрыть">
        <Pressable style={[styles.box, { backgroundColor: t.bg, borderColor: t.line }]} onPress={() => {}}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: t.sub }]}>{message}</Text> : null}
          <Field
            value={text}
            onChangeText={setText}
            maxLength={maxLength}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <View style={styles.buttons}>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" style={styles.button}>
              <Text style={[styles.buttonText, { color: t.sub }]}>Отмена</Text>
            </Pressable>
            <Pressable onPress={submit} hitSlop={8} accessibilityRole="button" style={styles.button}>
              <Text style={[styles.buttonText, { color: t.text }]}>Готово</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shade: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: space.l,
  },
  box: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.l,
    gap: space.m,
  },
  title: { fontSize: 20, fontWeight: '700' },
  message: { fontSize: 15, lineHeight: 21 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.l },
  button: { paddingVertical: 6 },
  buttonText: { fontSize: 17, fontWeight: '600' },
});
