import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../src/api';
import { Button, Card, Field, Muted, Screen, Title } from '../../src/ui';

export default function Explore() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ businesses?: Array<{ id: string; name: string; username: string; city?: string; blueTickVisible?: boolean }> } | null>(null);
  useEffect(() => {
    api<Array<{ id: string; name: string; username: string; city?: string; blueTickVisible?: boolean }>>('/v1/businesses').then((rows) => setResults({ businesses: rows })).catch(() => setResults(null));
  }, []);
  async function search() {
    const body = await api<{ businesses: Array<{ id: string; name: string; username: string; city?: string; blueTickVisible?: boolean }> }>(`/v1/search?q=${encodeURIComponent(query)}`);
    setResults(body);
  }
  return (
    <Screen>
      <ScrollView>
        <Title>Explore</Title>
        <Field label="Search people, businesses, services" value={query} onChangeText={setQuery} />
        <Button label="Search" onPress={search} />
        {(results?.businesses || []).map((business) => (
          <Card key={business.id}>
            <Text style={{ color: 'white', fontSize: 18 }}>{business.name}{business.blueTickVisible ? ' ✓' : ''}</Text>
            <Muted>@{business.username} · {business.city}</Muted>
            <Button label="View business" onPress={() => router.push(`/business/${business.username}`)} />
          </Card>
        ))}
        {!results?.businesses?.length ? <Muted>Try a name, business, hashtag, or service.</Muted> : null}
      </ScrollView>
    </Screen>
  );
}
