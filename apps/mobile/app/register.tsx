import { useState } from 'react';
import { router } from 'expo-router';
import { api, setToken } from '../src/api';
import { Button, Field, Muted, Screen, Title } from '../src/ui';

export default function Register() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [countryCode, setCountry] = useState('US');
  const [error, setError] = useState('');
  async function submit() {
    try {
      const body = await api<{ accessToken: string }>('/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, username, email, password, countryCode, acceptTerms: true, acceptPrivacy: true }),
      });
      await setToken(body.accessToken);
      router.replace('/(tabs)/home');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the account');
    }
  }
  return (
    <Screen>
      <Title>Create your account</Title>
      <Muted>There is no universal 18+ gate and no phone number field.</Muted>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Username" value={username} onChangeText={setUsername} />
      <Field label="Email" value={email} onChangeText={setEmail} />
      <Field label="Password" value={password} onChangeText={setPassword} secure />
      <Field label="Country" value={countryCode} onChangeText={setCountry} />
      {error ? <Muted>{error}</Muted> : null}
      <Button label="Create account" onPress={submit} />
    </Screen>
  );
}
