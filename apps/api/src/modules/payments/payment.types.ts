export interface ChargeInput {
  amountMinor: number;
  currency: string;
  customerEmail: string;
  description: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}

export interface ChargeResult {
  status: 'SUCCEEDED' | 'REQUIRES_ACTION' | 'FAILED';
  providerRef: string;
  clientSecret?: string | null;
}

export interface RefundResult {
  status: 'REFUNDED' | 'FAILED';
  providerRef: string;
}

export interface SubscriptionChargeInput extends ChargeInput {
  interval: 'MONTH' | 'YEAR';
}

export interface WebhookEvent {
  type: string;
  providerRef?: string;
  status?: string;
  metadata?: Record<string, string>;
}

export interface PaymentProvider {
  readonly code: string;
  createCharge(input: ChargeInput): Promise<ChargeResult>;
  refund(providerRef: string, amountMinor: number, currency: string): Promise<RefundResult>;
  createSubscription(input: SubscriptionChargeInput): Promise<ChargeResult>;
  cancelSubscription(providerRef: string): Promise<void>;
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): WebhookEvent | null;
}
