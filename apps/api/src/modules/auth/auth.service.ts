import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import bcrypt from 'bcrypt';
import { registrationAgeDecision, validateUsername } from '@cyrelle/shared';
import { EmailTokenPurpose, Role } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { AuthUser, authUserInclude } from '../../common/auth.guard';
import { randomToken, sha256 } from '../../common/crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private googleClient?: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async register(input: {
    name: string;
    username: string;
    email: string;
    password: string;
    dateOfBirth?: string;
    countryCode?: string;
    language?: string;
    currency?: string;
    acceptTerms: boolean;
    acceptPrivacy: boolean;
  }, meta: RequestMeta) {
    this.assertPassword(input.password);
    if (!input.acceptTerms || !input.acceptPrivacy) {
      throw new AppError(400, 'TERMS_REQUIRED', 'Accept the terms and privacy policy to continue');
    }
    const username = this.username(input.username);
    const country = await this.country(input.countryCode);
    this.assertAge(input.dateOfBirth, country?.minAccountAge ?? null);
    const email = input.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          profile: {
            create: {
              displayName: input.name.trim(),
              username,
              countryCode: country?.code,
              timezone: country?.timeZones[0] || 'UTC',
              dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
            },
          },
          settings: {
            create: {
              language: (input.language || country?.languages[0] || 'en').toLowerCase(),
              currency: (input.currency || country?.currency || 'USD').toUpperCase(),
            },
          },
          verification: { create: {} },
        },
        include: authUserInclude,
      });
      const preview = await this.issueEmailToken(user.id, user.email, EmailTokenPurpose.VERIFY_EMAIL, 'Verify your Cyrelle email', 'Confirm your email to secure your Cyrelle account.');
      await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'registration', props: { method: 'email', country: country?.code ?? null } } });
      const session = await this.issueSession(user, meta);
      return { ...session, devPreview: preview };
    } catch (error) {
      this.rethrowConflict(error);
      throw error;
    }
  }

  async login(email: string, password: string, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: authUserInclude });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    this.assertCanAuthenticate(user);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.mail.send(user.email, 'security-login', 'New sign-in to Cyrelle', 'A new sign-in was recorded on your Cyrelle account. If this was not you, reset your password.');
    return this.issueSession(user, meta);
  }

  async google(idToken: string, extras: { username?: string; name?: string; countryCode?: string; acceptTerms?: boolean; acceptPrivacy?: boolean }, meta: RequestMeta) {
    const identity = await this.verifyGoogle(idToken);
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleSub: identity.sub }, { email: identity.email }] },
      include: authUserInclude,
    });
    if (user) {
      this.assertCanAuthenticate(user);
      if (!user.googleSub) {
        user = await this.prisma.user.update({ where: { id: user.id }, data: { googleSub: identity.sub, emailVerifiedAt: user.emailVerifiedAt ?? new Date() }, include: authUserInclude });
      }
    } else {
      if (!extras.acceptTerms || !extras.acceptPrivacy) {
        throw new AppError(400, 'TERMS_REQUIRED', 'Accept the terms and privacy policy to continue');
      }
      const country = await this.country(extras.countryCode);
      const base = extras.username || identity.email.split('@')[0] || 'member';
      const username = await this.availableUsername(base);
      user = await this.prisma.user.create({
        data: {
          email: identity.email,
          emailVerifiedAt: new Date(),
          googleSub: identity.sub,
          profile: {
            create: {
              displayName: (extras.name || identity.name || username).trim(),
              username,
              countryCode: country?.code,
              timezone: country?.timeZones[0] || 'UTC',
              avatarUrl: identity.picture,
            },
          },
          settings: { create: { language: country?.languages[0] || 'en', currency: country?.currency || 'USD' } },
          verification: { create: {} },
        },
        include: authUserInclude,
      });
      await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'registration', props: { method: 'google' } } });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueSession(user, meta);
  }

  async refresh(refreshToken: string, meta: RequestMeta) {
    const existing = await this.prisma.refreshSession.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!existing || existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Sign in required');
    }
    await this.prisma.refreshSession.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    const user = await this.prisma.user.findUnique({ where: { id: existing.userId }, include: authUserInclude });
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in required');
    this.assertCanAuthenticate(user);
    return this.issueSession(user, meta);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({ where: { tokenHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async verifyEmail(token: string) {
    const userId = await this.consumeToken(token, EmailTokenPurpose.VERIFY_EMAIL);
    const user = await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() }, include: authUserInclude });
    return this.publicAccount(user);
  }

  async resendVerification(user: AuthUser) {
    if (user.emailVerifiedAt) return { sent: false };
    const devPreview = await this.issueEmailToken(user.id, user.email, EmailTokenPurpose.VERIFY_EMAIL, 'Verify your Cyrelle email', 'Confirm your email to secure your Cyrelle account.');
    return { sent: true, devPreview };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || user.deletedAt) return { sent: true };
    const devPreview = await this.issueEmailToken(user.id, user.email, EmailTokenPurpose.RESET_PASSWORD, 'Reset your Cyrelle password', 'Use this link to choose a new password. If you did not ask for this, you can ignore the email.');
    return { sent: true, devPreview };
  }

  async resetPassword(token: string, password: string) {
    this.assertPassword(password);
    const userId = await this.consumeToken(token, EmailTokenPurpose.RESET_PASSWORD);
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await this.prisma.refreshSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.mail.send(user.email, 'security-password', 'Your Cyrelle password changed', 'Your password was just reset. If this was not you, contact Cyrelle support.');
    return { reset: true };
  }

  async changePassword(user: AuthUser, currentPassword: string, nextPassword: string) {
    this.assertPassword(nextPassword);
    if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new AppError(400, 'INVALID_CREDENTIALS', 'Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(nextPassword, 12), tokenVersion: { increment: 1 } },
    });
    await this.prisma.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.mail.send(user.email, 'security-password', 'Your Cyrelle password changed', 'Your password was just changed.');
    return { changed: true };
  }

  async requestEmailChange(user: AuthUser, email: string, password?: string) {
    if (user.passwordHash) {
      if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
        throw new AppError(400, 'INVALID_CREDENTIALS', 'Current password is incorrect');
      }
    }
    const next = email.trim().toLowerCase();
    const taken = await this.prisma.user.findUnique({ where: { email: next } });
    if (taken) throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with that email already exists');
    await this.prisma.user.update({ where: { id: user.id }, data: { pendingEmail: next } });
    const devPreview = await this.issueEmailToken(user.id, next, EmailTokenPurpose.CHANGE_EMAIL, 'Confirm your new Cyrelle email', 'Confirm this address to finish changing your Cyrelle email.', next);
    return { sent: true, devPreview };
  }

  async confirmEmailChange(token: string) {
    const record = await this.findToken(token, EmailTokenPurpose.CHANGE_EMAIL);
    const next = record.payload;
    if (!next) throw new AppError(400, 'TOKEN_INVALID', 'This link is not valid');
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { email: next, pendingEmail: null, emailVerifiedAt: new Date(), tokenVersion: { increment: 1 } },
    });
    await this.prisma.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await this.mail.send(next, 'security-email', 'Your Cyrelle email changed', 'The email on your Cyrelle account was changed.');
    return { email: next };
  }

  async issueSession(user: AuthUser, meta: RequestMeta) {
    const accessToken = await this.jwt.signAsync({ sub: user.id, tv: user.tokenVersion, role: user.role });
    const refreshToken = randomToken();
    const days = Number(this.config.get('REFRESH_DAYS') || 30);
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });
    return { accessToken, refreshToken, account: this.publicAccount(user) };
  }

  publicAccount(user: AuthUser) {
    return {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      role: user.role,
      status: user.accountStatus,
      profile: user.profile
        ? {
            displayName: user.profile.displayName,
            username: user.profile.username,
            bio: user.profile.bio,
            avatarUrl: user.profile.avatarUrl,
            countryCode: user.profile.countryCode,
            city: user.profile.city,
            timezone: user.profile.timezone,
          }
        : null,
      settings: user.settings
        ? {
            language: user.settings.language,
            currency: user.settings.currency,
            theme: user.settings.theme,
            highContrast: user.settings.highContrast,
          }
        : null,
    };
  }

  private async issueEmailToken(userId: string, email: string, purpose: EmailTokenPurpose, subject: string, intro: string, payload?: string) {
    const token = randomToken();
    await this.prisma.emailToken.create({
      data: {
        userId,
        purpose,
        tokenHash: sha256(token),
        payload,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });
    const link = `${this.config.get('WEB_ORIGIN') || 'http://localhost:5173'}/account?token=${token}&purpose=${purpose}`;
    await this.mail.send(email, purpose, subject, `${intro}\n\n${link}`);
    if (this.config.get('NODE_ENV') === 'production') return undefined;
    return { token, purpose };
  }

  private async consumeToken(token: string, purpose: EmailTokenPurpose) {
    const record = await this.findToken(token, purpose);
    await this.prisma.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return record.userId;
  }

  private async findToken(token: string, purpose: EmailTokenPurpose) {
    const record = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new AppError(400, 'TOKEN_INVALID', 'This link is not valid anymore');
    }
    return record;
  }

  private async verifyGoogle(idToken: string): Promise<{ sub: string; email: string; name?: string; picture?: string }> {
    const allowDev = this.config.get('NODE_ENV') !== 'production' && this.config.get('ALLOW_DEV_GOOGLE') === 'true';
    if (allowDev && idToken.startsWith('dev:')) {
      const email = idToken.slice(4).trim().toLowerCase();
      if (!email.includes('@')) throw new AppError(400, 'GOOGLE_TOKEN_INVALID', 'Google sign-in could not be verified');
      return { sub: `dev:${email}`, email, name: email.split('@')[0] };
    }
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured');
    this.googleClient ??= new OAuth2Client(clientId);
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.sub) throw new Error('missing email');
      return { sub: payload.sub, email: payload.email.toLowerCase(), name: payload.name, picture: payload.picture };
    } catch {
      throw new AppError(401, 'GOOGLE_TOKEN_INVALID', 'Google sign-in could not be verified');
    }
  }

  private username(raw: string): string {
    const result = validateUsername(raw);
    if (!result.ok) throw new AppError(400, result.code, 'Choose a username of 3–30 letters, numbers, or underscores');
    return result.username;
  }

  private async availableUsername(raw: string): Promise<string> {
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/^[^a-z]+/, '') || 'member';
    for (let i = 0; i < 20; i += 1) {
      const candidate = i === 0 ? cleaned.slice(0, 30) : `${cleaned.slice(0, 24)}_${i}`;
      const result = validateUsername(candidate);
      if (!result.ok) continue;
      const taken = await this.prisma.userProfile.findUnique({ where: { username: result.username } });
      if (!taken) return result.username;
    }
    return this.username(`member_${randomToken(4).slice(0, 8)}`);
  }

  private async country(code?: string) {
    if (!code) return null;
    return this.prisma.country.findUnique({ where: { code: code.toUpperCase() } });
  }

  private assertAge(dateOfBirth: string | undefined, minAccountAge: number | null) {
    const decision = registrationAgeDecision({ dateOfBirth, minAccountAge });
    if (decision === 'dob_required') throw new AppError(400, 'DATE_OF_BIRTH_REQUIRED', 'A date of birth is required for your selected country');
    if (decision === 'under_minimum') throw new AppError(400, 'AGE_REQUIREMENT', 'You do not meet the minimum age configured for your selected country');
  }

  private assertPassword(password: string) {
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      throw new AppError(400, 'PASSWORD_WEAK', 'Use at least 8 characters with a letter and a number');
    }
  }

  private assertCanAuthenticate(user: { accountStatus: string; deletedAt: Date | null }) {
    if (user.deletedAt || user.accountStatus === 'BANNED' || user.accountStatus === 'SUSPENDED') {
      throw new AppError(403, 'ACCOUNT_BLOCKED', 'This account cannot sign in');
    }
  }

  private rethrowConflict(error: unknown): void {
    if ((error as { code?: string }).code === 'P2002') {
      throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with that email or username already exists');
    }
  }
}

export const staffRoles: Role[] = [Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN];
