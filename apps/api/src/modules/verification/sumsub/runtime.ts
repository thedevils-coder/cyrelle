import { SumsubClient } from '../providers/sumsub.client';

export interface SumsubRuntimeInput {
  appToken: string;
  secretKey: string;
  webhookSecret: string;
  environment: string;
  baseUrl: string;
  nodeEnv: string;
  allowProduction: boolean;
}

export interface SumsubRuntimeDecision {
  configured: boolean;
  reason: string;
  logLevel: 'warn' | 'error';
  client: SumsubClient | null;
  baseUrl: string;
}

const DEFAULT_BASE_URL = 'https://api.sumsub.com';

/**
 * Decides whether Cyrelle may call Sumsub.
 * Missing credentials leave the rest of the app running.
 * Tests cannot target api.sumsub.com, and production tokens stay off unless
 * the process is production or ALLOW_SUMSUB_PRODUCTION is explicitly set.
 */
export function resolveSumsubRuntime(input: SumsubRuntimeInput, fetchImpl?: typeof fetch): SumsubRuntimeDecision {
  const appToken = input.appToken.trim();
  const secretKey = input.secretKey.trim();
  const webhookSecret = input.webhookSecret.trim();
  const environment = (input.environment.trim() || 'sandbox').toLowerCase();
  const nodeEnv = (input.nodeEnv || 'development').toLowerCase();
  const baseUrl = (input.baseUrl.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');

  const blocked = (reason: string, logLevel: 'warn' | 'error' = 'error'): SumsubRuntimeDecision => ({
    configured: false,
    reason,
    logLevel,
    client: null,
    baseUrl,
  });

  if (!appToken || !secretKey || !webhookSecret) {
    return blocked('missing_credentials', environment === 'production' ? 'error' : 'warn');
  }

  let host = '';
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return blocked('invalid_base_url');
    host = url.hostname;
  } catch {
    return blocked('invalid_base_url');
  }

  if (nodeEnv === 'test' && host === 'api.sumsub.com') {
    return blocked('test_blocked_live_host');
  }

  if (environment === 'production' && nodeEnv !== 'production' && !input.allowProduction) {
    return blocked('production_blocked_outside_production');
  }

  return {
    configured: true,
    reason: 'configured',
    logLevel: 'warn',
    client: new SumsubClient({ appToken, secretKey, baseUrl, fetchImpl }),
    baseUrl,
  };
}
