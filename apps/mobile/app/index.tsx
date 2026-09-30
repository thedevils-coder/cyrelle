import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { router } from 'expo-router';
import { token } from '../src/api';
import { hideLaunchSplash } from '../src/launch-splash';
import { Button, Muted, Screen, Title } from '../src/ui';

export default function Welcome() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    token()
      .then((value) => {
        if (value) router.replace('/(tabs)/home');
        setReady(true);
      })
      .finally(hideLaunchSplash);
  }, []);
  if (!ready) return null;
  return (
    <Screen>
      <Image source={require('../assets/logo.jpg')} style={{ width: 220, height: 280, alignSelf: 'center', borderRadius: 28 }} accessibilityLabel="Cyrelle" />
      <Title>Welcome to Cyrelle</Title>
      <Muted>A community made for women. Connect, create, and grow. Join with email or Google. A phone number is never required.</Muted>
      <Button label="Create account" onPress={() => router.push('/register')} />
      <Button label="Sign in" onPress={() => router.push('/login')} />
    </Screen>
  );
}
