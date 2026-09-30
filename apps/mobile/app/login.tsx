import { useState } from 'react';
import { router } from 'expo-router';
import { api, setToken } from '../src/api';
import { Button, Field, Muted, Screen, Title } from '../src/ui';

export default function Login() {
  const [email, setEmail] = useState('diya@cyrelle.test');
  const [password, setPassword] = useState('CyrelleTest!2026');
  const [error, setError] = useState('');
  async function submit() {
    try {
      const body = await api<{ accessToken: string }>('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      await setToken(body.accessToken);
      router.replace('/(tabs)/home');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in failed');
    }
  }
  return (
    <Screen>
      <Title>Sign in</Title>
      <Muted>Email and password, or Google when it is configured. No SMS code.</Muted>
      <Field label="Email" value={email} onChangeText={setEmail} />
      <Field label="Password" value={password} onChangeText={setPassword} secure />
      {error ? <Muted>{error}</Muted> : null}
      <Button label="Continue" onPress={submit} />
    </Screen>
  );
}
