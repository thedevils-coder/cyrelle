import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#070708' }, headerTintColor: '#f4f4f6', contentStyle: { backgroundColor: '#070708' } }} />
    </>
  );
}
