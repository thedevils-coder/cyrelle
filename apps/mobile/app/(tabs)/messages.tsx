import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { api } from '../../src/api';
import { Card, Muted, Screen, Title } from '../../src/ui';

type Conversation = { id: string; title?: string; lastMessage?: { body?: string } | null; members: Array<{ displayName?: string }> };

export default function Messages() {
  const [rows, setRows] = useState<Conversation[]>([]);
  useEffect(() => { api<Conversation[]>('/v1/conversations').then(setRows).catch(() => setRows([])); }, []);
  return (
    <Screen>
      <Title>Messages</Title>
      {!rows.length ? <Muted>No messages yet. Start a conversation when you are ready.</Muted> : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text style={{ color: 'white' }}>{row.members.map((member) => member.displayName).filter(Boolean).join(', ')}</Text>
          <Muted>{row.lastMessage?.body || 'No messages yet'}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
