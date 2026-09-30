import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsArray, IsEmail, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser, Public } from '../../common/decorators';
import { BusinessService } from './business.service';

class CreateBusinessDto {
  @IsString() name!: string;
  @IsString() username!: string;
  @IsString() category!: string;
  @IsOptional() @IsString() subcategory?: string;
  @IsOptional() @IsString() description?: string;
  @IsString() countryCode!: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() timezone!: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() coverUrl?: string;
}

class ServiceDto {
  @IsString() name!: string;
  @IsString() description!: string;
  @IsString() category!: string;
  @IsInt() @Min(1) durationMinutes!: number;
  @IsInt() @Min(0) priceMinor!: number;
  @IsString() currency!: string;
  @IsOptional() @IsString() requirements?: string;
  @IsOptional() @IsString() cancellationPolicy?: string;
  @IsOptional() @IsArray() images?: string[];
}

@Controller()
export class BusinessController {
  constructor(private readonly businesses: BusinessService) {}

  @Post('businesses')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateBusinessDto) {
    return this.businesses.create(user, body);
  }

  @Public() @Get('businesses')
  directory(@Query('country') country?: string, @Query('category') category?: string, @Query('q') q?: string) {
    return this.businesses.directory({ country, category, q });
  }

  @Public() @Get('businesses/by/:username')
  view(@Param('username') username: string) {
    return this.businesses.publicProfile(username);
  }

  @Patch('businesses/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.businesses.update(user, id, body);
  }

  @Post('businesses/:id/services')
  addService(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: ServiceDto) {
    return this.businesses.addService(user, id, body);
  }

  @Patch('services/:id')
  updateService(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.businesses.updateService(user, id, body);
  }

  @Post('businesses/:id/hours')
  hours(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { rules: Array<{ weekday: number; startMinute: number; endMinute: number }> }) {
    return this.businesses.setHours(user, id, body.rules);
  }

  @Post('businesses/:id/blocks')
  block(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { startsAt: string; endsAt: string; reason?: string }) {
    return this.businesses.blockTime(user, id, body.startsAt, body.endsAt, body.reason);
  }

  @Post('businesses/:id/verification')
  verify(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { registrationNo?: string; document?: string; websiteDomain?: string }) {
    return this.businesses.submitVerification(user, id, body);
  }

  @Post('businesses/:id/blue-tick/checkout')
  blueTick(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { interval: 'MONTH' | 'YEAR'; idempotencyKey?: string }) {
    return this.businesses.subscribeBlueTick(user, id, body.interval, body.idempotencyKey);
  }

  @Post('businesses/:id/blue-tick/cancel')
  cancelBlue(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.businesses.cancelBlueTick(user, id);
  }

  @Get('businesses/:id/dashboard')
  dashboard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.businesses.dashboard(user, id);
  }
}
