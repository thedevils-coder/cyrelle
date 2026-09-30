import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { api } from '../../src/api';
import { Button, Card, Muted, Screen, Title } from '../../src/ui';

export default function VerificationSuccess() {
  const [premium, setPremium] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ premiumBlueTickEligible: boolean; premiumActive: boolean }>('/v1/identity-verification/status')
      .then((status) => setPremium(status.premiumBlueTickEligible))
      .catch(() => setPremium(null));
  }, []);
  return (
    <Screen>
      <Title>Verification complete</Title>
      <Muted>Your identity verification is complete.</Muted>
      <Card>
        <Muted>{premium ? 'Premium Blue Tick is on because Premium is active and your identity is verified.' : 'Premium Blue Tick appears only when Premium is active and identity verification stays verified.'}</Muted>
      </Card>
      <Button label="Back to profile" onPress={() => router.replace('/(tabs)/profile')} />
    </Screen>
  );
}
