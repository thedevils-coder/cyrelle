import { Injectable } from '@nestjs/common';
import { BillingInterval } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { AuthUser } from '../../common/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { MailService } from '../mail/mail.service';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class PremiumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly entitlements: EntitlementsService,
    private readonly mail: MailService,
  ) {}

  async plans(countryCode?: string) {
    const [monthly, yearly, blueMonth, blueYear] = await Promise.all([
      this.payments.priceFor('PERSONAL_PREMIUM', 'MONTH', countryCode).catch(() => null),
      this.payments.priceFor('PERSONAL_PREMIUM', 'YEAR', countryCode).catch(() => null),
      this.payments.priceFor('BUSINESS_BLUE_TICK', 'MONTH', countryCode).catch(() => null),
      this.payments.priceFor('BUSINESS_BLUE_TICK', 'YEAR', countryCode).catch(() => null),
    ]);
    return {
      basic: { price: 'free', ads: true },
      premium: { monthly, yearly, ads: true, note: 'Premium is not an ad-free plan.' },
      businessProfile: { price: 'free' },
      businessBlueTick: { monthly: blueMonth, yearly: blueYear },
      commissionBps: await this.payments.commissionBps(),
    };
  }

  async checkout(user: AuthUser, interval: BillingInterval, idempotencyKey?: string) {
    if (!user.emailVerifiedAt) throw new AppError(403, 'EMAIL_UNVERIFIED', 'Verify your email before subscribing');
    const remembered = await this.payments.remember(user.id, idempotencyKey, {});
    if (remembered) return remembered;
    const price = await this.payments.priceFor('PERSONAL_PREMIUM', interval, user.profile?.countryCode);
    const charge = await this.payments.charge({
      amountMinor: price.amountMinor,
      currency: price.currency,
      customerEmail: user.email,
      description: `Cyrelle Premium ${interval === 'YEAR' ? 'yearly' : 'monthly'}`,
      metadata: { userId: user.id, product: 'PERSONAL_PREMIUM' },
      idempotencyKey: idempotencyKey || `premium_${user.id}_${Date.now()}`,
      interval,
    });
    if (charge.status === 'FAILED') throw new AppError(402, 'PAYMENT_FAILED', 'Payment did not complete');
    const currentPeriodEnd = new Date(Date.now() + (interval === 'YEAR' ? 365 : 30) * 24 * 60 * 60 * 1000);
    const subscription = await this.prisma.personalSubscription.create({
      data: {
        userId: user.id,
        status: charge.status === 'SUCCEEDED' ? 'ACTIVE' : 'INCOMPLETE',
        interval,
        amountMinor: price.amountMinor,
        currency: price.currency,
        countryCode: user.profile?.countryCode,
        provider: charge.provider,
        providerRef: charge.providerRef,
        currentPeriodEnd,
      },
    });
    await this.prisma.subscriptionEvent.create({
      data: { userId: user.id, subscriptionId: subscription.id, type: 'premium.started', payload: { amountMinor: price.amountMinor, currency: price.currency } },
    });
    await this.mail.send(user.email, 'premium-started', 'Welcome to Cyrelle Premium', 'Premium is active. Advertisements still appear. Your Premium Blue Tick appears after identity verification.');
    const response = { subscription, entitlements: await this.entitlements.personal(user.id), clientSecret: charge.clientSecret ?? null };
    await this.payments.store(user.id, idempotencyKey, JSON.parse(JSON.stringify(response)));
    return response;
  }

  async cancel(user: AuthUser) {
    const subscription = await this.prisma.personalSubscription.findFirst({ where: { userId: user.id, status: { in: ['ACTIVE', 'GRACE', 'PAST_DUE'] } }, orderBy: { createdAt: 'desc' } });
    if (!subscription) throw new AppError(404, 'NOT_FOUND', 'No active Premium subscription');
    if (subscription.providerRef) await this.payments.provider().cancelSubscription(subscription.providerRef);
    const updated = await this.prisma.personalSubscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true } });
    await this.prisma.subscriptionEvent.create({ data: { userId: user.id, subscriptionId: subscription.id, type: 'premium.cancel_scheduled', payload: {} } });
    return updated;
  }

  async billing(user: AuthUser) {
    const subscriptions = await this.prisma.personalSubscription.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    const events = await this.prisma.subscriptionEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 });
    return { subscriptions, events, entitlements: await this.entitlements.personal(user.id) };
  }
}
