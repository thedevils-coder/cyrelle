import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../../src/api';
import { Button, Card, Muted, Screen, Title } from '../../src/ui';

type Status = {
  status: string;
  failureReason?: string | null;
  canRetry: boolean;
  retriesRemaining: number;
  premiumBlueTickEligible: boolean;
  premiumActive: boolean;
  identityVerified: boolean;
  flow: string;
};

const labels: Record<string, string> = {
  NOT_STARTED: 'Not started',
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  VERIFIED: 'Verified',
  FAILED: 'Not completed',
  MANUAL_REVIEW: 'Being reviewed',
  RESTRICTED: 'Needs attention',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

export default function VerificationHome() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [help, setHelp] = useState('');

  const load = useCallback(() => {
    api<Status>('/v1/identity-verification/status').then(setStatus).catch((reason: Error) => setError(reason.message));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen>
      <Title>Verify your identity</Title>
      <Muted>Cyrelle uses identity verification to help maintain a safe women-only community.</Muted>
      <Card>
        <Text style={{ color: 'white' }}>Status: {labels[status?.status || ''] || 'Loading'}</Text>
        <Muted>This confirms a verification result from the identity provider. It does not publish your documents, and it is not a government credential.</Muted>
        {status?.failureReason ? <Muted>Reason code: {status.failureReason}</Muted> : null}
        {status?.identityVerified && !status.premiumActive ? <Muted>Verification is complete. Premium Blue Tick also requires an active Premium subscription.</Muted> : null}
        {status?.premiumBlueTickEligible ? <Muted>Premium Blue Tick is available on your profile.</Muted> : null}
      </Card>
      <Card>
        <Text style={{ color: '#f2b8c8' }}>Privacy</Text>
        <Muted>Sumsub runs the ID, selfie, and liveness checks configured for your country. Cyrelle stores the result, provider reference, and safe status details. Government ID images and biometric templates are not stored in Cyrelle.</Muted>
      </Card>
      {status?.flow === 'unavailable' ? <Muted>Verification is not available in this environment yet.</Muted> : null}
      {status?.status === 'VERIFIED' ? <Button label="View result" onPress={() => router.push('/verification/success')} /> : null}
      {status?.status === 'MANUAL_REVIEW' ? <Button label="View review status" onPress={() => router.push('/verification/manual-review')} /> : null}
      {status?.status === 'FAILED' || status?.status === 'RESTRICTED' ? <Button label="View result" onPress={() => router.push('/verification/failed')} /> : null}
      {status && status.status !== 'VERIFIED' && status.status !== 'MANUAL_REVIEW' && status.status !== 'RESTRICTED' && status.flow !== 'unavailable' ? (
        <Button label={status.canRetry ? 'Retry verification' : 'Start verification'} onPress={() => router.push(status.canRetry ? '/verification/failed' : '/verification/start')} />
      ) : null}
      <Button label="Contact support" onPress={() => setHelp('Email support@cyrelle.app from the address on your account.')} />
      <Muted>Help is available at support@cyrelle.app. Attempts remaining: {status?.retriesRemaining ?? '—'}</Muted>
      {help ? <Text style={{ color: '#f2b8c8' }}>{help}</Text> : null}
      {error ? <Text style={{ color: '#f2b8c8' }}>{error}</Text> : null}
    </Screen>
  );
}
