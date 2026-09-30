export interface EmergencyNumber {
  label: string;
  number: string;
  voice: boolean;
  sms: boolean;
}

export type SosSource = 'BUTTON' | 'SHAKE' | 'AUTO';

export interface SafetySettings {
  shakeSosEnabled: boolean;
  autoSosEnabled: boolean;
  countdownMs: number;
}

export type ShakeSosPhase = 'disabled' | 'idle' | 'countdown' | 'cancelled' | 'activate';

/**
 * Shake SOS is a client gesture plus a server-side countdown.
 * The server decides activation. Five seconds is the default window.
 */
export function evaluateShakeSos(input: {
  enabled: boolean;
  cancelled: boolean;
  startedAtMs: number | null;
  nowMs: number;
  countdownMs?: number;
}): ShakeSosPhase {
  if (!input.enabled) return 'disabled';
  if (input.cancelled) return 'cancelled';
  if (input.startedAtMs == null) return 'idle';
  const countdownMs = input.countdownMs ?? 5000;
  if (input.nowMs - input.startedAtMs < countdownMs) return 'countdown';
  return 'activate';
}

export function assertSosSourceAllowed(settings: SafetySettings, source: SosSource): void {
  if (source === 'SHAKE' && !settings.shakeSosEnabled) {
    throw new EmergencyError('SHAKE_SOS_DISABLED', 'Shake SOS is turned off for this account');
  }
  if (source === 'AUTO' && !settings.autoSosEnabled) {
    throw new EmergencyError('AUTO_SOS_DISABLED', 'Auto SOS is turned off for this account');
  }
}

export class EmergencyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EmergencyError';
  }
}

export const SAFETY_LIMITATIONS = [
  'Cyrelle records a timestamped emergency event and can notify the emergency contacts you added.',
  'Starting a phone call or sending an SMS depends on the device operating system and local carriers. Cyrelle does not silently send SMS or place calls in the background.',
  'Live location sharing continues only while the app is allowed to access location and the operating system keeps the app running.',
  'Auto SOS runs only after you explicitly enable it. Cyrelle cannot detect every emergency.',
  'Official emergency numbers are country-specific and can be updated by Cyrelle administrators.',
] as const;
