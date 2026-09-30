import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SplashCover } from '../src/SplashCover';
import { hideLaunchSplash, useLaunchSplashHidden } from '../src/launch-splash';

export default function RootLayout() {
  const launchHidden = useLaunchSplashHidden();
  const [held, setHeld] = useState(true);
  useEffect(() => {
    const hold = setTimeout(() => setHeld(false), 700);
    const timeout = setTimeout(hideLaunchSplash, 8000);
    return () => {
      clearTimeout(hold);
      clearTimeout(timeout);
    };
  }, []);
  const splashHidden = launchHidden && !held;
  return (
    <View style={{ flex: 1, backgroundColor: '#070708' }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#070708' }, headerTintColor: '#f4f4f6', contentStyle: { backgroundColor: '#070708' } }} />
      {splashHidden ? null : <SplashCover />}
    </View>
  );
}
