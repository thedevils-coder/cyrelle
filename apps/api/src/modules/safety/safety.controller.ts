import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { SosSource } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/decorators';
import { SafetyService } from './safety.service';

class ContactDto {
  @IsString() name!: string;
  @IsString() relationship!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
}

class SosDto {
  @IsEnum(SosSource) source!: SosSource;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsNumber() accuracyM?: number;
}

@Controller('safety')
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Get('config') config(@CurrentUser() user: AuthUser) { return this.safety.config(user); }
  @Get('contacts') contacts(@CurrentUser() user: AuthUser) { return this.safety.contacts(user); }
  @Post('contacts') add(@CurrentUser() user: AuthUser, @Body() body: ContactDto) { return this.safety.addContact(user, body); }
  @Delete('contacts/:id') remove(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.safety.removeContact(user, id); }
  @Post('sos') begin(@CurrentUser() user: AuthUser, @Body() body: SosDto) {
    return this.safety.begin(user, body.source, body.latitude == null ? undefined : { latitude: body.latitude, longitude: body.longitude ?? 0, accuracyM: body.accuracyM });
  }
  @Post('sos/:id/cancel') cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.safety.cancel(user, id); }
  @Post('sos/:id/activate') activate(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.safety.activate(user, id); }
  @Get('events') events(@CurrentUser() user: AuthUser) { return this.safety.events(user); }
  @Post('voice') voice(@CurrentUser() user: AuthUser, @Body() body: { eventId?: string; mediaUrl: string }) { return this.safety.saveVoice(user, body.eventId, body.mediaUrl); }
}
