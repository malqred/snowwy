import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { space, useTheme } from '@/theme';

import { Surface } from './ui';

/** Поле ввода в виде плитки. */
export function Field({ style, multiline, ...rest }: TextInputProps) {
  const t = useTheme();
  return (
    <Surface style={styles.wrap}>
      <TextInput
        placeholderTextColor={t.sub}
        selectionColor={t.accent}
        autoCorrect={false}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, { color: t.text }, style]}
        {...rest}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, borderCurve: 'continuous', overflow: 'hidden' },
  input: { minHeight: 52, paddingHorizontal: space.m, paddingVertical: 14, fontSize: 17 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
