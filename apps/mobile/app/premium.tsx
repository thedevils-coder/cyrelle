import { useEffect, useState } from 'react';
import { api } from '../src/api';
import { Button, Card, Muted, Screen, Title } from '../src/ui';

export default function Premium() {
  const [message, setMessage] = useState('Premium is ₹499/month or ₹5,000/year in India. Ads remain. Business Blue Tick is separate.');
  const [features, setFeatures] = useState<Array<{ key: string; state: string }>>([]);
  useEffect(() => { api<Array<{ key: string; state: string }>>('/v1/features').then(setFeatures).catch(() => setFeatures([])); }, []);
  async function subscribe(interval: 'MONTH' | 'YEAR') {
    try {
      const body = await api<{ entitlements: { plan: string; premiumBlueTick: boolean } }>('/v1/premium/checkout', { method: 'POST', body: JSON.stringify({ interval }) });
      setMessage(`${body.entitlements.plan}. Blue Tick ${body.entitlements.premiumBlueTick ? 'on' : 'waits for identity verification'}. Advertisements still apply.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Could not start Premium');
    }
  }
  return (
    <Screen>
      <Title>Premium</Title>
      <Muted>{message}</Muted>
      <Button label="₹499 monthly" onPress={() => subscribe('MONTH')} />
      <Button label="₹5,000 yearly" onPress={() => subscribe('YEAR')} />
      {features.map((feature) => <Card key={feature.key}><Muted>{feature.key}: {feature.state === 'coming_soon' ? 'Coming soon' : feature.state}</Muted></Card>)}
    </Screen>
  );
}
