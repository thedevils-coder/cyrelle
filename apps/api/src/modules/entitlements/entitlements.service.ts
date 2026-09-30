import { Injectable } from '@nestjs/common';
import {
  FeatureFlagEvaluation,
  evaluateFeatureFlag,
  resolveBusinessEntitlements,
  resolvePersonalEntitlements,
  stableBucket,
  type BusinessEntitlementResult,
  type PersonalEntitlementResult,
} from '@cyrelle/shared';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const OPEN_STATUSES: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE, SubscriptionStatus.PAST_DUE];

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async personal(userId: string): Promise<PersonalEntitlementResult & { subscription: { status: string; currentPeriodEnd: Date | null; interval: string; currency: string; amountMinor: number } | null }> {
    const [user, subscription] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, include: { verification: true } }),
      this.prisma.personalSubscription.findFirst({
        where: { userId, product: 'PERSONAL_PREMIUM', status: { in: OPEN_STATUSES } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const now = Date.now();
    const premiumActive = !!subscription && this.periodOpen(subscription.status, subscription.currentPeriodEnd, subscription.graceUntil, now);
    const resolved = resolvePersonalEntitlements({
      premiumActive,
      identityVerified: user?.verification?.status === 'VERIFIED',
      independentBlueTick: user?.verification?.independentBlueTick ?? false,
    });
    return {
      ...resolved,
      subscription: subscription
        ? {
            status: premiumActive ? subscription.status : 'EXPIRED',
            currentPeriodEnd: subscription.currentPeriodEnd,
            interval: subscription.interval,
            currency: subscription.currency,
            amountMinor: subscription.amountMinor,
          }
        : null,
    };
  }

  async business(businessId: string): Promise<BusinessEntitlementResult> {
    const [verification, subscription] = await Promise.all([
      this.prisma.businessVerification.findUnique({ where: { businessId } }),
      this.prisma.businessSubscription.findUnique({ where: { businessId } }),
    ]);
    const now = Date.now();
    const blueTickActive = !!subscription && subscription.product === 'BUSINESS_BLUE_TICK' && this.periodOpen(subscription.status, subscription.currentPeriodEnd, null, now);
    return resolveBusinessEntitlements({
      blueTickActive,
      businessVerified: verification?.status === 'VERIFIED',
    });
  }

  async features(userId: string, platform?: string): Promise<FeatureFlagEvaluation[]> {
    const [flags, personal, profile] = await Promise.all([
      this.prisma.featureFlag.findMany(),
      this.personal(userId),
      this.prisma.userProfile.findUnique({ where: { userId } }),
    ]);
    return flags.map((flag) =>
      evaluateFeatureFlag(
        {
          key: flag.key,
          enabled: flag.enabled,
          premiumLaunchAt: flag.premiumLaunchAt,
          basicLaunchAt: flag.basicLaunchAt,
          countries: flag.countries,
          platforms: flag.platforms,
          rolloutPercent: flag.rolloutPercent,
        },
        {
          plan: personal.plan,
          countryCode: profile?.countryCode,
          platform,
          userBucket: stableBucket(userId, flag.key),
          now: new Date(),
        },
      ),
    );
  }

  async requirePersonal(userId: string, entitlement: string): Promise<PersonalEntitlementResult> {
    const resolved = await this.personal(userId);
    if (!resolved.entitlements.includes(entitlement as never)) {
      const { AppError } = await import('../../common/app-error');
      throw new AppError(403, 'ENTITLEMENT_REQUIRED', 'This is included with Cyrelle Premium');
    }
    return resolved;
  }

  private periodOpen(status: SubscriptionStatus, periodEnd: Date | null, graceUntil: Date | null, now: number): boolean {
    if (!OPEN_STATUSES.includes(status)) return false;
    const until = status === SubscriptionStatus.ACTIVE ? periodEnd : graceUntil ?? periodEnd;
    return !until || until.getTime() > now;
  }
}
