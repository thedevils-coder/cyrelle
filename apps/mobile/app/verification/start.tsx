import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../src/api';
import { setVerificationSession } from '../../src/verification-session';
import { Button, Card, Muted, Screen, Title } from '../../src/ui';

export default function VerificationStart() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError('');
    try {
      const session = await api<{ accessToken: string; expiresAt: string; language?: string }>('/v1/identity-verification/start', { method: 'POST', body: '{}' });
      setVerificationSession({ accessToken: session.accessToken, expiresAt: session.expiresAt, language: session.language || 'en' });
      router.push('/verification/in-progress');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'We could not start verification right now. Please try again.';
      if (message.toLowerCase().includes('retry')) router.push('/verification/failed');
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Before you begin</Title>
      <Muted>Cyrelle uses identity verification to help maintain a safe women-only community.</Muted>
      <Card>
        <Muted>You will enter a secure verification flow operated by Sumsub. Have a government-issued ID ready. A selfie or liveness check appears only when that check is part of the configured flow for your country.</Muted>
        <Muted>Cyrelle does not ask you to upload those images to Cyrelle, and the result is not shown on your public profile.</Muted>
      </Card>
      <Button label={busy ? 'Starting…' : 'Continue to verification'} onPress={start} />
      <Button label="Contact support" onPress={() => setError('Email support@cyrelle.app from the address on your account.')} />
      {error ? <Text style={{ color: '#f2b8c8' }}>{error}</Text> : null}
    </Screen>
  );
}
