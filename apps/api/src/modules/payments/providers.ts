import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { verifyWebhook } from '../../common/crypto';
import { AppError } from '../../common/app-error';
import { ChargeInput, ChargeResult, PaymentProvider, RefundResult, SubscriptionChargeInput, WebhookEvent } from './payment.types';

export class TestPaymentProvider implements PaymentProvider {
  readonly code = 'test';
  constructor(private readonly secret: string) {}

  async createCharge(input: ChargeInput): Promise<ChargeResult> {
    return { status: 'SUCCEEDED', providerRef: `test_${input.idempotencyKey}` };
  }

  async refund(providerRef: string): Promise<RefundResult> {
    return { status: 'REFUNDED', providerRef: `refund_${providerRef}` };
  }

  async createSubscription(input: SubscriptionChargeInput): Promise<ChargeResult> {
    return this.createCharge(input);
  }

  async cancelSubscription(): Promise<void> {
    return undefined;
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): WebhookEvent | null {
    const signature = header(headers, 'x-cyrelle-signature');
    if (!signature || !verifyWebhook(this.secret, rawBody, signature)) return null;
    return JSON.parse(rawBody) as WebhookEvent;
  }
}

export class StripePaymentProvider implements PaymentProvider {
  readonly code = 'stripe';
  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {}

  async createCharge(input: ChargeInput): Promise<ChargeResult> {
    const body = new URLSearchParams({
      amount: String(input.amountMinor),
      currency: input.currency.toLowerCase(),
      description: input.description,
      receipt_email: input.customerEmail,
      'automatic_payment_methods[enabled]': 'true',
    });
    Object.entries(input.metadata).forEach(([key, value]) => body.append(`metadata[${key}]`, value));
    const payload = await this.request('/v1/payment_intents', body, input.idempotencyKey);
    return {
      status: payload.status === 'succeeded' ? 'SUCCEEDED' : 'REQUIRES_ACTION',
      providerRef: payload.id,
      clientSecret: payload.client_secret,
    };
  }

  async refund(providerRef: string, amountMinor: number): Promise<RefundResult> {
    const body = new URLSearchParams({ payment_intent: providerRef, amount: String(amountMinor) });
    const payload = await this.request('/v1/refunds', body, `refund_${providerRef}_${amountMinor}`);
    return { status: payload.status === 'failed' ? 'FAILED' : 'REFUNDED', providerRef: payload.id };
  }

  async createSubscription(input: SubscriptionChargeInput): Promise<ChargeResult> {
    return this.createCharge(input);
  }

  async cancelSubscription(providerRef: string): Promise<void> {
    await this.request(`/v1/subscriptions/${providerRef}`, new URLSearchParams({ cancel_at_period_end: 'true' }), `cancel_${providerRef}`, 'POST');
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): WebhookEvent | null {
    const signature = header(headers, 'stripe-signature');
    if (!signature || !verifyStripeSignature(this.webhookSecret, rawBody, signature)) return null;
    const event = JSON.parse(rawBody) as { type: string; data?: { object?: { id?: string; status?: string; metadata?: Record<string, string> } } };
    return {
      type: event.type,
      providerRef: event.data?.object?.id,
      status: event.data?.object?.status,
      metadata: event.data?.object?.metadata,
    };
  }

  private async request(path: string, body: URLSearchParams, idempotencyKey: string, method = 'POST') {
    const response = await fetch(`https://api.stripe.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
      body,
    });
    const payload = (await response.json()) as { id: string; status: string; client_secret?: string; error?: { message?: string } };
    if (!response.ok) {
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', payload.error?.message || 'The payment provider rejected the request');
    }
    return payload;
  }
}

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly code = 'razorpay';
  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {}

  async createCharge(input: ChargeInput): Promise<ChargeResult> {
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.idempotencyKey.slice(0, 40),
        notes: input.metadata,
      }),
    });
    const payload = (await response.json()) as { id?: string; error?: { description?: string } };
    if (!response.ok || !payload.id) {
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', payload.error?.description || 'The payment provider rejected the request');
    }
    return { status: 'REQUIRES_ACTION', providerRef: payload.id };
  }

  async refund(providerRef: string, amountMinor: number): Promise<RefundResult> {
    const response = await fetch(`https://api.razorpay.com/v1/payments/${providerRef}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: amountMinor }),
    });
    const payload = (await response.json()) as { id?: string };
    if (!response.ok || !payload.id) return { status: 'FAILED', providerRef };
    return { status: 'REFUNDED', providerRef: payload.id };
  }

  async createSubscription(input: SubscriptionChargeInput): Promise<ChargeResult> {
    return this.createCharge(input);
  }

  async cancelSubscription(): Promise<void> {
    return undefined;
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): WebhookEvent | null {
    const signature = header(headers, 'x-razorpay-signature');
    if (!signature) return null;
    const digest = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const expected = Buffer.from(digest);
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const event = JSON.parse(rawBody) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string; notes?: Record<string, string> } } } };
    const payment = event.payload?.payment?.entity;
    return { type: event.event || 'unknown', providerRef: payment?.order_id || payment?.id, status: payment?.status, metadata: payment?.notes };
  }
}

export function createPaymentProvider(config: ConfigService): PaymentProvider {
  const selected = (config.get<string>('PAYMENT_PROVIDER') || 'test').toLowerCase();
  if (selected === 'stripe') {
    const secret = config.get<string>('STRIPE_SECRET_KEY');
    if (!secret) throw new AppError(503, 'PROVIDER_NOT_CONFIGURED', 'Stripe is not configured');
    return new StripePaymentProvider(secret, config.get<string>('STRIPE_WEBHOOK_SECRET') || '');
  }
  if (selected === 'razorpay') {
    const keyId = config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) throw new AppError(503, 'PROVIDER_NOT_CONFIGURED', 'Razorpay is not configured');
    return new RazorpayPaymentProvider(keyId, keySecret, config.get<string>('RAZORPAY_WEBHOOK_SECRET') || '');
  }
  return new TestPaymentProvider(config.get<string>('WEBHOOK_SECRET') || 'dev-webhook');
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function verifyStripeSignature(secret: string, rawBody: string, headerValue: string): boolean {
  const parts = Object.fromEntries(headerValue.split(',').map((part) => part.split('=')));
  if (!parts.t || !parts.v1) return false;
  const digest = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const expected = Buffer.from(digest);
  const actual = Buffer.from(parts.v1);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
