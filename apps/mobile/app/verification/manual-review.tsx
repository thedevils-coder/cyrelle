import { router } from 'expo-router';
import { Button, Card, Muted, Screen, Title } from '../../src/ui';

export default function VerificationManualReview() {
  return (
    <Screen>
      <Title>Review in progress</Title>
      <Muted>Your verification is being reviewed. We'll notify you when it's complete.</Muted>
      <Card><Muted>You do not need to send documents to Cyrelle support. The review stays with the identity provider.</Muted></Card>
      <Button label="Back to profile" onPress={() => router.replace('/(tabs)/profile')} />
      <Button label="Contact support" onPress={() => router.push('/verification')} />
    </Screen>
  );
}
