import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser, Public } from '../../common/decorators';
import { IdentityVerificationService } from './identity-verification.service';
import { SumsubWebhookService } from './sumsub-webhook.service';

class StartDto {
  @IsOptional()
  @IsString()
  @MaxLength(12)
  language?: string;
}

@Controller('identity-verification')
export class IdentityVerificationController {
  constructor(
    private readonly identity: IdentityVerificationService,
    private readonly webhooks: SumsubWebhookService,
  ) {}

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('start')
  start(@CurrentUser() user: AuthUser, @Body() _body: StartDto) {
    return this.identity.start(user);
  }

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.identity.status(user);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('retry')
  retry(@CurrentUser() user: AuthUser, @Body() _body: StartDto) {
    return this.identity.retry(user);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('token')
  token(@CurrentUser() user: AuthUser, @Body() _body: StartDto) {
    return this.identity.refreshToken(user);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser) {
    return this.identity.history(user);
  }

  @Public()
  @Throttle({ default: { limit: 180, ttl: 60000 } })
  @HttpCode(200)
  @Post('sumsub/webhook')
  webhook(@Req() request: { rawBody?: Buffer; headers: Record<string, string | string[] | undefined> }) {
    return this.webhooks.handle(request.rawBody, request.headers || {});
  }
}
