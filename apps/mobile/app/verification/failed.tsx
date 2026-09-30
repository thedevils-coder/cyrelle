import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../src/api';
import { setVerificationSession } from '../../src/verification-session';
import { Button, Card, Muted, Screen, Title } from '../../src/ui';

export default function VerificationFailed() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    setError('');
    try {
      const session = await api<{ accessToken: string; expiresAt: string; language?: string }>('/v1/identity-verification/retry', { method: 'POST', body: '{}' });
      setVerificationSession({ accessToken: session.accessToken, expiresAt: session.expiresAt, language: session.language || 'en' });
      router.replace('/verification/in-progress');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Verification not completed</Title>
      <Muted>Your identity verification could not be completed. Please review the instructions and try again.</Muted>
      <Card><Muted>If the provider requested another try, you can continue. A final restriction cannot be overridden from this screen.</Muted></Card>
      <Button label={busy ? 'Starting…' : 'Retry verification'} onPress={retry} />
      <Button label="Contact support" onPress={() => setError('Email support@cyrelle.app from the address on your account.')} />
      {error ? <Text style={{ color: '#f2b8c8' }}>{error}</Text> : null}
    </Screen>
  );
}
