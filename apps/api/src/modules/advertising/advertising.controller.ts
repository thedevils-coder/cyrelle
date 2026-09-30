import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AdPlacement } from '@prisma/client';
import { IsArray, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser, Public } from '../../common/decorators';
import { AdvertisingService } from './advertising.service';

@Controller('ads')
export class AdvertisingController {
  constructor(private readonly ads: AdvertisingService) {}

  @Public() @Get('placement/:placement')
  serve(@Param('placement') placement: AdPlacement, @CurrentUser() user?: AuthUser) {
    return this.ads.serve(placement, user);
  }

  @Public() @Post(':id/impression')
  impression(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.ads.impression(id, user);
  }

  @Public() @Post(':id/click')
  click(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.ads.click(id, user);
  }

  @Post('campaigns')
  create(@CurrentUser() user: AuthUser, @Body() body: { name: string; budgetMinor: number; currency: string; businessId?: string; countries?: string[]; languages?: string[] }) {
    return this.ads.createCampaign(user, body);
  }

  @Post('campaigns/:id/creatives')
  creative(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { placement: AdPlacement; label: 'SPONSORED' | 'ADVERTISEMENT' | 'PROMOTED'; title: string; body: string; destination: string; mediaUrl?: string }) {
    return this.ads.addCreative(user, id, body);
  }
}
