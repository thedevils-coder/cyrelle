import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../src/api';
import { Button, Card, Muted, Screen, Title } from '../../src/ui';

type Feed = { items: Array<{ id: string; body?: string; author?: { displayName?: string; blueTick?: boolean }; likes: number }>; ads: Array<{ id: string; label: string; title: string; body: string }> };

export default function Home() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Feed>('/v1/feed').then(setFeed).catch((reason: Error) => setError(reason.message));
  }, []);
  return (
    <Screen>
      <ScrollView>
        <Title>Home</Title>
        <Muted>Stories, posts, and clearly labeled ads.</Muted>
        {error ? <Muted>{error}</Muted> : null}
        {!feed?.items.length && !error ? <Card><Muted>Your feed is quiet. Follow women and businesses you want to see.</Muted><Button label="Explore" onPress={() => router.push('/(tabs)/explore')} /></Card> : null}
        {feed?.ads.map((ad) => (
          <Card key={ad.id}><Text style={{ color: '#f2b8c8' }}>{ad.label}</Text><Text style={{ color: 'white', fontSize: 18 }}>{ad.title}</Text><Muted>{ad.body}</Muted></Card>
        ))}
        {feed?.items.map((post) => (
          <Card key={post.id}>
            <Text style={{ color: 'white' }}>{post.author?.displayName}{post.author?.blueTick ? ' ✓' : ''}</Text>
            <Muted>{post.body}</Muted>
            <Text style={{ color: '#a7a7b0' }}>{post.likes} likes</Text>
          </Card>
        ))}
        <Button label="Safety Hub" onPress={() => router.push('/safety')} />
      </ScrollView>
    </Screen>
  );
}
