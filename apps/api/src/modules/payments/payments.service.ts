import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { selectPrice, type PriceRow } from '@cyrelle/shared';
import { Prisma, SubscriptionProduct, BillingInterval } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/app-error';
import { createPaymentProvider } from './providers';
import { ChargeResult } from './payment.types';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  provider() {
    return createPaymentProvider(this.config);
  }

  async commissionBps(): Promise<number> {
    const setting = await this.prisma.platformSetting.findUnique({ where: { key: 'appointment_commission_bps' } });
    const value = (setting?.value as { bps?: number } | null)?.bps;
    return Number.isInteger(value) ? (value as number) : 1500;
  }

  async priceFor(product: SubscriptionProduct, interval: BillingInterval, countryCode?: string | null): Promise<PriceRow & { id?: string }> {
    const rows = await this.prisma.pricePlan.findMany({ where: { product, interval, active: true } });
    const selected = selectPrice(
      rows.map((row) => ({ ...row, countryCode: row.countryCode || null })),
      product,
      interval,
      countryCode,
    );
    if (!selected) throw new AppError(404, 'PRICE_NOT_CONFIGURED', 'No price is configured for this plan');
    return selected;
  }

  async charge(input: {
    amountMinor: number;
    currency: string;
    customerEmail: string;
    description: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
    interval?: BillingInterval;
  }): Promise<ChargeResult & { provider: string }> {
    const provider = this.provider();
    const result = input.interval
      ? await provider.createSubscription({ ...input, interval: input.interval })
      : await provider.createCharge(input);
    return { ...result, provider: provider.code };
  }

  async remember(userId: string, key: string | undefined, response: Prisma.InputJsonValue): Promise<Prisma.JsonValue | null> {
    if (!key) return null;
    const existing = await this.prisma.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });
    if (existing) return existing.response;
    return null;
  }

  async store(userId: string, key: string | undefined, response: Prisma.InputJsonValue): Promise<void> {
    if (!key) return;
    await this.prisma.idempotencyKey.upsert({
      where: { userId_key: { userId, key } },
      update: { response },
      create: { userId, key, response },
    });
  }
}
