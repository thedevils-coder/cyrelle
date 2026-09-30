import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { api } from '../../src/api';
import { Card, Muted, Screen, Title } from '../../src/ui';

type Business = { name: string; description?: string; city?: string; blueTickVisible?: boolean; tier?: string; services?: Array<{ id: string; name: string; priceMinor: number; currency: string }> };

export default function BusinessProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const [business, setBusiness] = useState<Business | null>(null);
  useEffect(() => {
    if (!username) return;
    api<Business>(`/v1/businesses/by/${username}`).then(setBusiness).catch(() => setBusiness(null));
  }, [username]);
  return (
    <Screen>
      <Title>{business?.name || 'Business'}</Title>
      <Muted>{business?.blueTickVisible ? 'Business Blue Tick' : 'Standard business profile · free'} · {business?.city}</Muted>
      <Muted>{business?.description}</Muted>
      {(business?.services || []).map((service) => (
        <Card key={service.id}><Text style={{ color: 'white' }}>{service.name}</Text><Muted>{service.priceMinor} {service.currency}</Muted></Card>
      ))}
    </Screen>
  );
}
