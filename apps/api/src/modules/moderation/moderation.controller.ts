import { Body, Controller, Param, Post } from '@nestjs/common';
import { ReportTarget } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/decorators';
import { ModerationService } from './moderation.service';

class ReportDto {
  @IsEnum(ReportTarget) targetType!: ReportTarget;
  @IsString() targetId!: string;
  @IsString() reason!: string;
  @IsOptional() @IsString() details?: string;
}

@Controller()
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Post('reports')
  report(@CurrentUser() user: AuthUser, @Body() body: ReportDto) {
    return this.moderation.report(user, body);
  }

  @Post('blocks/:username')
  block(@CurrentUser() user: AuthUser, @Param('username') username: string) {
    return this.moderation.block(user, username);
  }

  @Post('mute')
  mute(@CurrentUser() user: AuthUser, @Body() body: { targetType: string; targetId: string }) {
    return this.moderation.mute(user, body.targetType, body.targetId);
  }

  @Post('hide')
  hide(@CurrentUser() user: AuthUser, @Body() body: { targetType: string; targetId: string; reason?: string }) {
    return this.moderation.hide(user, body.targetType, body.targetId, body.reason);
  }
}
