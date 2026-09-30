import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/decorators';
import { AiService } from './ai.service';

class CaptionDto {
  @IsOptional() @IsString() topic?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() tone?: string;
  @IsOptional() @IsString() length?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() business?: string;
  @IsOptional() @IsString() action?: string;
}

@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('captions')
  captions(@CurrentUser() user: AuthUser, @Body() body: CaptionDto) {
    return this.ai.caption(user, body);
  }

  @Post('favorites')
  favorite(@CurrentUser() user: AuthUser, @Body() body: { caption: string; language: string }) {
    return this.ai.favorite(user, body.caption, body.language);
  }

  @Get('favorites')
  favorites(@CurrentUser() user: AuthUser) {
    return this.ai.favorites(user);
  }
}
