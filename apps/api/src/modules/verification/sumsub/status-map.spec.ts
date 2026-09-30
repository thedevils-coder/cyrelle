import { mapSumsubStatus, parseSumsubTimestamp, safeRejectLabels } from './status-map';

describe('Sumsub status mapping', () => {
  it('maps approved, pending, review, retry rejection, and final rejection', () => {
    expect(mapSumsubStatus({ type: 'applicantReviewed', reviewStatus: 'completed', reviewAnswer: 'GREEN' })).toEqual({
      status: 'VERIFIED',
      canRetry: false,
    });
    expect(mapSumsubStatus({ type: 'applicantPending', reviewStatus: 'pending' })?.status).toBe('SUBMITTED');
    expect(mapSumsubStatus({ type: 'applicantOnHold', reviewStatus: 'onHold' })?.status).toBe('MANUAL_REVIEW');
    expect(mapSumsubStatus({ type: 'applicantReviewed', reviewStatus: 'completed', reviewAnswer: 'RED', reviewRejectType: 'RETRY' })).toEqual({
      status: 'FAILED',
      canRetry: true,
    });
    expect(mapSumsubStatus({ type: 'applicantReviewed', reviewStatus: 'completed', reviewAnswer: 'RED', reviewRejectType: 'FINAL' })).toEqual({
      status: 'RESTRICTED',
      canRetry: false,
    });
    expect(mapSumsubStatus({ reviewStatus: 'init' })?.status).toBe('IN_PROGRESS');
    expect(mapSumsubStatus({ type: 'applicantPersonalInfoChanged' })).toBeNull();
  });

  it('parses Sumsub UTC timestamps and keeps only reject-label codes', () => {
    expect(parseSumsubTimestamp('2020-02-21 13:23:19.111')?.toISOString()).toBe('2020-02-21T13:23:19.111Z');
    expect(safeRejectLabels(['BAD_PROOF_OF_IDENTITY'])).toBe('BAD_PROOF_OF_IDENTITY');
    expect(safeRejectLabels('AB1234567')).toBeNull();
  });
});
