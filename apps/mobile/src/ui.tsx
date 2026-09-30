import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export const colors = {
  bg: '#070708',
  card: '#141418',
  line: 'rgba(212,175,186,0.35)',
  rose: '#d4146a',
  blush: '#f2b8c8',
  text: '#f4f4f6',
  muted: '#a7a7b0',
};

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: { label: string; value: string; onChangeText: (value: string) => void; secure?: boolean }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secure}
        placeholderTextColor={colors.muted}
        style={styles.input}
        autoCapitalize="none"
      />
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  title: { color: colors.text, fontSize: 34, fontWeight: '500', marginBottom: 8 },
  muted: { color: colors.muted, lineHeight: 22, marginBottom: 16 },
  button: { backgroundColor: colors.rose, borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: 'white', fontWeight: '600' },
  label: { color: colors.blush, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, color: colors.text },
  card: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 24, padding: 16, marginBottom: 12 },
});
