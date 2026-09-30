import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MediaKind, StoryKind, Visibility } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser, Public } from '../../common/decorators';
import { SocialService } from './social.service';

class PostDto {
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
  @IsOptional() @IsEnum(Visibility) visibility?: Visibility;
  @IsOptional() @IsArray() hashtags?: string[];
  @IsOptional() @IsArray() mentions?: string[];
  @IsOptional() @IsString() location?: string;
  @IsOptional() poll?: { question: string; options: string[] };
  @IsOptional() @IsString() businessId?: string;
  @IsOptional() @IsArray() media?: Array<{ url: string; kind: MediaKind; altText?: string }>;
}

class CommentDto {
  @IsString() @MaxLength(1000) body!: string;
}

class StoryDto {
  @IsEnum(StoryKind) kind!: StoryKind;
  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsString() mediaUrl?: string;
  @IsOptional() @IsEnum(Visibility) visibility?: Visibility;
  @IsOptional() stickers?: unknown;
  @IsOptional() @IsArray() mentions?: string[];
  @IsOptional() poll?: unknown;
  @IsOptional() @IsString() question?: string;
  @IsOptional() @IsString() musicTrack?: string;
  @IsOptional() @IsString() linkUrl?: string;
  @IsOptional() @IsString() businessId?: string;
}

class ReelDto {
  @IsOptional() @IsString() caption?: string;
  @IsString() videoUrl!: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() durationMs?: number;
  @IsOptional() @IsArray() hashtags?: string[];
  @IsOptional() @IsArray() mentions?: string[];
  @IsOptional() edit?: unknown;
  @IsOptional() @IsString() audioTrack?: string;
  @IsOptional() @IsString() businessId?: string;
}

@Controller()
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('feed')
  feed(@CurrentUser() user: AuthUser, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.social.feed(user, { cursor, limit });
  }

  @Post('posts')
  createPost(@CurrentUser() user: AuthUser, @Body() body: PostDto) {
    return this.social.createPost(user, body);
  }

  @Public() @Get('posts/:id')
  getPost(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.social.getPost(id, user?.id);
  }

  @Patch('posts/:id')
  updatePost(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { body: string }) {
    return this.social.updatePost(user, id, body.body);
  }

  @Delete('posts/:id')
  deletePost(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.social.deletePost(user, id);
  }

  @Post('posts/:id/like') like(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.social.like(user, id); }
  @Delete('posts/:id/like') unlike(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.social.unlike(user, id); }
  @Post('posts/:id/save') save(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.social.save(user, id); }
  @Delete('posts/:id/save') unsave(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.social.unsave(user, id); }
  @Get('me/saved') saved(@CurrentUser() user: AuthUser) { return this.social.saved(user); }
  @Post('posts/:id/comments') comment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: CommentDto) { return this.social.comment(user, id, body.body); }
  @Get('posts/:id/comments') comments(@Param('id') id: string) { return this.social.comments(id); }
  @Post('posts/:id/share') share(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.social.share(user, id); }
  @Post('posts/:id/vote') vote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { option: number }) { return this.social.vote(user, id, body.option); }

  @Post('stories') createStory(@CurrentUser() user: AuthUser, @Body() body: StoryDto) { return this.social.createStory(user, body); }
  @Get('stories') stories(@CurrentUser() user: AuthUser) { return this.social.stories(user); }
  @Post('stories/:id/view') viewStory(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.social.viewStory(user, id); }
  @Post('stories/:id/react') react(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { emoji: string }) { return this.social.reactStory(user, id, body.emoji); }

  @Post('reels') createReel(@CurrentUser() user: AuthUser, @Body() body: ReelDto) { return this.social.createReel(user, body); }
  @Public() @Get('reels') reels(@Query('cursor') cursor?: string, @Query('limit') limit?: string, @CurrentUser() user?: AuthUser) { return this.social.reels({ cursor, limit }, user?.id); }
  @Post('reels/:id/like') likeReel(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.social.likeReel(user, id); }

  @Get('explore') explore(@CurrentUser() user: AuthUser) { return this.social.explore(user); }
  @Get('search') search(@CurrentUser() user: AuthUser, @Query('q') q = '', @Query('type') type?: string) { return this.social.search(user, q, type); }
}
