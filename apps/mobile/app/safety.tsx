import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { api } from '../src/api';
import { Button, Card, Muted, Screen, Title } from '../src/ui';

type Config = { emergencyNumbers: Array<{ label: string; number: string }>; limitations: string[]; settings: { shakeSosEnabled: boolean; autoSosEnabled: boolean } };

export default function Safety() {
  const [config, setConfig] = useState<Config | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { api<Config>('/v1/safety/config').then(setConfig).catch((reason: Error) => setMessage(reason.message)); }, []);
  async function enableShake() {
    await api('/v1/me/settings', { method: 'PATCH', body: JSON.stringify({ shakeSosEnabled: true, sosCountdownMs: 5000 }) });
    setMessage('Shake SOS is on. A shake starts a 5 second countdown you can cancel.');
  }
  async function sos() {
    const event = await api<{ event: { id: string } }>('/v1/safety/sos', { method: 'POST', body: JSON.stringify({ source: 'BUTTON' }) });
    setMessage('Countdown started. Cancel it, or wait and confirm activation. Cyrelle will not silently call or text.');
    setTimeout(() => {
      api(`/v1/safety/sos/${event.event.id}/activate`, { method: 'POST' }).then(() => setMessage('SOS recorded. Contacts with an email were notified. A phone call still depends on your device.')).catch((reason: Error) => setMessage(reason.message));
    }, 5200);
  }
  return (
    <Screen>
      <Title>Safety Hub</Title>
      <Muted>Emergency numbers follow your country. Your own phone number is not required.</Muted>
      {(config?.emergencyNumbers || []).map((item) => <Card key={item.number}><Text style={{ color: 'white' }}>{item.label}</Text><Muted>{item.number}</Muted></Card>)}
      {(config?.limitations || []).map((line) => <Muted key={line}>{line}</Muted>)}
      <Button label="Enable Shake SOS" onPress={enableShake} />
      <Button label="SOS" onPress={sos} />
      {message ? <Muted>{message}</Muted> : null}
    </Screen>
  );
}
