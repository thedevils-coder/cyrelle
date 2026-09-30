import { useState } from 'react';
import { api } from '../../src/api';
import { Button, Field, Muted, Screen, Title } from '../../src/ui';

export default function Create() {
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');
  async function post() {
    try {
      await api('/v1/posts', { method: 'POST', body: JSON.stringify({ body, hashtags: ['cyrelle'] }) });
      setMessage('Posted.');
      setBody('');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Could not post');
    }
  }
  async function story() {
    try {
      await api('/v1/stories', { method: 'POST', body: JSON.stringify({ kind: 'TEXT', text: body || 'Hello from Cyrelle' }) });
      setMessage('Story is live for 24 hours.');
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Could not create the story');
    }
  }
  async function caption() {
    try {
      const result = await api<{ caption: string }>('/v1/ai/captions', { method: 'POST', body: JSON.stringify({ topic: body || 'a calm morning', tone: 'friendly', length: 'short', language: 'en' }) });
      setBody(result.caption);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'AI is unavailable');
    }
  }
  return (
    <Screen>
      <Title>Create</Title>
      <Muted>Post, story, or ask for a caption. Basic includes standard AI. Premium adds more tones and length.</Muted>
      <Field label="What do you want to share?" value={body} onChangeText={setBody} />
      <Button label="Post" onPress={post} />
      <Button label="Story" onPress={story} />
      <Button label="Write a caption" onPress={caption} />
      {message ? <Muted>{message}</Muted> : null}
    </Screen>
  );
}
