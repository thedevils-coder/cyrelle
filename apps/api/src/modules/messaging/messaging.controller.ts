import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ConversationKind, MessageKind } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/decorators';
import { MessagingService } from './messaging.service';

class OpenDto {
  @IsEnum(ConversationKind) kind!: ConversationKind;
  @IsArray() memberIds!: string[];
  @IsOptional() @IsString() title?: string;
}

class MessageDto {
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsEnum(MessageKind) kind?: MessageKind;
  @IsOptional() @IsString() mediaUrl?: string;
  @IsOptional() @IsString() replyToId?: string;
  @IsOptional() forwarded?: boolean;
}

@Controller('conversations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get() list(@CurrentUser() user: AuthUser) { return this.messaging.list(user); }
  @Post() open(@CurrentUser() user: AuthUser, @Body() body: OpenDto) { return this.messaging.open(user, body); }
  @Get(':id/messages') messages(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.messaging.messages(user, id); }
  @Post(':id/messages') send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: MessageDto) { return this.messaging.send(user, id, body); }
  @Post(':id/read') read(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.messaging.read(user, id); }
  @Post(':id/typing') typing(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.messaging.typing(user, id); }
  @Post('messages/:messageId/reactions') react(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string, @Body() body: { emoji: string }) { return this.messaging.react(user, messageId, body.emoji); }
  @Delete('messages/:messageId') remove(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string) { return this.messaging.remove(user, messageId); }
}
