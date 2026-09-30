import { useEffect, useState } from 'react';

let hidden = false;
const listeners = new Set<(value: boolean) => void>();

export function hideLaunchSplash() {
  if (hidden) return;
  hidden = true;
  listeners.forEach((listener) => listener(true));
}

export function useLaunchSplashHidden() {
  const [value, setValue] = useState(hidden);
  useEffect(() => {
    setValue(hidden);
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
