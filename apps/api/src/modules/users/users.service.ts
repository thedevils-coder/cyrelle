import { Injectable } from '@nestjs/common';
import { accessibleAccentLabel, validateUsername } from '@cyrelle/shared';
import { Visibility } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { AuthUser } from '../../common/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { MailService } from '../mail/mail.service';
import { IdentityVerificationService } from '../verification/identity-verification.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly mail: MailService,
    private readonly identity: IdentityVerificationService,
  ) {}

  async me(user: AuthUser) {
    const [personal, counts, businesses] = await Promise.all([
      this.entitlements.personal(user.id),
      this.counts(user.id),
      this.prisma.businessMember.findMany({
        where: { userId: user.id },
        include: { business: true },
      }),
    ]);
    const businessStates = await Promise.all(
      businesses.map(async (member) => ({
        id: member.business.id,
        name: member.business.name,
        username: member.business.username,
        role: member.role,
        ...(await this.entitlements.business(member.business.id)),
      })),
    );
    return {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      role: user.role,
      status: user.accountStatus,
      profile: user.profile,
      settings: this.publicSettings(user),
      verification: {
        status: user.verification?.status ?? 'NOT_STARTED',
        submittedAt: user.verification?.submittedAt ?? null,
        reviewedAt: user.verification?.reviewedAt ?? null,
      },
      plan: personal.plan,
      entitlements: personal.entitlements,
      premiumBlueTick: personal.premiumBlueTick,
      blueTick: personal.blueTickVisible,
      subscription: personal.subscription,
      counts,
      businesses: businessStates,
    };
  }

  async updateProfile(user: AuthUser, input: { displayName?: string; username?: string; bio?: string; city?: string; countryCode?: string; website?: string; interests?: string[]; dateOfBirth?: string; timezone?: string }) {
    if (!user.profile) throw new AppError(400, 'PROFILE_MISSING', 'Create your profile first');
    let username = user.profile.username;
    if (input.username && input.username.toLowerCase() !== user.profile.username) {
      const validated = validateUsername(input.username);
      if (!validated.ok) throw new AppError(400, validated.code, 'Choose a different username');
      username = validated.username;
    }
    const profile = await this.prisma.userProfile.update({
      where: { userId: user.id },
      data: {
        displayName: input.displayName?.trim() || undefined,
        username,
        bio: input.bio,
        city: input.city,
        countryCode: input.countryCode?.toUpperCase(),
        website: input.website,
        interests: input.interests,
        timezone: input.timezone,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      },
    });
    return profile;
  }

  async updateSettings(user: AuthUser, input: Record<string, unknown>) {
    const personal = await this.entitlements.personal(user.id);
    let premiumAccent = input.premiumAccent as string | undefined;
    if (premiumAccent) {
      if (!personal.entitlements.includes('PROFILE_CUSTOMIZATION')) {
        throw new AppError(403, 'ENTITLEMENT_REQUIRED', 'Accent colors are a Premium customization');
      }
      const accent = accessibleAccentLabel(premiumAccent);
      if (!accent) throw new AppError(400, 'CONTRAST_FAILED', 'Choose an accent with enough contrast for text');
      premiumAccent = premiumAccent.startsWith('#') ? premiumAccent : `#${premiumAccent}`;
    }
    const settings = await this.prisma.userSettings.update({
      where: { userId: user.id },
      data: {
        profileVisibility: input.profileVisibility as Visibility | undefined,
        messagePermission: input.messagePermission as string | undefined,
        language: input.language as string | undefined,
        currency: (input.currency as string | undefined)?.toUpperCase(),
        theme: input.theme as string | undefined,
        highContrast: input.highContrast as boolean | undefined,
        premiumAccent: premiumAccent === undefined ? undefined : premiumAccent,
        notifyEmail: input.notifyEmail as boolean | undefined,
        notifyPush: input.notifyPush as boolean | undefined,
        shakeSosEnabled: input.shakeSosEnabled as boolean | undefined,
        autoSosEnabled: input.autoSosEnabled as boolean | undefined,
        sosCountdownMs: input.sosCountdownMs as number | undefined,
        shareLocationOnSos: input.shareLocationOnSos as boolean | undefined,
      },
    });
    return settings;
  }

  async publicProfile(username: string, viewer?: AuthUser) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { username: username.toLowerCase() },
      include: { user: { include: { verification: true, settings: true } } },
    });
    if (!profile || profile.user.deletedAt || profile.user.accountStatus === 'BANNED') {
      throw new AppError(404, 'NOT_FOUND', 'Profile not found');
    }
    if (viewer) {
      const blocked = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: viewer.id, blockedId: profile.userId },
            { blockerId: profile.userId, blockedId: viewer.id },
          ],
        },
      });
      if (blocked) throw new AppError(404, 'NOT_FOUND', 'Profile not found');
    }
    const personal = await this.entitlements.personal(profile.userId);
    const counts = await this.counts(profile.userId);
    const isPrivate = profile.user.settings?.profileVisibility === 'PRIVATE' && viewer?.id !== profile.userId;
    let canView = !isPrivate;
    if (isPrivate && viewer) {
      const follow = await this.prisma.follow.findUnique({ where: { followerId_followeeId: { followerId: viewer.id, followeeId: profile.userId } } });
      canView = follow?.status === 'ACCEPTED';
    }
    if (viewer?.id === profile.userId) {
      await this.prisma.analyticsEvent.create({ data: { userId: viewer.id, name: 'profile_view_self' } });
    } else if (viewer) {
      await this.prisma.analyticsEvent.create({ data: { userId: profile.userId, name: 'profile_view', props: { viewerId: viewer.id } } });
    }
    return {
      id: profile.userId,
      displayName: profile.displayName,
      username: profile.username,
      bio: canView ? profile.bio : null,
      avatarUrl: profile.avatarUrl,
      countryCode: profile.countryCode,
      city: canView ? profile.city : null,
      website: canView ? profile.website : null,
      blueTick: personal.blueTickVisible,
      plan: personal.plan === 'PREMIUM' ? 'PREMIUM' : 'BASIC',
      counts,
      isPrivate,
      canView,
    };
  }

  async follow(user: AuthUser, username: string) {
    const target = await this.mustProfile(username);
    if (target.userId === user.id) throw new AppError(400, 'INVALID_FOLLOW', 'You cannot follow yourself');
    const targetUser = await this.prisma.user.findUnique({ where: { id: target.userId }, include: { settings: true } });
    const status = targetUser?.settings?.profileVisibility === 'PRIVATE' ? 'REQUESTED' : 'ACCEPTED';
    const follow = await this.prisma.follow.upsert({
      where: { followerId_followeeId: { followerId: user.id, followeeId: target.userId } },
      update: { status },
      create: { followerId: user.id, followeeId: target.userId, status },
    });
    await this.prisma.notification.create({
      data: {
        userId: target.userId,
        kind: status === 'REQUESTED' ? 'FOLLOW_REQUEST' : 'FOLLOW',
        title: status === 'REQUESTED' ? 'Follow request' : 'New follower',
        body: `${user.profile?.displayName ?? 'Someone'} ${status === 'REQUESTED' ? 'requested to follow you' : 'followed you'}`,
        data: { username: user.profile?.username },
      },
    });
    await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'follow', props: { target: target.userId } } });
    return follow;
  }

  async unfollow(user: AuthUser, username: string) {
    const target = await this.mustProfile(username);
    await this.prisma.follow.deleteMany({ where: { followerId: user.id, followeeId: target.userId } });
    return { following: false };
  }

  async respondFollow(user: AuthUser, followerUsername: string, accept: boolean) {
    const follower = await this.mustProfile(followerUsername);
    if (!accept) {
      await this.prisma.follow.deleteMany({ where: { followerId: follower.userId, followeeId: user.id } });
      return { status: 'REJECTED' };
    }
    return this.prisma.follow.update({
      where: { followerId_followeeId: { followerId: follower.userId, followeeId: user.id } },
      data: { status: 'ACCEPTED' },
    });
  }

  async followers(username: string) {
    const profile = await this.mustProfile(username);
    const rows = await this.prisma.follow.findMany({
      where: { followeeId: profile.userId, status: 'ACCEPTED' },
      include: { follower: { include: { profile: true } } },
      take: 50,
    });
    return rows.map((row) => this.card(row.follower.profile));
  }

  async following(username: string) {
    const profile = await this.mustProfile(username);
    const rows = await this.prisma.follow.findMany({
      where: { followerId: profile.userId, status: 'ACCEPTED' },
      include: { followee: { include: { profile: true } } },
      take: 50,
    });
    return rows.map((row) => this.card(row.followee.profile));
  }

  async deleteAccount(user: AuthUser) {
    const stamp = `deleted_${user.id.slice(-8)}`;
    const providerRelease = await this.identity.releaseProviderApplicant(user.id);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          accountStatus: 'PENDING_DELETION',
          deletedAt: new Date(),
          deletionScheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          email: `${stamp}@deleted.cyrelle.invalid`,
          googleSub: null,
          pendingEmail: null,
          passwordHash: null,
          tokenVersion: { increment: 1 },
        },
      }),
      this.prisma.userProfile.update({
        where: { userId: user.id },
        data: { displayName: 'Deleted member', username: stamp, bio: null, avatarUrl: null, city: null, website: null, interests: [], dateOfBirth: null },
      }),
      this.prisma.userVerification.updateMany({
        where: { userId: user.id },
        data: {
          status: 'CANCELLED',
          documentCipher: null,
          selfieCipher: null,
          documentType: null,
          documentCountry: null,
          providerRef: null,
          providerApplicantId: null,
          providerInspectionId: null,
          externalUserId: null,
          failureReason: null,
          reviewReason: null,
          reviewNote: null,
          livenessScore: null,
          canRetry: false,
        },
      }),
      this.prisma.emergencyContact.deleteMany({ where: { userId: user.id } }),
      this.prisma.refreshSession.deleteMany({ where: { userId: user.id } }),
      this.prisma.emailToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.post.updateMany({ where: { authorId: user.id }, data: { status: 'REMOVED', body: null } }),
      this.prisma.story.updateMany({ where: { authorId: user.id }, data: { status: 'REMOVED', text: null, mediaUrl: null } }),
      this.prisma.reel.updateMany({ where: { authorId: user.id }, data: { status: 'REMOVED', caption: null } }),
      this.prisma.message.updateMany({ where: { senderId: user.id }, data: { deletedAt: new Date(), body: null } }),
    ]);
    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: 'account.deletion_requested', metadata: { retention: 'Financial and appointment records are retained where legally required.' } },
    });
    if (user.email && !user.email.endsWith('@deleted.cyrelle.invalid')) {
      await this.mail.send(user.email, 'account-deletion', 'Cyrelle account deletion', 'Your personal profile and content are being removed. Transaction records may be retained where the law requires it.');
    }
    return {
      deleted: true,
      retention: 'Transaction, appointment, and commission records may be retained where legally required. Cyrelle removes its verification references now. Permanent deletion of data held by the verification provider follows that provider’s process and is not completed by this request.',
      providerDeactivated: providerRelease.deactivated,
      providerDataDeleted: providerRelease.permanentDeletion,
    };
  }

  async analytics(user: AuthUser) {
    const personal = await this.entitlements.personal(user.id);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [posts, reels, followers, views] = await Promise.all([
      this.prisma.post.count({ where: { authorId: user.id, status: 'PUBLISHED' } }),
      this.prisma.reel.count({ where: { authorId: user.id, status: 'PUBLISHED' } }),
      this.prisma.follow.count({ where: { followeeId: user.id, status: 'ACCEPTED', createdAt: { gte: since } } }),
      this.prisma.analyticsEvent.count({ where: { userId: user.id, name: 'profile_view', createdAt: { gte: since } } }),
    ]);
    const standard = { posts, reels, newFollowers30d: followers, profileViews30d: views };
    if (!personal.entitlements.includes('ADVANCED_ANALYTICS')) return { level: 'standard', ...standard };
    const likes = await this.prisma.like.count({ where: { post: { authorId: user.id } } });
    return { level: 'advanced', ...standard, postLikes: likes, reachEstimate: views + likes + followers };
  }

  private async counts(userId: string) {
    const [followers, following, posts] = await Promise.all([
      this.prisma.follow.count({ where: { followeeId: userId, status: 'ACCEPTED' } }),
      this.prisma.follow.count({ where: { followerId: userId, status: 'ACCEPTED' } }),
      this.prisma.post.count({ where: { authorId: userId, status: 'PUBLISHED' } }),
    ]);
    return { followers, following, posts };
  }

  private async mustProfile(username: string) {
    const profile = await this.prisma.userProfile.findUnique({ where: { username: username.toLowerCase() } });
    if (!profile) throw new AppError(404, 'NOT_FOUND', 'Profile not found');
    return profile;
  }

  private card(profile: { userId: string; displayName: string; username: string; avatarUrl: string | null } | null) {
    if (!profile) return null;
    return { id: profile.userId, displayName: profile.displayName, username: profile.username, avatarUrl: profile.avatarUrl };
  }

  private publicSettings(user: AuthUser) {
    if (!user.settings) return null;
    return user.settings;
  }
}
