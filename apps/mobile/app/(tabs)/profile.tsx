import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { api, setToken } from '../../src/api';
import { Button, Card, Muted, Screen, Title } from '../../src/ui';

type Me = { email: string; plan: string; blueTick: boolean; premiumBlueTick: boolean; profile?: { displayName: string; username: string; bio?: string }; businesses?: Array<{ name: string; tier: string; username: string }> };

export default function Profile() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { api<Me>('/v1/me').then(setMe).catch(() => setMe(null)); }, []);
  return (
    <Screen>
      <Title>{me?.profile?.displayName || 'Profile'}</Title>
      <Muted>@{me?.profile?.username} · {me?.plan}{me?.blueTick ? ' · Blue Tick' : ''}</Muted>
      <Card><Muted>{me?.profile?.bio || 'Add a bio from settings.'}</Muted><Text style={{ color: '#f2b8c8' }}>{me?.plan === 'PREMIUM' ? 'Premium includes ads.' : 'Basic is free and includes ads.'}</Text></Card>
      {(me?.businesses || []).map((business) => <Card key={business.username}><Text style={{ color: 'white' }}>{business.name}</Text><Muted>{business.tier === 'BLUE_TICK' ? 'Business Blue Tick' : 'Standard business · free'}</Muted></Card>)}
      <Button label="Premium" onPress={() => router.push('/premium')} />
      <Button label="Safety Hub" onPress={() => router.push('/safety')} />
      <Button label="Sign out" onPress={async () => { await setToken(null); router.replace('/'); }} />
    </Screen>
  );
}
