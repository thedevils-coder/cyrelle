import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VerificationStatus } from '@prisma/client';
import { resolvePersonalEntitlements } from '@cyrelle/shared';
import { AppError } from '../../common/app-error';
import { AuthUser } from '../../common/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { IdentityVerificationProvider } from './providers/identity-verification.provider';
import { ManualIdentityVerificationProvider } from './providers/manual.provider';
import { SumsubRequestError } from './providers/sumsub.client';
import { readSumsubRuntimeInput, SumsubIdentityVerificationProvider } from './providers/sumsub.provider';
import { resolveSumsubRuntime } from './sumsub/runtime';
import { toAlpha3Country } from './sumsub/countries';
import { retryDecision, retryDenialMessage } from './sumsub/retry';
import { auditActionForStatus } from './sumsub/status-map';

const USER_MESSAGE = "We couldn't start verification right now. Please try again.";

@Injectable()
export class IdentityVerificationService {
  private readonly logger = new Logger(IdentityVerificationService.name);
  private readonly provider: IdentityVerificationProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly entitlements: EntitlementsService,
  ) {
    this.provider = configuredProvider(config);
  }

  levelName(): string {
    return this.config.get<string>('SUMSUB_LEVEL_NAME')?.trim() || 'basic-kyc-level';
  }

  maxRetries(): number {
    const parsed = Number(this.config.get<string>('IDENTITY_VERIFICATION_MAX_RETRIES') ?? 3);
    if (!Number.isFinite(parsed) || parsed < 0) return 3;
    return Math.floor(parsed);
  }

  private tokenTtl(): number {
    const parsed = Number(this.config.get<string>('SUMSUB_TOKEN_TTL_SECS') ?? 600);
    if (!Number.isFinite(parsed)) return 600;
    return Math.min(3600, Math.max(60, Math.floor(parsed)));
  }

  async status(user: AuthUser) {
    const record = await this.prisma.userVerification.findUnique({ where: { userId: user.id } });
    const personal = await this.entitlements.personal(user.id);
    const decision = retryDecision({
      status: record?.status ?? 'NOT_STARTED',
      canRetry: record?.canRetry ?? false,
      retryCount: record?.retryCount ?? 0,
      maxRetries: this.maxRetries(),
    });
    return {
      status: record?.status ?? 'NOT_STARTED',
      provider: record?.provider ?? null,
      verificationType: record?.verificationType ?? 'identity',
      country: record?.documentCountry ?? user.profile?.countryCode ?? null,
      documentType: record?.documentType ?? null,
      failureReason: record?.failureReason ?? null,
      reviewReason: record?.reviewReason ?? null,
      retryCount: record?.retryCount ?? 0,
      retriesRemaining: Math.max(0, this.maxRetries() - (record?.retryCount ?? 0)),
      canRetry: decision.allowed,
      startedAt: record?.startedAt ?? null,
      submittedAt: record?.submittedAt ?? null,
      verifiedAt: record?.verifiedAt ?? null,
      failedAt: record?.failedAt ?? null,
      reviewedAt: record?.reviewedAt ?? null,
      identityVerified: record?.status === 'VERIFIED',
      premiumActive: personal.plan === 'PREMIUM',
      premiumBlueTickEligible: personal.premiumBlueTick,
      flow: this.provider.name === 'sumsub' && this.provider.configured() ? 'websdk' : 'unavailable',
    };
  }

  async history(user: AuthUser) {
    const rows = await this.prisma.identityVerificationEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      eventType: row.eventType,
      status: row.mappedStatus,
      reviewAnswer: row.reviewAnswer,
      reviewRejectType: row.reviewRejectType,
      sandboxMode: row.sandboxMode,
      applied: row.applied,
      createdAt: row.createdAt,
    }));
  }

  async start(user: AuthUser) {
    this.assertConfigured();
    const record = await this.ensureRecord(user);
    if (record.status === VerificationStatus.VERIFIED) {
      throw new AppError(409, 'ALREADY_VERIFIED', 'Your identity verification is complete.');
    }
    if (record.status === VerificationStatus.RESTRICTED) {
      throw new AppError(403, 'VERIFICATION_RESTRICTED', 'Your verification status requires further attention.');
    }
    if (record.status === VerificationStatus.MANUAL_REVIEW) {
      throw new AppError(409, 'MANUAL_REVIEW', "Your verification is being reviewed. We'll notify you when it's complete.");
    }
    if (record.status === VerificationStatus.FAILED || record.status === VerificationStatus.EXPIRED) {
      throw new AppError(409, 'RETRY_REQUIRED', 'Please retry verification.');
    }
    return this.openSession(user, false);
  }

  async retry(user: AuthUser) {
    this.assertConfigured();
    const record = await this.ensureRecord(user);
    const decision = retryDecision({
      status: record.status,
      canRetry: record.canRetry,
      retryCount: record.retryCount,
      maxRetries: this.maxRetries(),
    });
    if (!decision.allowed) throw new AppError(403, 'RETRY_NOT_ALLOWED', retryDenialMessage(decision.reason));
    return this.openSession(user, true);
  }

  async refreshToken(user: AuthUser) {
    this.assertConfigured();
    const record = await this.prisma.userVerification.findUnique({ where: { userId: user.id } });
    if (!record || (record.status !== VerificationStatus.IN_PROGRESS && record.status !== VerificationStatus.SUBMITTED && record.status !== VerificationStatus.PENDING)) {
      throw new AppError(409, 'VERIFICATION_NOT_ACTIVE', 'Start verification before continuing.');
    }
    return this.openSession(user, false);
  }

  async releaseProviderApplicant(userId: string): Promise<{ deactivated: boolean; permanentDeletion: false }> {
    const record = await this.prisma.userVerification.findUnique({ where: { userId } });
    if (!record?.providerApplicantId || record.provider !== 'sumsub' || !this.provider.configured()) {
      return { deactivated: false, permanentDeletion: false };
    }
    try {
      await this.provider.deactivateApplicant(record.providerApplicantId);
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'IDENTITY_VERIFICATION_PROVIDER_DEACTIVATED',
          target: record.id,
          metadata: { provider: 'sumsub', deactivated: true, permanentDeletion: false },
        },
      });
      return { deactivated: true, permanentDeletion: false };
    } catch (error) {
      const correlationId = error instanceof SumsubRequestError ? error.correlationId : null;
      this.logger.error(`Sumsub deactivation failed userId=${userId} correlationId=${correlationId ?? 'none'}`);
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'IDENTITY_VERIFICATION_PROVIDER_DEACTIVATED',
          target: record.id,
          metadata: { provider: 'sumsub', deactivated: false, permanentDeletion: false },
        },
      });
      return { deactivated: false, permanentDeletion: false };
    }
  }

  private async openSession(user: AuthUser, retry: boolean) {
    const levelName = this.levelName();
    const countryAlpha3 = toAlpha3Country(user.profile?.countryCode);
    const externalUserId = user.id;
    let applicant: { applicantId: string; inspectionId: string | null };
    let token: string;
    try {
      applicant = await this.provider.ensureApplicant({
        externalUserId,
        email: user.email,
        countryAlpha3,
        levelName,
      });
      const issued = await this.provider.createSdkToken({
        externalUserId,
        email: user.email,
        levelName,
        ttlInSecs: this.tokenTtl(),
      });
      token = issued.token;
    } catch (error) {
      const correlationId = error instanceof SumsubRequestError ? error.correlationId : null;
      this.logger.error(`Sumsub applicant session failed correlationId=${correlationId ?? 'none'}`);
      throw new AppError(503, 'VERIFICATION_UNAVAILABLE', USER_MESSAGE);
    }

    const existing = await this.ensureRecord(user);
    const personal = await this.entitlements.personal(user.id);
    const nextRetryCount = retry ? existing.retryCount + 1 : existing.retryCount;
    const record = await this.prisma.userVerification.update({
      where: { userId: user.id },
      data: {
        provider: 'sumsub',
        providerApplicantId: applicant.applicantId,
        providerInspectionId: applicant.inspectionId,
        externalUserId,
        documentCountry: user.profile?.countryCode ?? existing.documentCountry,
        status: existing.status === VerificationStatus.SUBMITTED && !retry ? existing.status : VerificationStatus.IN_PROGRESS,
        canRetry: true,
        retryCount: nextRetryCount,
        startedAt: existing.startedAt ?? new Date(),
        failureReason: retry ? null : existing.failureReason,
      },
    });
    if (retry || !existing.startedAt) {
      await this.prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: auditActionForStatus(record.status, retry),
          target: record.id,
          metadata: {
            provider: 'sumsub',
            retry,
            retryCount: record.retryCount,
            premiumBlueTick: resolvePersonalEntitlements({
              premiumActive: personal.plan === 'PREMIUM',
              identityVerified: record.status === 'VERIFIED',
              independentBlueTick: record.independentBlueTick,
            }).premiumBlueTick,
          },
        },
      });
      await this.prisma.analyticsEvent.create({
        data: { userId: user.id, name: retry ? 'identity_verification_retry' : 'identity_verification_started', props: { provider: 'sumsub' } },
      });
    }
    const expiresAt = new Date(Date.now() + this.tokenTtl() * 1000).toISOString();
    return {
      status: record.status,
      provider: 'sumsub',
      accessToken: token,
      expiresAt,
      levelName,
      flow: 'websdk',
      language: user.settings?.language ?? 'en',
    };
  }

  private async ensureRecord(user: AuthUser) {
    return this.prisma.userVerification.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, provider: 'manual' },
    });
  }

  private assertConfigured(): void {
    if (!this.provider.configured()) {
      throw new AppError(503, 'VERIFICATION_UNAVAILABLE', USER_MESSAGE);
    }
  }
}

export function configuredProvider(config: ConfigService): IdentityVerificationProvider {
  const sumsub = new SumsubIdentityVerificationProvider(config);
  if (sumsub.configured()) return sumsub;
  const decision = resolveSumsubRuntime(readSumsubRuntimeInput(config));
  const message = `Sumsub is not active (${decision.reason}). Cyrelle keeps running without provider calls.`;
  if (decision.logLevel === 'error') {
    new Logger('IdentityVerification').error(message);
  } else {
    new Logger('IdentityVerification').warn(message);
  }
  return new ManualIdentityVerificationProvider();
}
