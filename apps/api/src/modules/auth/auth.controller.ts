import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, Public } from '../../common/decorators';
import { AuthUser } from '../../common/auth.guard';
import { AuthService } from './auth.service';

class RegisterDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsString() @MaxLength(30) username!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(2) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(12) language?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsBoolean() acceptTerms!: boolean;
  @IsBoolean() acceptPrivacy!: boolean;
}

class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

class GoogleDto {
  @IsString() idToken!: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() countryCode?: string;
  @IsOptional() @IsBoolean() acceptTerms?: boolean;
  @IsOptional() @IsBoolean() acceptPrivacy?: boolean;
}

class TokenDto {
  @IsString() token!: string;
}

class RefreshDto {
  @IsString() refreshToken!: string;
}

class ResetDto {
  @IsString() token!: string;
  @IsString() @MinLength(8) password!: string;
}

class EmailDto {
  @IsEmail() email!: string;
}

class PasswordChangeDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(8) nextPassword!: string;
}

class EmailChangeDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() password?: string;
}

@Throttle({ default: { limit: 20, ttl: 60000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('register')
  register(@Body() body: RegisterDto, @Req() req: { ip?: string; headers: Record<string, string> }) {
    return this.auth.register(body, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Public() @Post('login')
  login(@Body() body: LoginDto, @Req() req: { ip?: string; headers: Record<string, string> }) {
    return this.auth.login(body.email, body.password, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Public() @Post('google')
  google(@Body() body: GoogleDto, @Req() req: { ip?: string; headers: Record<string, string> }) {
    return this.auth.google(body.idToken, body, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Public() @Post('refresh')
  refresh(@Body() body: RefreshDto, @Req() req: { ip?: string; headers: Record<string, string> }) {
    return this.auth.refresh(body.refreshToken, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Public() @Post('logout')
  logout(@Body() body: RefreshDto) {
    return this.auth.logout(body.refreshToken);
  }

  @Public() @Post('verify-email')
  verify(@Body() body: TokenDto) {
    return this.auth.verifyEmail(body.token);
  }

  @Post('resend-verification')
  resend(@CurrentUser() user: AuthUser) {
    return this.auth.resendVerification(user);
  }

  @Public() @Post('forgot-password')
  forgot(@Body() body: EmailDto) {
    return this.auth.forgotPassword(body.email);
  }

  @Public() @Post('reset-password')
  reset(@Body() body: ResetDto) {
    return this.auth.resetPassword(body.token, body.password);
  }

  @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() body: PasswordChangeDto) {
    return this.auth.changePassword(user, body.currentPassword, body.nextPassword);
  }

  @Post('change-email')
  changeEmail(@CurrentUser() user: AuthUser, @Body() body: EmailChangeDto) {
    return this.auth.requestEmailChange(user, body.email, body.password);
  }

  @Public() @Post('confirm-email')
  confirmEmail(@Body() body: TokenDto) {
    return this.auth.confirmEmailChange(body.token);
  }
}
