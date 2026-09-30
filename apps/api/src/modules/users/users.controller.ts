import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser, Public } from '../../common/decorators';
import { UsersService } from './users.service';

class ProfileDto {
  @IsOptional() @IsString() @MaxLength(80) displayName?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() @MaxLength(300) bio?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() countryCode?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsArray() interests?: string[];
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() timezone?: string;
}

class SettingsDto {
  @IsOptional() @IsIn(['PUBLIC', 'FOLLOWERS', 'PRIVATE']) profileVisibility?: string;
  @IsOptional() @IsIn(['EVERYONE', 'FOLLOWING', 'NONE']) messagePermission?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsIn(['LIGHT', 'DARK', 'SYSTEM']) theme?: string;
  @IsOptional() @IsBoolean() highContrast?: boolean;
  @IsOptional() @IsString() premiumAccent?: string;
  @IsOptional() @IsBoolean() notifyEmail?: boolean;
  @IsOptional() @IsBoolean() notifyPush?: boolean;
  @IsOptional() @IsBoolean() shakeSosEnabled?: boolean;
  @IsOptional() @IsBoolean() autoSosEnabled?: boolean;
  @IsOptional() sosCountdownMs?: number;
  @IsOptional() @IsBoolean() shareLocationOnSos?: boolean;
}

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user);
  }

  @Get('me/entitlements')
  async entitlements(@CurrentUser() user: AuthUser) {
    const me = await this.users.me(user);
    return {
      plan: me.plan,
      entitlements: me.entitlements,
      premiumBlueTick: me.premiumBlueTick,
      blueTick: me.blueTick,
      subscription: me.subscription,
      businesses: me.businesses,
    };
  }

  @Get('me/analytics')
  analytics(@CurrentUser() user: AuthUser) {
    return this.users.analytics(user);
  }

  @Patch('me/profile')
  profile(@CurrentUser() user: AuthUser, @Body() body: ProfileDto) {
    return this.users.updateProfile(user, body);
  }

  @Patch('me/settings')
  settings(@CurrentUser() user: AuthUser, @Body() body: SettingsDto) {
    return this.users.updateSettings(user, body as Record<string, unknown>);
  }

  @Delete('me')
  remove(@CurrentUser() user: AuthUser) {
    return this.users.deleteAccount(user);
  }

  @Public()
  @Get('users/:username')
  view(@Param('username') username: string, @CurrentUser() user?: AuthUser) {
    return this.users.publicProfile(username, user);
  }

  @Post('users/:username/follow')
  follow(@CurrentUser() user: AuthUser, @Param('username') username: string) {
    return this.users.follow(user, username);
  }

  @Delete('users/:username/follow')
  unfollow(@CurrentUser() user: AuthUser, @Param('username') username: string) {
    return this.users.unfollow(user, username);
  }

  @Post('users/:username/follow-response')
  respond(@CurrentUser() user: AuthUser, @Param('username') username: string, @Body() body: { accept: boolean }) {
    return this.users.respondFollow(user, username, Boolean(body.accept));
  }

  @Get('users/:username/followers')
  followers(@Param('username') username: string) {
    return this.users.followers(username);
  }

  @Get('users/:username/following')
  following(@Param('username') username: string) {
    return this.users.following(username);
  }
}
