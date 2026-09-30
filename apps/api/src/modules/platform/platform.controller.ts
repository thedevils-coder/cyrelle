import { Controller, Get, Param, Query } from '@nestjs/common';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser, Public } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';

@Controller()
export class PlatformController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Public() @Get('countries')
  countries() {
    return this.prisma.country.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  @Public() @Get('currencies')
  currencies() {
    return this.prisma.currency.findMany({ where: { active: true }, orderBy: { code: 'asc' } });
  }

  @Public() @Get('languages')
  languages() {
    return this.prisma.language.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  @Public() @Get('legal/:slug')
  async legal(@Param('slug') slug: string, @Query('country') country?: string, @Query('locale') locale = 'en') {
    const specific = country
      ? await this.prisma.legalDocument.findFirst({ where: { slug, countryCode: country.toUpperCase(), locale } })
      : null;
    const global = await this.prisma.legalDocument.findFirst({ where: { slug, countryCode: null, locale } });
    const fallback = await this.prisma.legalDocument.findFirst({ where: { slug, countryCode: null, locale: 'en' } });
    const document = specific || global || fallback;
    if (!document) return { slug, title: slug, body: '' };
    return document;
  }

  @Get('features')
  features(@CurrentUser() user: AuthUser, @Query('platform') platform?: string) {
    return this.entitlements.features(user.id, platform);
  }
}
