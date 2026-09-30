import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

export async function token(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem('cyrelle_token');
  return SecureStore.getItemAsync('cyrelle_token');
}

export async function setToken(value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (value) localStorage.setItem('cyrelle_token', value);
    else localStorage.removeItem('cyrelle_token');
    return;
  }
  if (value) await SecureStore.setItemAsync('cyrelle_token', value);
  else await SecureStore.deleteItemAsync('cyrelle_token');
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const auth = await token();
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || 'Something went wrong. Please try again.';
    throw new Error(message);
  }
  return body as T;
}

export { API };
