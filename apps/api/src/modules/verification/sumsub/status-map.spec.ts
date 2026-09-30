import { canApplyVerificationTransition, mapSumsubStatus, parseSumsubTimestamp, safeRejectLabels } from './status-map';

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

  it('rejects downgrades and cancelled revival, and still accepts later final results', () => {
    expect(canApplyVerificationTransition('VERIFIED', 'IN_PROGRESS', 'applicantCreated')).toBe(false);
    expect(canApplyVerificationTransition('VERIFIED', 'SUBMITTED', 'applicantPending')).toBe(false);
    expect(canApplyVerificationTransition('RESTRICTED', 'IN_PROGRESS', 'applicantCreated')).toBe(false);
    expect(canApplyVerificationTransition('RESTRICTED', 'FAILED', 'applicantReviewed')).toBe(true);
    expect(canApplyVerificationTransition('VERIFIED', 'FAILED', 'applicantReviewed')).toBe(true);
    expect(canApplyVerificationTransition('VERIFIED', 'RESTRICTED', 'applicantReviewed')).toBe(true);
    expect(canApplyVerificationTransition('FAILED', 'VERIFIED', 'applicantReviewed')).toBe(true);
    expect(canApplyVerificationTransition('FAILED', 'SUBMITTED', 'applicantPending')).toBe(true);
    expect(canApplyVerificationTransition('VERIFIED', 'IN_PROGRESS', 'applicantReset')).toBe(true);
    expect(canApplyVerificationTransition('CANCELLED', 'IN_PROGRESS', 'applicantReset')).toBe(false);
    expect(canApplyVerificationTransition('VERIFIED', 'CANCELLED', 'applicantDeleted')).toBe(true);
    expect(canApplyVerificationTransition('MANUAL_REVIEW', 'SUBMITTED', 'applicantPending')).toBe(false);
  });

  it('parses Sumsub UTC timestamps and keeps only reject-label codes', () => {
    expect(parseSumsubTimestamp('2020-02-21 13:23:19.111')?.toISOString()).toBe('2020-02-21T13:23:19.111Z');
    expect(safeRejectLabels(['BAD_PROOF_OF_IDENTITY'])).toBe('BAD_PROOF_OF_IDENTITY');
    expect(safeRejectLabels('AB1234567')).toBeNull();
  });
});
