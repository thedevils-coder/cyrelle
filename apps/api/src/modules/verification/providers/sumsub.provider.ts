import { ConfigService } from '@nestjs/config';
import { SumsubClient, SumsubRequestError } from './sumsub.client';
import { EnsureApplicantInput, EnsureApplicantResult, IdentityVerificationProvider, SdkTokenInput } from './identity-verification.provider';
import { resolveSumsubRuntime, SumsubRuntimeInput } from '../sumsub/runtime';

export function readSumsubRuntimeInput(config: ConfigService): SumsubRuntimeInput {
  return {
    appToken: config.get<string>('SUMSUB_APP_TOKEN') ?? '',
    secretKey: config.get<string>('SUMSUB_SECRET_KEY') ?? '',
    webhookSecret: config.get<string>('SUMSUB_WEBHOOK_SECRET') ?? '',
    environment: config.get<string>('SUMSUB_ENVIRONMENT') ?? '',
    baseUrl: config.get<string>('SUMSUB_BASE_URL') ?? '',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    allowProduction: config.get<string>('ALLOW_SUMSUB_PRODUCTION') === 'true',
  };
}

export class SumsubIdentityVerificationProvider implements IdentityVerificationProvider {
  readonly name = 'sumsub';
  private readonly client: SumsubClient | null;
  readonly unavailableReason: string;

  constructor(config: ConfigService, fetchImpl?: typeof fetch) {
    const decision = resolveSumsubRuntime(readSumsubRuntimeInput(config), fetchImpl);
    this.client = decision.client;
    this.unavailableReason = decision.configured ? 'configured' : decision.reason;
  }

  configured(): boolean {
    return this.client !== null;
  }

  async ensureApplicant(input: EnsureApplicantInput): Promise<EnsureApplicantResult> {
    const client = this.required();
    const existing = await client.findByExternalUserId(input.externalUserId);
    if (existing) return { ...existing, created: false };
    try {
      const created = await client.createApplicant(input.levelName, input);
      return { ...created, created: true };
    } catch (error) {
      if (error instanceof SumsubRequestError && (error.status === 409 || error.status === 400)) {
        const again = await client.findByExternalUserId(input.externalUserId);
        if (again) return { ...again, created: false };
      }
      throw error;
    }
  }

  async createSdkToken(input: SdkTokenInput): Promise<{ token: string }> {
    const token = await this.required().createSdkToken(input);
    return { token };
  }

  async deactivateApplicant(applicantId: string): Promise<void> {
    await this.required().deactivate(applicantId);
  }

  private required(): SumsubClient {
    if (!this.client) throw new Error('Sumsub is not configured');
    return this.client;
  }
}
