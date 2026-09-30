import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus, VerificationStatus } from '@prisma/client';
import { resolvePersonalEntitlements } from '@cyrelle/shared';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { auditActionForStatus, canApplyVerificationTransition, mapSumsubStatus, parseSumsubTimestamp, safeRejectLabels, verificationUserMessage } from './sumsub/status-map';
import { verifySumsubWebhookDigest } from './sumsub/signature';

const OPEN_STATUSES: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE, SubscriptionStatus.PAST_DUE];

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

@Injectable()
export class SumsubWebhookService {
  private readonly logger = new Logger(SumsubWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async handle(rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>) {
    const secret = this.config.get<string>('SUMSUB_WEBHOOK_SECRET')?.trim() || '';
    if (!secret) {
      this.logger.error('Sumsub webhook rejected because SUMSUB_WEBHOOK_SECRET is not configured');
      throw new AppError(503, 'WEBHOOK_NOT_CONFIGURED', 'Verification notifications are not configured');
    }
    if (!rawBody?.length) {
      await this.reject('empty');
      throw new AppError(400, 'WEBHOOK_INVALID', 'The verification notification could not be verified');
    }
    const valid = verifySumsubWebhookDigest(secret, rawBody, header(headers, 'x-payload-digest'), header(headers, 'x-payload-digest-alg'));
    if (!valid) {
      await this.reject('signature');
      throw new AppError(401, 'WEBHOOK_INVALID', 'The verification notification could not be verified');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      await this.reject('parse');
      throw new AppError(400, 'WEBHOOK_INVALID', 'The verification notification could not be verified');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      await this.reject('shape');
      throw new AppError(400, 'WEBHOOK_INVALID', 'The verification notification could not be verified');
    }
    const body = parsed as Record<string, unknown>;
    const type = typeof body.type === 'string' ? body.type : '';
    const externalUserId = typeof body.externalUserId === 'string' ? body.externalUserId : '';
    const applicantId = typeof body.applicantId === 'string' ? body.applicantId : '';
    const inspectionId = typeof body.inspectionId === 'string' ? body.inspectionId : null;
    const correlationId = typeof body.correlationId === 'string' ? body.correlationId : '';
    const eventId = correlationId || createHash('sha256').update(rawBody).digest('hex');
    const review = body.reviewResult && typeof body.reviewResult === 'object' ? (body.reviewResult as Record<string, unknown>) : {};
    const reviewStatus = typeof body.reviewStatus === 'string' ? body.reviewStatus : null;
    const reviewAnswer = typeof review.reviewAnswer === 'string' ? review.reviewAnswer : null;
    const reviewRejectType = typeof review.reviewRejectType === 'string' ? review.reviewRejectType : null;
    const mapped = mapSumsubStatus({ type, reviewStatus, reviewAnswer, reviewRejectType });
    const eventTime = parseSumsubTimestamp(body.createdAtMs) ?? parseSumsubTimestamp(body.createdAt);
    const failureReason = safeRejectLabels(review.rejectLabels);
    const sandboxMode = body.sandboxMode === true || body.testMode === true;

    const user = await this.resolveUser(externalUserId, applicantId);
    let notify: { email: string; title: string; body: string } | null = null;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.identityVerificationEvent.findUnique({
          where: { provider_eventId: { provider: 'sumsub', eventId } },
        });
        if (existing) return { received: true as const, duplicate: true as const };

        const verification = user ? await tx.userVerification.findUnique({ where: { userId: user.id } }) : null;
        const stale = Boolean(
          verification?.lastProviderEventAt && (!eventTime || eventTime.getTime() < verification.lastProviderEventAt.getTime()),
        );
        const transitionAllowed = !mapped || !verification || canApplyVerificationTransition(verification.status, mapped.status, type);
        const apply = Boolean(mapped && verification && user && !stale && transitionAllowed);
        const ignoredTransition = Boolean(mapped && verification && user && !stale && !transitionAllowed);

        await tx.identityVerificationEvent.create({
          data: {
            provider: 'sumsub',
            eventId,
            eventType: type || 'unknown',
            userId: user?.id ?? null,
            verificationId: verification?.id ?? null,
            mappedStatus: mapped?.status,
            reviewAnswer: reviewAnswer ? reviewAnswer.toUpperCase() : null,
            reviewRejectType: reviewRejectType ? reviewRejectType.toUpperCase() : null,
            sandboxMode,
            applied: apply,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user?.id,
            action: 'SUMSUB_WEBHOOK_RECEIVED',
            target: verification?.id,
            metadata: { eventType: type || 'unknown', applied: apply, stale, ignoredTransition, sandboxMode },
          },
        });

        if (!apply || !verification || !mapped || !user) {
          return { received: true as const, duplicate: false as const };
        }

        const changed = verification.status !== mapped.status;
        const updated = await tx.userVerification.update({
          where: { id: verification.id },
          data: {
            status: mapped.status as VerificationStatus,
            provider: 'sumsub',
            providerApplicantId: applicantId || verification.providerApplicantId,
            providerInspectionId: inspectionId || verification.providerInspectionId,
            externalUserId: externalUserId || verification.externalUserId || user.id,
            failureReason: mapped.status === 'FAILED' || mapped.status === 'RESTRICTED' ? failureReason : verification.failureReason,
            canRetry: mapped.canRetry,
            submittedAt: mapped.status === 'SUBMITTED' ? verification.submittedAt ?? new Date() : verification.submittedAt,
            verifiedAt: mapped.status === 'VERIFIED' ? new Date() : mapped.status === 'FAILED' || mapped.status === 'RESTRICTED' ? null : verification.verifiedAt,
            failedAt: mapped.status === 'FAILED' || mapped.status === 'RESTRICTED' ? new Date() : verification.failedAt,
            reviewedAt: new Date(),
            lastProviderEventAt: eventTime ?? new Date(),
          },
        });

        const subscription = await tx.personalSubscription.findFirst({
          where: { userId: user.id, product: 'PERSONAL_PREMIUM', status: { in: OPEN_STATUSES } },
          orderBy: { createdAt: 'desc' },
        });
        const until = subscription?.status === 'ACTIVE' ? subscription.currentPeriodEnd : subscription?.graceUntil ?? subscription?.currentPeriodEnd ?? null;
        const premiumActive = Boolean(subscription && (!until || until.getTime() > Date.now()));
        const entitlements = resolvePersonalEntitlements({
          premiumActive,
          identityVerified: updated.status === 'VERIFIED',
          independentBlueTick: updated.independentBlueTick,
        });

        if (changed) {
          const notice = verificationUserMessage(mapped.status);
          if (notice) {
            await tx.notification.create({
              data: { userId: user.id, kind: 'VERIFICATION', title: notice.title, body: notice.body },
            });
            notify = { email: user.email, title: notice.title, body: notice.body };
          }
        }

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: auditActionForStatus(mapped.status, false),
            target: verification.id,
            metadata: {
              provider: 'sumsub',
              eventType: type || 'unknown',
              status: mapped.status,
              premiumBlueTick: entitlements.premiumBlueTick,
            },
          },
        });
        await tx.analyticsEvent.create({
          data: { userId: user.id, name: 'identity_verification_result', props: { provider: 'sumsub', status: mapped.status } },
        });
        return { received: true as const, duplicate: false as const };
      });

      if (notify) {
        const message = notify as { email: string; title: string; body: string };
        await this.mail.send(message.email, 'identity-verification', message.title, message.body);
      }
      return result;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return { received: true, duplicate: true };
      this.logger.error('Sumsub webhook processing failed');
      throw new AppError(500, 'WEBHOOK_FAILED', 'The verification notification could not be processed');
    }
  }

  private async resolveUser(externalUserId: string, applicantId: string) {
    if (externalUserId) {
      const byId = await this.prisma.user.findUnique({ where: { id: externalUserId } });
      if (byId) return byId;
      const byExternal = await this.prisma.userVerification.findUnique({ where: { externalUserId }, include: { user: true } });
      if (byExternal?.user) return byExternal.user;
    }
    if (applicantId) {
      const byApplicant = await this.prisma.userVerification.findUnique({ where: { providerApplicantId: applicantId }, include: { user: true } });
      if (byApplicant?.user) return byApplicant.user;
    }
    return null;
  }

  private async reject(reason: 'signature' | 'parse' | 'shape' | 'empty') {
    await this.prisma.auditLog.create({
      data: { action: 'SUMSUB_WEBHOOK_REJECTED', metadata: { reason } },
    });
    this.logger.warn(`Sumsub webhook rejected reason=${reason}`);
  }
}
