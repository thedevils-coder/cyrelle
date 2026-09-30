import { Injectable } from '@nestjs/common';
import { validateUsername } from '@cyrelle/shared';
import { BusinessMemberRole } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { AuthUser } from '../../common/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class BusinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly payments: PaymentsService,
  ) {}

  async create(user: AuthUser, input: {
    name: string;
    username: string;
    category: string;
    subcategory?: string;
    description?: string;
    countryCode: string;
    city?: string;
    address?: string;
    website?: string;
    email?: string;
    phone?: string;
    timezone: string;
    logoUrl?: string;
    coverUrl?: string;
    socialLinks?: Record<string, string>;
  }) {
    if (!user.emailVerifiedAt) throw new AppError(403, 'EMAIL_UNVERIFIED', 'Verify your email before creating a business profile');
    if (user.verification?.status !== 'VERIFIED') {
      throw new AppError(403, 'VERIFICATION_REQUIRED', 'A verified eligible member can create a business profile');
    }
    const username = validateUsername(input.username);
    if (!username.ok) throw new AppError(400, username.code, 'Choose a different business username');
    const country = await this.prisma.country.findUnique({ where: { code: input.countryCode.toUpperCase() } });
    if (!country?.active) throw new AppError(400, 'COUNTRY_UNSUPPORTED', 'Choose a supported country');
    const business = await this.prisma.businessProfile.create({
      data: {
        name: input.name.trim(),
        username: username.username,
        category: input.category,
        subcategory: input.subcategory,
        description: input.description,
        countryCode: country.code,
        city: input.city,
        address: input.address,
        website: input.website,
        email: input.email,
        phone: input.phone,
        timezone: input.timezone,
        logoUrl: input.logoUrl,
        coverUrl: input.coverUrl,
        socialLinks: input.socialLinks,
        members: { create: { userId: user.id, role: BusinessMemberRole.OWNER } },
        verification: { create: { status: 'NOT_VERIFIED' } },
        hours: {
          create: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 10 * 60, endMinute: 18 * 60 })),
        },
      },
    });
    await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'business_created', props: { businessId: business.id } } });
    return { ...business, tier: 'STANDARD' as const, entitlements: [] };
  }

  async update(user: AuthUser, id: string, input: Record<string, unknown>) {
    await this.requireRole(user.id, id, ['OWNER', 'ADMIN']);
    return this.prisma.businessProfile.update({
      where: { id },
      data: {
        name: input.name as string | undefined,
        description: input.description as string | undefined,
        category: input.category as string | undefined,
        subcategory: input.subcategory as string | undefined,
        city: input.city as string | undefined,
        address: input.address as string | undefined,
        website: input.website as string | undefined,
        email: input.email as string | undefined,
        phone: input.phone as string | undefined,
        timezone: input.timezone as string | undefined,
        logoUrl: input.logoUrl as string | undefined,
        coverUrl: input.coverUrl as string | undefined,
        socialLinks: input.socialLinks as object | undefined,
      },
    });
  }

  async publicProfile(username: string) {
    const business = await this.prisma.businessProfile.findUnique({
      where: { username: username.toLowerCase() },
      include: { services: { where: { active: true } }, reviews: { take: 10, orderBy: { createdAt: 'desc' } }, hours: true },
    });
    if (!business || business.status !== 'ACTIVE') throw new AppError(404, 'NOT_FOUND', 'Business not found');
    const entitlements = await this.entitlements.business(business.id);
    await this.prisma.analyticsEvent.create({ data: { name: 'business_profile_view', props: { businessId: business.id } } });
    return { ...business, ...entitlements };
  }

  async directory(query: { country?: string; category?: string; q?: string }) {
    const rows = await this.prisma.businessProfile.findMany({
      where: {
        status: 'ACTIVE',
        countryCode: query.country?.toUpperCase(),
        category: query.category ? { equals: query.category, mode: 'insensitive' } : undefined,
        ...(query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { city: { contains: query.q, mode: 'insensitive' } }] } : {}),
      },
      take: 40,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map(async (row) => ({ ...row, ...(await this.entitlements.business(row.id)) })));
  }

  async addService(user: AuthUser, businessId: string, input: { name: string; description: string; category: string; durationMinutes: number; priceMinor: number; currency: string; requirements?: string; cancellationPolicy?: string; images?: string[] }) {
    await this.requireRole(user.id, businessId, ['OWNER', 'ADMIN']);
    if (!Number.isInteger(input.priceMinor) || input.priceMinor < 0) throw new AppError(400, 'INVALID_AMOUNT', 'Enter a price in minor units');
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) throw new AppError(400, 'INVALID_DURATION', 'Enter a duration in minutes');
    return this.prisma.service.create({
      data: {
        businessId,
        name: input.name,
        description: input.description,
        category: input.category,
        durationMinutes: input.durationMinutes,
        priceMinor: input.priceMinor,
        currency: input.currency.toUpperCase(),
        requirements: input.requirements,
        cancellationPolicy: input.cancellationPolicy ?? 'MODERATE',
        images: input.images ?? [],
      },
    });
  }

  async updateService(user: AuthUser, serviceId: string, input: Record<string, unknown>) {
    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) throw new AppError(404, 'NOT_FOUND', 'Service not found');
    await this.requireRole(user.id, service.businessId, ['OWNER', 'ADMIN']);
    return this.prisma.service.update({
      where: { id: serviceId },
      data: {
        name: input.name as string | undefined,
        description: input.description as string | undefined,
        priceMinor: input.priceMinor as number | undefined,
        durationMinutes: input.durationMinutes as number | undefined,
        active: input.active as boolean | undefined,
        cancellationPolicy: input.cancellationPolicy as string | undefined,
        requirements: input.requirements as string | undefined,
      },
    });
  }

  async setHours(user: AuthUser, businessId: string, rules: Array<{ weekday: number; startMinute: number; endMinute: number }>) {
    await this.requireRole(user.id, businessId, ['OWNER', 'ADMIN']);
    await this.prisma.availabilityRule.deleteMany({ where: { businessId } });
    await this.prisma.availabilityRule.createMany({ data: rules.map((rule) => ({ ...rule, businessId })) });
    return this.prisma.availabilityRule.findMany({ where: { businessId } });
  }

  async blockTime(user: AuthUser, businessId: string, startsAt: string, endsAt: string, reason?: string) {
    await this.requireRole(user.id, businessId, ['OWNER', 'ADMIN', 'MEMBER']);
    return this.prisma.availabilityBlock.create({ data: { businessId, startsAt: new Date(startsAt), endsAt: new Date(endsAt), reason } });
  }

  async submitVerification(user: AuthUser, businessId: string, input: { registrationNo?: string; document?: string; websiteDomain?: string }) {
    await this.requireRole(user.id, businessId, ['OWNER', 'ADMIN']);
    const { encryptString } = await import('../../common/crypto');
    const key = process.env.VERIFICATION_ENCRYPTION_KEY || '';
    return this.prisma.businessVerification.upsert({
      where: { businessId },
      update: {
        status: 'PENDING',
        registrationNo: input.registrationNo,
        websiteDomain: input.websiteDomain,
        documentCipher: input.document ? encryptString(input.document, key) : undefined,
        submittedAt: new Date(),
      },
      create: {
        businessId,
        status: 'PENDING',
        registrationNo: input.registrationNo,
        websiteDomain: input.websiteDomain,
        documentCipher: input.document ? encryptString(input.document, key) : undefined,
        submittedAt: new Date(),
      },
    });
  }

  async subscribeBlueTick(user: AuthUser, businessId: string, interval: 'MONTH' | 'YEAR', idempotencyKey?: string) {
    await this.requireRole(user.id, businessId, ['OWNER']);
    const remembered = await this.payments.remember(user.id, idempotencyKey, {});
    if (remembered) return remembered;
    const business = await this.prisma.businessProfile.findUnique({ where: { id: businessId } });
    if (!business) throw new AppError(404, 'NOT_FOUND', 'Business not found');
    const verification = await this.prisma.businessVerification.findUnique({ where: { businessId } });
    if (verification?.status !== 'VERIFIED') {
      throw new AppError(403, 'BUSINESS_VERIFICATION_REQUIRED', 'Business Blue Tick requires approved business verification');
    }
    const price = await this.payments.priceFor('BUSINESS_BLUE_TICK', interval, business.countryCode);
    const charge = await this.payments.charge({
      amountMinor: price.amountMinor,
      currency: price.currency,
      customerEmail: user.email,
      description: `Cyrelle Business Blue Tick ${interval.toLowerCase()}`,
      metadata: { businessId, product: 'BUSINESS_BLUE_TICK' },
      idempotencyKey: idempotencyKey || `blue_${businessId}_${Date.now()}`,
      interval,
    });
    if (charge.status === 'FAILED') throw new AppError(402, 'PAYMENT_FAILED', 'Payment did not complete');
    const periodEnd = new Date(Date.now() + (interval === 'YEAR' ? 365 : 30) * 24 * 60 * 60 * 1000);
    const subscription = await this.prisma.businessSubscription.upsert({
      where: { businessId },
      update: {
        status: charge.status === 'SUCCEEDED' ? 'ACTIVE' : 'INCOMPLETE',
        interval,
        amountMinor: price.amountMinor,
        currency: price.currency,
        countryCode: business.countryCode,
        provider: charge.provider,
        providerRef: charge.providerRef,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
      create: {
        businessId,
        status: charge.status === 'SUCCEEDED' ? 'ACTIVE' : 'INCOMPLETE',
        interval,
        amountMinor: price.amountMinor,
        currency: price.currency,
        countryCode: business.countryCode,
        provider: charge.provider,
        providerRef: charge.providerRef,
        currentPeriodEnd: periodEnd,
      },
    });
    const response = { subscription, entitlements: await this.entitlements.business(businessId), clientSecret: charge.clientSecret ?? null };
    await this.payments.store(user.id, idempotencyKey, JSON.parse(JSON.stringify(response)));
    return response;
  }

  async cancelBlueTick(user: AuthUser, businessId: string) {
    await this.requireRole(user.id, businessId, ['OWNER']);
    const subscription = await this.prisma.businessSubscription.findUnique({ where: { businessId } });
    if (!subscription) throw new AppError(404, 'NOT_FOUND', 'No Business Blue Tick subscription');
    if (subscription.providerRef) await this.payments.provider().cancelSubscription(subscription.providerRef);
    return this.prisma.businessSubscription.update({ where: { businessId }, data: { cancelAtPeriodEnd: true } });
  }

  async dashboard(user: AuthUser, businessId: string) {
    await this.requireRole(user.id, businessId, ['OWNER', 'ADMIN', 'MEMBER']);
    const entitlements = await this.entitlements.business(businessId);
    const [appointments, revenue, reviews, services] = await Promise.all([
      this.prisma.appointment.count({ where: { businessId } }),
      this.prisma.appointmentPayment.aggregate({ where: { appointment: { businessId }, commissionStatus: 'ELIGIBLE' }, _sum: { businessMinor: true, commissionMinor: true, grossMinor: true } }),
      this.prisma.review.count({ where: { businessId } }),
      this.prisma.service.count({ where: { businessId, active: true } }),
    ]);
    const standard = {
      appointments,
      services,
      reviews,
      grossMinor: revenue._sum.grossMinor ?? 0,
      commissionMinor: revenue._sum.commissionMinor ?? 0,
      businessMinor: revenue._sum.businessMinor ?? 0,
    };
    if (!entitlements.entitlements.includes('ADVANCED_BUSINESS_ANALYTICS')) {
      return { level: 'standard', entitlements, ...standard };
    }
    const views = await this.prisma.analyticsEvent.count({ where: { name: 'business_profile_view', props: { path: ['businessId'], equals: businessId } } });
    return { level: 'advanced', entitlements, ...standard, profileViews: views };
  }

  async requireRole(userId: string, businessId: string, roles: BusinessMemberRole[]) {
    const member = await this.prisma.businessMember.findUnique({ where: { businessId_userId: { businessId, userId } } });
    if (!member || !roles.includes(member.role)) throw new AppError(403, 'FORBIDDEN', 'You do not manage this business');
    return member;
  }
}
