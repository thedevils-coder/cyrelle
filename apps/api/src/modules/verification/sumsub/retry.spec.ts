import { retryDecision } from './retry';

describe('verification retries', () => {
  const base = { canRetry: true, retryCount: 0, maxRetries: 2 };

  it('allows a failed check until the configured limit', () => {
    expect(retryDecision({ ...base, status: 'FAILED' }).allowed).toBe(true);
    expect(retryDecision({ ...base, status: 'FAILED', retryCount: 2 }).reason).toBe('limit');
    expect(retryDecision({ ...base, status: 'FAILED', canRetry: false }).reason).toBe('provider');
  });

  it('blocks verified, in-progress, manual review, and restricted records', () => {
    expect(retryDecision({ ...base, status: 'VERIFIED' }).reason).toBe('verified');
    expect(retryDecision({ ...base, status: 'IN_PROGRESS' }).reason).toBe('in_progress');
    expect(retryDecision({ ...base, status: 'MANUAL_REVIEW' }).reason).toBe('manual_review');
    expect(retryDecision({ ...base, status: 'RESTRICTED', canRetry: false }).reason).toBe('restricted');
  });
});