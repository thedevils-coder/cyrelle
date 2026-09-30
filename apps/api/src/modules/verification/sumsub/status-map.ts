export const CYRELLE_VERIFICATION_STATUSES = [
  'NOT_STARTED',
  'PENDING',
  'IN_PROGRESS',
  'SUBMITTED',
  'VERIFIED',
  'FAILED',
  'MANUAL_REVIEW',
  'RESTRICTED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type CyrelleVerificationStatus = (typeof CYRELLE_VERIFICATION_STATUSES)[number];

export interface SumsubStatusInput {
  type?: string | null;
  reviewStatus?: string | null;
  reviewAnswer?: string | null;
  reviewRejectType?: string | null;
}

export interface MappedVerificationStatus {
  status: CyrelleVerificationStatus;
  canRetry: boolean;
}

const OPEN_FOR_PROGRESS = new Set(['NOT_STARTED', 'PENDING', 'IN_PROGRESS', 'FAILED', 'EXPIRED']);
const OPEN_FOR_SUBMITTED = new Set(['NOT_STARTED', 'PENDING', 'IN_PROGRESS', 'SUBMITTED', 'FAILED', 'EXPIRED']);
const OPEN_FOR_REVIEW = new Set(['NOT_STARTED', 'PENDING', 'IN_PROGRESS', 'SUBMITTED', 'FAILED', 'EXPIRED', 'MANUAL_REVIEW']);

/**
 * A signed webhook may move the check forward or replace a finished result with a later
 * Sumsub decision. It must not let an in-progress event erase VERIFIED, RESTRICTED, or
 * MANUAL_REVIEW, and it must not revive a cancelled check. applicantReset is the
 * explicit exception that returns a live check to IN_PROGRESS.
 */
export function canApplyVerificationTransition(current: string, next: string, eventType?: string | null): boolean {
  if (current === next) return true;
  if (current === 'CANCELLED') return false;
  const type = eventType?.trim() || '';
  if (type === 'applicantDeleted' || type === 'applicantDeactivated') return next === 'CANCELLED';
  if (next === 'CANCELLED') return false;
  if (type === 'applicantReset') return next === 'IN_PROGRESS';
  if (next === 'VERIFIED' || next === 'FAILED' || next === 'RESTRICTED') return true;
  if (next === 'MANUAL_REVIEW') return OPEN_FOR_REVIEW.has(current);
  if (next === 'SUBMITTED') return OPEN_FOR_SUBMITTED.has(current);
  if (next === 'IN_PROGRESS' || next === 'PENDING') return OPEN_FOR_PROGRESS.has(current);
  return false;
}

/**
 * Maps current Sumsub review statuses and user-verification webhook types
 * onto Cyrelle statuses. Sumsub names stay inside this file.
 * https://docs.sumsub.com/docs/applicant-statuses
 * https://docs.sumsub.com/docs/user-verification-webhooks
 */
export function mapSumsubStatus(input: SumsubStatusInput): MappedVerificationStatus | null {
  const type = input.type?.trim() || '';
  const reviewStatus = input.reviewStatus?.trim() || '';
  const answer = input.reviewAnswer?.trim().toUpperCase() || '';
  const rejectType = input.reviewRejectType?.trim().toUpperCase() || '';

  if (type === 'applicantPersonalInfoChanged' || type === 'applicantLevelChanged' || type === 'applicantTagsChanged') {
    return null;
  }
  if (type === 'applicantDeleted' || type === 'applicantDeactivated') {
    return { status: 'CANCELLED', canRetry: false };
  }
  if (type === 'applicantReset') {
    return { status: 'IN_PROGRESS', canRetry: true };
  }
  if (type === 'applicantOnHold' || reviewStatus === 'onHold') {
    return { status: 'MANUAL_REVIEW', canRetry: false };
  }

  const completed = type === 'applicantReviewed' || type === 'applicantWorkflowCompleted' || reviewStatus === 'completed';
  if (completed && answer === 'GREEN') {
    return { status: 'VERIFIED', canRetry: false };
  }
  if (completed && answer === 'RED') {
    if (rejectType === 'FINAL') return { status: 'RESTRICTED', canRetry: false };
    return { status: 'FAILED', canRetry: true };
  }
  if (type === 'applicantWorkflowFailed') {
    if (rejectType === 'FINAL') return { status: 'RESTRICTED', canRetry: false };
    return { status: 'FAILED', canRetry: true };
  }

  if (type === 'applicantPending' || reviewStatus === 'pending' || reviewStatus === 'queued' || reviewStatus === 'prechecked') {
    return { status: 'SUBMITTED', canRetry: false };
  }
  if (
    type === 'applicantCreated' ||
    type === 'applicantAwaitingUser' ||
    type === 'applicantAwaitingService' ||
    reviewStatus === 'init' ||
    reviewStatus === 'awaitingUser' ||
    reviewStatus === 'awaitingService'
  ) {
    return { status: 'IN_PROGRESS', canRetry: true };
  }
  return null;
}

/** Sumsub createdAtMs values are UTC, for example "2020-02-21 13:23:19.111". */
export function parseSumsubTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?/);
  if (!match) return null;
  const date = new Date(`${match[1]}T${match[2]}${match[3] ?? '.000'}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Keep only Sumsub reject-label codes. Drop free-text comments that can contain document data. */
export function safeRejectLabels(labels: unknown): string | null {
  if (!Array.isArray(labels)) return null;
  const cleaned = labels
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 64))
    .filter(Boolean)
    .slice(0, 8);
  if (!cleaned.length) return null;
  return cleaned.join(',').slice(0, 240);
}

export function verificationUserMessage(status: string): { title: string; body: string } | null {
  switch (status) {
    case 'VERIFIED':
      return { title: 'Identity verification', body: 'Your identity verification is complete.' };
    case 'FAILED':
      return {
        title: 'Identity verification',
        body: 'Your identity verification could not be completed. Please review the instructions and try again.',
      };
    case 'MANUAL_REVIEW':
      return { title: 'Identity verification', body: "Your verification is being reviewed. We'll notify you when it's complete." };
    case 'RESTRICTED':
      return { title: 'Identity verification', body: 'Your verification status requires further attention.' };
    default:
      return null;
  }
}

export function auditActionForStatus(status: string, retry: boolean): string {
  if (retry) return 'IDENTITY_VERIFICATION_RETRY';
  switch (status) {
    case 'IN_PROGRESS':
    case 'PENDING':
      return 'IDENTITY_VERIFICATION_STARTED';
    case 'SUBMITTED':
      return 'IDENTITY_VERIFICATION_SUBMITTED';
    case 'VERIFIED':
      return 'IDENTITY_VERIFICATION_VERIFIED';
    case 'FAILED':
      return 'IDENTITY_VERIFICATION_FAILED';
    case 'MANUAL_REVIEW':
      return 'IDENTITY_VERIFICATION_MANUAL_REVIEW';
    case 'RESTRICTED':
      return 'IDENTITY_VERIFICATION_RESTRICTED';
    default:
      return 'IDENTITY_VERIFICATION_STARTED';
  }
}
