import { Module } from '@nestjs/common';
import { IdentityVerificationController } from './identity-verification.controller';
import { IdentityVerificationService } from './identity-verification.service';
import { SumsubWebhookService } from './sumsub-webhook.service';
import { VerificationController } from './verification.controller';

@Module({
  controllers: [IdentityVerificationController, VerificationController],
  providers: [IdentityVerificationService, SumsubWebhookService],
  exports: [IdentityVerificationService],
})
export class VerificationModule {}
