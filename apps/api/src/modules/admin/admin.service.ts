import { Injectable } from '@nestjs/common';
import { AccountStatus, Role, SubscriptionStatus } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { AuthUser } from '../../common/auth.guard';
import { decryptString } from '../../common/crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [users, premium, businesses, appointments, commission, ads, reports, emergencies] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.personalSubscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.businessProfile.count(),
      this.prisma.appointment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.appointmentPayment.aggregate({ where: { commissionStatus: 'ELIGIBLE' }, _sum: { commissionMinor: true, grossMinor: true } }),
      this.prisma.advertisement.count({ where: { status: 'ACTIVE' } }),
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.emergencyEvent.count({ where: { status: 'ACTIVE' } }),
    ]);
    return { users, premium, businesses, completedAppointments: appointments, commissionMinor: commission._sum.commissionMinor ?? 0, grossMinor: commission._sum.grossMinor ?? 0, activeAds: ads, openReports: reports, activeEmergencies: emergencies };
  }

  users(q?: string) {
    return this.prisma.user.findMany({
      where: q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { profile: { username: { contains: q, mode: 'insensitive' } } }] } : undefined,
      select: {
        id: true,
        email: true,
        role: true,
        accountStatus: true,
        createdAt: true,
        emailVerifiedAt: true,
        profile: { select: { username: true, displayName: true, countryCode: true } },
        verification: { select: { status: true, independentBlueTick: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async setUserStatus(actor: AuthUser, id: string, status: AccountStatus) {
    if (status === 'BANNED' && actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'You cannot ban accounts');
    const user = await this.prisma.user.update({ where: { id }, data: { accountStatus: status, tokenVersion: { increment: 1 } } });
    await this.audit(actor, 'user.status', id, { status });
    return { id: user.id, status: user.accountStatus };
  }

  verifications() {
    return this.prisma.userVerification.findMany({
      where: { status: { in: ['PENDING', 'MANUAL_REVIEW'] } },
      include: { user: { include: { profile: true } } },
      orderBy: { submittedAt: 'asc' },
    }).then((rows) => rows.map((row) => ({ id: row.id, userId: row.userId, username: row.user.profile?.username, status: row.status, documentType: row.documentType, documentCountry: row.documentCountry, submittedAt: row.submittedAt, hasDocument: Boolean(row.documentCipher) })));
  }

  async decideVerification(actor: AuthUser, id: string, status: 'VERIFIED' | 'FAILED' | 'MANUAL_REVIEW' | 'RESTRICTED', note?: string) {
    const row = await this.prisma.userVerification.update({ where: { id }, data: { status, reviewNote: note, reviewerId: actor.id, reviewedAt: new Date() } });
    await this.prisma.notification.create({ data: { userId: row.userId, kind: 'VERIFICATION', title: 'Verification update', body: `Your identity verification is ${status.toLowerCase().replace('_', ' ')}.` } });
    await this.audit(actor, 'verification.decision', id, { status });
    return { id: row.id, status: row.status };
  }

  async revealDocument(actor: AuthUser, id: string) {
    if (actor.role !== Role.SUPER_ADMIN) throw new AppError(403, 'FORBIDDEN', 'Only a super admin can open verification documents');
    const row = await this.prisma.userVerification.findUnique({ where: { id } });
    if (!row?.documentCipher) throw new AppError(404, 'NOT_FOUND', 'No document is stored');
    const key = process.env.VERIFICATION_ENCRYPTION_KEY || '';
    await this.audit(actor, 'verification.document_view', id, {});
    return { document: decryptString(row.documentCipher, key), selfie: row.selfieCipher ? decryptString(row.selfieCipher, key) : null };
  }

  content() {
    return this.prisma.report.findMany({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async moderate(actor: AuthUser, input: { targetType: string; targetId: string; action: string; note?: string }) {
    if (input.targetType === 'POST' && (input.action === 'REMOVE' || input.action === 'HIDE')) {
      await this.prisma.post.updateMany({ where: { id: input.targetId }, data: { status: input.action === 'REMOVE' ? 'REMOVED' : 'HIDDEN' } });
    }
    if (input.targetType === 'REEL' && (input.action === 'REMOVE' || input.action === 'HIDE')) {
      await this.prisma.reel.updateMany({ where: { id: input.targetId }, data: { status: input.action === 'REMOVE' ? 'REMOVED' : 'HIDDEN' } });
    }
    if (input.action === 'RESTORE' && input.targetType === 'POST') await this.prisma.post.updateMany({ where: { id: input.targetId }, data: { status: 'PUBLISHED' } });
    await this.prisma.report.updateMany({ where: { targetType: input.targetType as never, targetId: input.targetId, status: 'OPEN' }, data: { status: 'RESOLVED' } });
    await this.prisma.moderationAction.create({ data: { actorId: actor.id, ...input } });
    await this.audit(actor, 'moderation.action', input.targetId, input);
    return { ok: true };
  }

  premium() {
    return this.prisma.personalSubscription.findMany({
      include: { user: { select: { id: true, email: true, profile: { select: { username: true, displayName: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async upsertPrice(actor: AuthUser, input: { product: 'PERSONAL_PREMIUM' | 'BUSINESS_BLUE_TICK'; interval: 'MONTH' | 'YEAR'; countryCode?: string; currency: string; amountMinor: number; active?: boolean }) {
    const countryCode = input.countryCode?.toUpperCase() || '';
    const row = await this.prisma.pricePlan.upsert({
      where: { product_interval_countryCode: { product: input.product, interval: input.interval, countryCode } },
      update: { currency: input.currency.toUpperCase(), amountMinor: input.amountMinor, active: input.active ?? true },
      create: { product: input.product, interval: input.interval, countryCode, currency: input.currency.toUpperCase(), amountMinor: input.amountMinor, active: input.active ?? true },
    });
    await this.audit(actor, 'pricing.upsert', row.id, input);
    return row;
  }

  businesses() {
    return this.prisma.businessProfile.findMany({ include: { verification: true, subscription: true }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async decideBusiness(actor: AuthUser, id: string, status: 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | 'PENDING', note?: string) {
    const row = await this.prisma.businessVerification.update({ where: { id }, data: { status, reviewNote: note, reviewerId: actor.id, reviewedAt: new Date() } });
    await this.audit(actor, 'business.verification', id, { status });
    return row;
  }

  appointments() {
    return this.prisma.appointment.findMany({ include: { payment: true, service: true, business: true }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  commissions() {
    return this.prisma.appointmentPayment.findMany({ include: { appointment: { include: { business: true } }, payout: true }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async refund(actor: AuthUser, paymentId: string) {
    const payment = await this.prisma.appointmentPayment.update({
      where: { id: paymentId },
      data: { paymentStatus: 'REFUNDED', refundStatus: 'REFUNDED', commissionStatus: 'REVERSED', payoutStatus: 'NOT_DUE' },
    });
    await this.prisma.appointment.update({ where: { id: payment.appointmentId }, data: { status: 'REFUNDED' } });
    await this.audit(actor, 'payment.refund', paymentId, {});
    return payment;
  }

  async markPayout(actor: AuthUser, payoutId: string, status: 'PAID' | 'FAILED' | 'HELD') {
    const payout = await this.prisma.payout.update({ where: { id: payoutId }, data: { status, paidAt: status === 'PAID' ? new Date() : null } });
    if (payout.paymentId) await this.prisma.appointmentPayment.update({ where: { id: payout.paymentId }, data: { payoutStatus: status } });
    await this.audit(actor, 'payout.update', payoutId, { status });
    return payout;
  }

  ads() {
    return this.prisma.advertisement.findMany({ include: { campaign: { include: { advertiser: true } } }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async decideAd(actor: AuthUser, id: string, status: 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'PAUSED') {
    const ad = await this.prisma.advertisement.update({ where: { id }, data: { status: status === 'APPROVED' ? 'ACTIVE' : status } });
    if (status === 'APPROVED' || status === 'ACTIVE') await this.prisma.adCampaign.update({ where: { id: ad.campaignId }, data: { status: 'ACTIVE' } });
    if (status === 'REJECTED') await this.prisma.adCampaign.update({ where: { id: ad.campaignId }, data: { status: 'REJECTED' } });
    await this.audit(actor, 'ad.decision', id, { status });
    return ad;
  }

  flags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async saveFlag(actor: AuthUser, key: string, input: Record<string, unknown>) {
    const flag = await this.prisma.featureFlag.upsert({
      where: { key },
      update: {
        name: (input.name as string) || key,
        description: (input.description as string) || '',
        enabled: Boolean(input.enabled),
        premiumLaunchAt: input.premiumLaunchAt ? new Date(String(input.premiumLaunchAt)) : null,
        basicLaunchAt: input.basicLaunchAt ? new Date(String(input.basicLaunchAt)) : null,
        countries: (input.countries as string[]) || [],
        platforms: (input.platforms as string[]) || [],
        rolloutPercent: Number(input.rolloutPercent ?? 100),
      },
      create: {
        key,
        name: (input.name as string) || key,
        description: (input.description as string) || '',
        enabled: Boolean(input.enabled),
        premiumLaunchAt: input.premiumLaunchAt ? new Date(String(input.premiumLaunchAt)) : null,
        basicLaunchAt: input.basicLaunchAt ? new Date(String(input.basicLaunchAt)) : null,
        countries: (input.countries as string[]) || [],
        platforms: (input.platforms as string[]) || [],
        rolloutPercent: Number(input.rolloutPercent ?? 100),
      },
    });
    await this.audit(actor, 'feature_flag.save', key, input);
    return flag;
  }

  countries() {
    return this.prisma.country.findMany({ orderBy: { name: 'asc' } });
  }

  async saveCountry(actor: AuthUser, code: string, input: Record<string, unknown>) {
    const country = await this.prisma.country.upsert({
      where: { code: code.toUpperCase() },
      update: input as never,
      create: { code: code.toUpperCase(), name: String(input.name || code), currency: String(input.currency || 'USD'), languages: (input.languages as string[]) || ['en'], timeZones: (input.timeZones as string[]) || ['UTC'], emergency: (input.emergency as object) || [], ...(input as object) },
    });
    await this.audit(actor, 'country.save', code, {});
    return country;
  }

  legal() {
    return this.prisma.legalDocument.findMany({ orderBy: { slug: 'asc' } });
  }

  async saveLegal(actor: AuthUser, input: { slug: string; title: string; body: string; locale?: string; countryCode?: string | null }) {
    const countryCode = input.countryCode || null;
    const locale = input.locale || 'en';
    const existing = await this.prisma.legalDocument.findFirst({ where: { slug: input.slug, locale, countryCode } });
    const document = existing
      ? await this.prisma.legalDocument.update({ where: { id: existing.id }, data: { title: input.title, body: input.body } })
      : await this.prisma.legalDocument.create({ data: { slug: input.slug, title: input.title, body: input.body, locale, countryCode } });
    await this.audit(actor, 'legal.save', document.id, { slug: input.slug });
    return document;
  }

  auditLogs() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async analytics() {
    const names = await this.prisma.analyticsEvent.groupBy({ by: ['name'], _count: { name: true }, orderBy: { _count: { name: 'desc' } }, take: 20 });
    return { events: names };
  }

  async setting(actor: AuthUser, key: string, value: unknown) {
    const row = await this.prisma.platformSetting.upsert({ where: { key }, update: { value: value as object }, create: { key, value: value as object } });
    await this.audit(actor, 'setting.save', key, { value });
    return row;
  }

  private audit(actor: AuthUser, action: string, target: string, metadata: unknown) {
    return this.prisma.auditLog.create({ data: { actorId: actor.id, action, target, metadata: metadata as object } });
  }
}

export const adminRoles = [Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN];
void SubscriptionStatus;
