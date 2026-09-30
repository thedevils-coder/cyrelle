import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { api } from '../../src/api';
import { Card, Muted, Screen, Title } from '../../src/ui';

type Row = { id: string; status: string; startsAt: string; service?: { name: string; priceMinor: number; currency: string }; business?: { name: string }; payment?: { commissionMinor: number; businessMinor: number; grossMinor: number } };

export default function Appointments() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Row[]>('/v1/appointments').then(setRows).catch((reason: Error) => setError(reason.message));
  }, []);
  return (
    <Screen>
      <ScrollView>
        <Title>Appointments</Title>
        <Muted>Cyrelle retains 15% when an eligible booking is completed. The amount is calculated on the server.</Muted>
        {error ? <Muted>{error}</Muted> : null}
        {!rows.length && !error ? <Muted>No appointments yet. Discover a service and book a time.</Muted> : null}
        {rows.map((row) => (
          <Card key={row.id}>
            <Text style={{ color: 'white' }}>{row.service?.name} · {row.business?.name}</Text>
            <Muted>{row.status} · {new Date(row.startsAt).toLocaleString()}</Muted>
            {row.payment ? <Muted>Gross {row.payment.grossMinor} · Cyrelle {row.payment.commissionMinor} · Business {row.payment.businessMinor}</Muted> : null}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
