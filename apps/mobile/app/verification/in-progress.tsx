import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../src/api';
import { SumsubFrame } from '../../src/SumsubFrame';
import { getVerificationSession, sumsubWebSdkHtml } from '../../src/verification-session';
import { Button, Muted, Screen, Title } from '../../src/ui';

type Status = { status: string };

export default function VerificationInProgress() {
  const session = getVerificationSession();
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const html = useMemo(() => (session ? sumsubWebSdkHtml(session.accessToken, session.language) : ''), [session]);

  const routeFor = useCallback(async () => {
    const status = await api<Status>('/v1/identity-verification/status');
    if (status.status === 'VERIFIED') router.replace('/verification/success');
    else if (status.status === 'FAILED' || status.status === 'RESTRICTED') router.replace('/verification/failed');
    else if (status.status === 'MANUAL_REVIEW') router.replace('/verification/manual-review');
    else setNote('Your check has been submitted. The result arrives from the verification provider, and we will notify you.');
  }, []);

  async function onMessage(type: string) {
    if (type === 'tokenExpired') {
      try {
        const next = await api<{ accessToken: string }>('/v1/identity-verification/token', { method: 'POST', body: '{}' });
        setRefreshToken(next.accessToken);
      } catch (reason) {
        setNote(reason instanceof Error ? reason.message : 'We could not refresh the verification session.');
      }
      return;
    }
    if (type === 'submitted') {
      try { await routeFor(); } catch { setNote('Submitted. We will update this screen when the provider confirms the result.'); }
      return;
    }
    if (type === 'sdkError') setNote('The verification flow hit a problem. You can leave and try again.');
  }

  if (!session) {
    return (
      <Screen>
        <Title>Verification</Title>
        <Muted>Start verification to open the secure flow.</Muted>
        <Button label="Start verification" onPress={() => router.replace('/verification/start')} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#070708' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <Title>Secure verification</Title>
        <Muted>You are in the identity provider's flow. Cyrelle confirms the result from the provider, not from this screen.</Muted>
        {note ? <Text style={{ color: '#f2b8c8', marginBottom: 8 }}>{note}</Text> : null}
      </View>
      <SumsubFrame html={html} refreshToken={refreshToken} onMessage={onMessage} />
      <View style={{ padding: 16 }}>
        <Button label="Check result" onPress={() => routeFor().catch(() => setNote('We could not check the result yet.'))} />
      </View>
    </View>
  );
}
