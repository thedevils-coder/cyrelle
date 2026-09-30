import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../../common/app-error';
import { AuthUser } from '../../common/auth.guard';
import { encryptString } from '../../common/crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async status(user: AuthUser) {
    const record = await this.prisma.userVerification.findUnique({ where: { userId: user.id } });
    return {
      status: record?.status ?? 'NOT_STARTED',
      submittedAt: record?.submittedAt ?? null,
      reviewedAt: record?.reviewedAt ?? null,
      provider: record?.provider ?? 'manual',
      private: true,
    };
  }

  async submit(user: AuthUser, input: { documentType: string; documentCountry: string; document: string; selfie: string; livenessScore?: number }) {
    const key = this.config.get<string>('VERIFICATION_ENCRYPTION_KEY');
    if (!key) throw new AppError(503, 'VERIFICATION_NOT_CONFIGURED', 'Identity verification storage is not configured');
    const provider = this.config.get<string>('VERIFICATION_PROVIDER') || 'manual';
    const auto = provider === 'manual' ? 'MANUAL_REVIEW' : 'PENDING';
    const record = await this.prisma.userVerification.upsert({
      where: { userId: user.id },
      update: {
        status: auto,
        provider,
        documentType: input.documentType,
        documentCountry: input.documentCountry.toUpperCase(),
        documentCipher: encryptString(input.document, key),
        selfieCipher: encryptString(input.selfie, key),
        livenessScore: input.livenessScore,
        submittedAt: new Date(),
      },
      create: {
        userId: user.id,
        status: auto,
        provider,
        documentType: input.documentType,
        documentCountry: input.documentCountry.toUpperCase(),
        documentCipher: encryptString(input.document, key),
        selfieCipher: encryptString(input.selfie, key),
        livenessScore: input.livenessScore,
        submittedAt: new Date(),
      },
    });
    await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'verification_submitted' } });
    return { status: record.status, submittedAt: record.submittedAt };
  }
}
