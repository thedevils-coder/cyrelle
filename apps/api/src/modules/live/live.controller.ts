import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser, Public } from '../../common/decorators';
import { LiveService } from './live.service';

class StartDto {
  @IsString() title!: string;
  @IsOptional() @IsString() businessId?: string;
}

@Controller('live')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Post() start(@CurrentUser() user: AuthUser, @Body() body: StartDto) { return this.live.start(user, body); }
  @Post(':id/end') end(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.live.end(user, id); }
  @Public() @Get() list() { return this.live.list(); }
  @Post(':id/join') join(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.live.join(user, id); }
  @Post(':id/comments') comment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { body: string }) { return this.live.comment(user, id, body.body); }
  @Post(':id/reactions') react(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { emoji: string }) { return this.live.react(user, id, body.emoji); }
  @Post(':id/moderate') moderate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { blockUserId?: string; pinCommentId?: string; slowMode?: boolean }) {
    return this.live.moderate(user, id, body);
  }
}
