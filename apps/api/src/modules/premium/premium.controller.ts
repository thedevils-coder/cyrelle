import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BillingInterval } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser, Public } from '../../common/decorators';
import { PremiumService } from './premium.service';

class CheckoutDto {
  @IsEnum(BillingInterval) interval!: BillingInterval;
  @IsOptional() @IsString() idempotencyKey?: string;
}

@Controller()
export class PremiumController {
  constructor(private readonly premium: PremiumService) {}

  @Public() @Get('plans')
  plans(@Query('country') country?: string) {
    return this.premium.plans(country);
  }

  @Post('premium/checkout')
  checkout(@CurrentUser() user: AuthUser, @Body() body: CheckoutDto) {
    return this.premium.checkout(user, body.interval, body.idempotencyKey);
  }

  @Post('premium/cancel')
  cancel(@CurrentUser() user: AuthUser) {
    return this.premium.cancel(user);
  }

  @Get('premium/billing')
  billing(@CurrentUser() user: AuthUser) {
    return this.premium.billing(user);
  }
}
