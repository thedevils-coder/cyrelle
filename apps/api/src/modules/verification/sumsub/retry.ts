export interface RetryDecisionInput {
  status: string;
  canRetry: boolean;
  retryCount: number;
  maxRetries: number;
}

export type RetryDenial = 'verified' | 'in_progress' | 'manual_review' | 'restricted' | 'limit' | 'provider';

export function retryDecision(input: RetryDecisionInput): { allowed: boolean; reason?: RetryDenial } {
  if (input.status === 'VERIFIED') return { allowed: false, reason: 'verified' };
  if (input.status === 'MANUAL_REVIEW') return { allowed: false, reason: 'manual_review' };
  if (input.status === 'RESTRICTED') return { allowed: false, reason: 'restricted' };
  if (input.status === 'IN_PROGRESS' || input.status === 'SUBMITTED' || input.status === 'PENDING' || input.status === 'NOT_STARTED') {
    return { allowed: false, reason: 'in_progress' };
  }
  if (input.status !== 'FAILED' && input.status !== 'EXPIRED') {
    return { allowed: false, reason: 'provider' };
  }
  if (!input.canRetry) return { allowed: false, reason: 'provider' };
  if (input.retryCount >= input.maxRetries) return { allowed: false, reason: 'limit' };
  return { allowed: true };
}

export function retryDenialMessage(reason: RetryDenial | undefined): string {
  switch (reason) {
    case 'limit':
      return "You've used the available verification attempts. Contact support if you still need help.";
    case 'restricted':
    case 'provider':
      return 'Your verification status requires further attention.';
    case 'verified':
      return 'Your identity verification is complete.';
    case 'manual_review':
      return "Your verification is being reviewed. We'll notify you when it's complete.";
    default:
      return 'Verification is already in progress.';
  }
}
