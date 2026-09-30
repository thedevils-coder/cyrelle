const RESERVED = new Set([
  'admin',
  'administrator',
  'cyrelle',
  'support',
  'help',
  'safety',
  'sos',
  'official',
  'root',
  'moderator',
  'moderation',
  'null',
  'undefined',
  'api',
  'www',
  'business',
  'premium',
  'billing',
  'payments',
  'security',
  'verification',
  'staff',
  'team',
  'everyone',
  'here',
]);

export type UsernameResult = { ok: true; username: string } | { ok: false; code: 'USERNAME_INVALID' | 'USERNAME_RESERVED' };

export function validateUsername(raw: string): UsernameResult {
  const username = raw.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,29}$/.test(username)) {
    return { ok: false, code: 'USERNAME_INVALID' };
  }
  if (RESERVED.has(username)) return { ok: false, code: 'USERNAME_RESERVED' };
  return { ok: true, username };
}
