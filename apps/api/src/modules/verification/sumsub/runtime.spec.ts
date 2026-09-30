import { resolveSumsubRuntime } from './runtime';
import { redactSumsubRoute } from '../providers/sumsub.client';

const configured = {
  appToken: 'sandbox-app-token',
  secretKey: 'sandbox-secret-key',
  webhookSecret: 'sandbox-webhook-secret',
  environment: 'sandbox',
  baseUrl: 'http://127.0.0.1:9',
  nodeEnv: 'test',
  allowProduction: false,
};

describe('Sumsub runtime guards', () => {
  it('accepts sandbox credentials aimed at a non-routable test host', () => {
    expect(resolveSumsubRuntime(configured).configured).toBe(true);
  });

  it('refuses the live Sumsub host from tests and production tokens outside production', () => {
    expect(resolveSumsubRuntime({ ...configured, baseUrl: 'https://api.sumsub.com' })).toMatchObject({
      configured: false,
      reason: 'test_blocked_live_host',
      logLevel: 'error',
    });
    expect(resolveSumsubRuntime({ ...configured, environment: 'production', nodeEnv: 'development' })).toMatchObject({
      configured: false,
      reason: 'production_blocked_outside_production',
    });
    expect(resolveSumsubRuntime({ ...configured, environment: 'production', nodeEnv: 'production', baseUrl: 'https://api.sumsub.com' }).configured).toBe(true);
    expect(resolveSumsubRuntime({ ...configured, environment: 'production', nodeEnv: 'development', allowProduction: true }).configured).toBe(true);
  });

  it('stays inactive without crashing when credentials are missing', () => {
    expect(resolveSumsubRuntime({ ...configured, webhookSecret: '' })).toMatchObject({
      configured: false,
      reason: 'missing_credentials',
      logLevel: 'warn',
    });
    expect(resolveSumsubRuntime({ ...configured, appToken: '', environment: 'production', nodeEnv: 'production' })).toMatchObject({
      configured: false,
      reason: 'missing_credentials',
      logLevel: 'error',
    });
  });

  it('redacts applicant identifiers from Sumsub paths', () => {
    const route = redactSumsubRoute('/resources/applicants/-;externalUserId=user-123/one?levelName=basic-kyc-level');
    expect(route).toBe('/resources/applicants/:id/one');
    expect(route).not.toContain('user-123');
    expect(redactSumsubRoute('/resources/applicants/applicant-abc/presence/deactivated')).toBe('/resources/applicants/:id/presence/deactivated');
  });
});
