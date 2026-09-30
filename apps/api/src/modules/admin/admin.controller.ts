import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AccountStatus, Role } from '@prisma/client';
import { Roles } from '../../common/decorators';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/auth.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@Roles(Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview') overview() { return this.admin.overview(); }
  @Get('users') users(@Query('q') q?: string) { return this.admin.users(q); }
  @Patch('users/:id') setUser(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { status: AccountStatus }) { return this.admin.setUserStatus(actor, id, body.status); }
  @Get('verifications') verifications() { return this.admin.verifications(); }
  @Post('verifications/:id/decision') decide(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { status: 'VERIFIED' | 'FAILED' | 'MANUAL_REVIEW' | 'RESTRICTED'; note?: string }) { return this.admin.decideVerification(actor, id, body.status, body.note); }
  @Post('verifications/:id/document') document(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.admin.revealDocument(actor, id); }
  @Get('content') content() { return this.admin.content(); }
  @Post('moderation') moderate(@CurrentUser() actor: AuthUser, @Body() body: { targetType: string; targetId: string; action: string; note?: string }) { return this.admin.moderate(actor, body); }
  @Get('premium') premium() { return this.admin.premium(); }
  @Post('pricing') pricing(@CurrentUser() actor: AuthUser, @Body() body: { product: 'PERSONAL_PREMIUM' | 'BUSINESS_BLUE_TICK'; interval: 'MONTH' | 'YEAR'; countryCode?: string; currency: string; amountMinor: number; active?: boolean }) { return this.admin.upsertPrice(actor, body); }
  @Get('businesses') businesses() { return this.admin.businesses(); }
  @Post('business-verifications/:id/decision') businessDecision(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { status: 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | 'PENDING'; note?: string }) { return this.admin.decideBusiness(actor, id, body.status, body.note); }
  @Get('appointments') appointments() { return this.admin.appointments(); }
  @Get('commissions') commissions() { return this.admin.commissions(); }
  @Post('payments/:id/refund') refund(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.admin.refund(actor, id); }
  @Post('payouts/:id') payout(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { status: 'PAID' | 'FAILED' | 'HELD' }) { return this.admin.markPayout(actor, id, body.status); }
  @Get('ads') ads() { return this.admin.ads(); }
  @Post('ads/:id/decision') ad(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { status: 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'PAUSED' }) { return this.admin.decideAd(actor, id, body.status); }
  @Get('feature-flags') flags() { return this.admin.flags(); }
  @Post('feature-flags/:key') flag(@CurrentUser() actor: AuthUser, @Param('key') key: string, @Body() body: Record<string, unknown>) { return this.admin.saveFlag(actor, key, body); }
  @Get('countries') countries() { return this.admin.countries(); }
  @Post('countries/:code') country(@CurrentUser() actor: AuthUser, @Param('code') code: string, @Body() body: Record<string, unknown>) { return this.admin.saveCountry(actor, code, body); }
  @Get('legal') legal() { return this.admin.legal(); }
  @Post('legal') saveLegal(@CurrentUser() actor: AuthUser, @Body() body: { slug: string; title: string; body: string; locale?: string; countryCode?: string | null }) { return this.admin.saveLegal(actor, body); }
  @Get('audit-logs') audit() { return this.admin.auditLogs(); }
  @Get('analytics') analytics() { return this.admin.analytics(); }
  @Post('settings/:key') setting(@CurrentUser() actor: AuthUser, @Param('key') key: string, @Body() body: { value: unknown }) { return this.admin.setting(actor, key, body.value); }
}
