/** ISO 4217 minor-unit exponents. Unknown currencies default to 2. */
const EXPONENTS: Record<string, number> = {
  BHD: 3,
  JPY: 0,
  KWD: 3,
  KRW: 0,
  OMR: 3,
  TND: 3,
  USD: 2,
  EUR: 2,
  GBP: 2,
  INR: 2,
  AED: 2,
  SGD: 2,
  BRL: 2,
  NGN: 2,
  AUD: 2,
  CAD: 2,
  MXN: 2,
  ZAR: 2,
  SEK: 2,
};

export function currencyExponent(currency: string): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2;
}

export function assertMinorAmount(amountMinor: number, field = 'amount'): void {
  if (!Number.isInteger(amountMinor) || amountMinor < 0 || amountMinor > 2_000_000_000) {
    throw new MoneyError('INVALID_AMOUNT', `${field} must be a non-negative integer in minor units`);
  }
}

export class MoneyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function formatMoney(amountMinor: number, currency: string, locale = 'en'): string {
  assertMinorAmount(amountMinor);
  const code = currency.toUpperCase();
  const exponent = currencyExponent(code);
  const major = amountMinor / 10 ** exponent;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    currencyDisplay: 'symbol',
  }).format(major);
}

export interface Money {
  amountMinor: number;
  currency: string;
}
