import { MoneyError, assertMinorAmount } from './money';

/** Default Cyrelle appointment commission: 15% = 1500 basis points. */
export const DEFAULT_COMMISSION_BPS = 1500;

export interface CommissionInput {
  grossMinor: number;
  currency: string;
  /** Basis points. 1500 = 15%. Ignored when omitted; never taken from a client payload by callers. */
  commissionBps?: number;
  feeMinor?: number;
  taxMinor?: number;
}

export interface CommissionResult {
  grossMinor: number;
  currency: string;
  commissionBps: number;
  commissionMinor: number;
  feeMinor: number;
  taxMinor: number;
  businessMinor: number;
}

/**
 * Server-side appointment settlement.
 * Commission is rounded half-up to the nearest minor unit.
 * Client-supplied commission values must never be passed into this function.
 */
export function calculateAppointmentCommission(input: CommissionInput): CommissionResult {
  assertMinorAmount(input.grossMinor, 'grossMinor');
  const currency = input.currency?.trim().toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    throw new MoneyError('INVALID_CURRENCY', 'currency must be a 3-letter ISO code');
  }
  const commissionBps = input.commissionBps ?? DEFAULT_COMMISSION_BPS;
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10_000) {
    throw new MoneyError('INVALID_COMMISSION', 'commissionBps must be an integer between 0 and 10000');
  }
  const feeMinor = input.feeMinor ?? 0;
  const taxMinor = input.taxMinor ?? 0;
  assertMinorAmount(feeMinor, 'feeMinor');
  assertMinorAmount(taxMinor, 'taxMinor');

  const commissionMinor = Math.round((input.grossMinor * commissionBps) / 10_000);
  const businessMinor = input.grossMinor - commissionMinor - feeMinor - taxMinor;
  if (businessMinor < 0) {
    throw new MoneyError('NEGATIVE_BUSINESS_AMOUNT', 'fees and tax exceed the amount payable to the business');
  }

  return {
    grossMinor: input.grossMinor,
    currency,
    commissionBps,
    commissionMinor,
    feeMinor,
    taxMinor,
    businessMinor,
  };
}
