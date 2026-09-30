import { Injectable } from '@nestjs/common';
import { ContentStatus, MediaKind, StoryKind, Visibility } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { assertCanWrite, AuthUser } from '../../common/auth.guard';
import { clampLimit, decodeCursor, encodeCursor } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async createPost(user: AuthUser, input: {
    body?: string;
    visibility?: Visibility;
    hashtags?: string[];
    mentions?: string[];
    location?: string;
    poll?: { question: string; options: string[] };
    businessId?: string;
    media?: Array<{ url: string; kind: MediaKind; altText?: string; width?: number; height?: number }>;
  }) {
    assertCanWrite(user);
    if (input.businessId) await this.assertBusinessMember(user.id, input.businessId);
    const hashtags = normalizeTags(input.hashtags);
    const post = await this.prisma.post.create({
      data: {
        authorId: user.id,
        businessId: input.businessId,
        body: input.body?.trim(),
        visibility: input.visibility ?? 'PUBLIC',
        hashtags,
        mentions: normalizeMentions(input.mentions),
        location: input.location,
        poll: input.poll ? { question: input.poll.question, options: input.poll.options.map((text) => ({ text, votes: 0 })) } : undefined,
        media: { create: (input.media ?? []).map((item, index) => ({ ...item, sortOrder: index })) },
      },
      include: { media: true },
    });
    await this.bumpTags(hashtags);
    await this.notifyMentions(user, post.mentions, 'post', post.id);
    await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'post_created', props: { postId: post.id } } });
    return this.presentPost(post, user.id);
  }

  async feed(user: AuthUser, query: { cursor?: string; limit?: string }) {
    const limit = clampLimit(query.limit);
    const cursor = decodeCursor(query.cursor);
    const following = await this.prisma.follow.findMany({ where: { followerId: user.id, status: 'ACCEPTED' }, select: { followeeId: true } });
    const hidden = await this.prisma.contentHide.findMany({ where: { userId: user.id, targetType: 'POST' }, select: { targetId: true } });
    const blocked = await this.blockedIds(user.id);
    const audience = [{ authorId: user.id }, { authorId: { in: following.map((item) => item.followeeId) }, visibility: { in: ['PUBLIC', 'FOLLOWERS'] as Visibility[] } }, { visibility: 'PUBLIC' as const }];
    const posts = await this.prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        id: hidden.length ? { notIn: hidden.map((item) => item.targetId) } : undefined,
        authorId: blocked.length ? { notIn: blocked } : undefined,
        AND: [
          { OR: audience },
          ...(cursor ? [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] : []),
        ],
      },
      include: { media: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = posts.slice(0, limit);
    const presented = await Promise.all(page.map((post) => this.presentPost(post, user.id)));
    const ads = await this.prisma.advertisement.findMany({
      where: { placement: 'FEED', status: 'ACTIVE', campaign: { status: 'ACTIVE' } },
      include: { campaign: true },
      take: 2,
    });
    return {
      items: presented,
      ads: ads.map((ad) => ({ id: ad.id, label: ad.label, title: ad.title, body: ad.body, mediaUrl: ad.mediaUrl, destination: ad.destination, sponsored: true })),
      nextCursor: posts.length > limit ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id) : null,
    };
  }

  async getPost(id: string, viewerId?: string) {
    const post = await this.prisma.post.findFirst({ where: { id, status: 'PUBLISHED' }, include: { media: true } });
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    return this.presentPost(post, viewerId);
  }

  async updatePost(user: AuthUser, id: string, body: string) {
    const post = await this.ownedPost(user, id);
    return this.prisma.post.update({ where: { id: post.id }, data: { body, editedAt: new Date() } });
  }

  async deletePost(user: AuthUser, id: string) {
    const post = await this.ownedPost(user, id);
    await this.prisma.post.update({ where: { id: post.id }, data: { status: 'REMOVED' } });
    return { deleted: true };
  }

  async like(user: AuthUser, postId: string) {
    assertCanWrite(user);
    await this.getPost(postId, user.id);
    await this.prisma.like.upsert({
      where: { userId_postId: { userId: user.id, postId } },
      update: {},
      create: { userId: user.id, postId },
    });
    return { liked: true };
  }

  async unlike(user: AuthUser, postId: string) {
    await this.prisma.like.deleteMany({ where: { userId: user.id, postId } });
    return { liked: false };
  }

  async save(user: AuthUser, postId: string) {
    await this.getPost(postId, user.id);
    await this.prisma.save.upsert({
      where: { userId_postId: { userId: user.id, postId } },
      update: {},
      create: { userId: user.id, postId },
    });
    return { saved: true };
  }

  async unsave(user: AuthUser, postId: string) {
    await this.prisma.save.deleteMany({ where: { userId: user.id, postId } });
    return { saved: false };
  }

  async saved(user: AuthUser) {
    const rows = await this.prisma.save.findMany({
      where: { userId: user.id, postId: { not: null } },
      include: { post: { include: { media: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return Promise.all(rows.filter((row) => row.post).map((row) => this.presentPost(row.post!, user.id)));
  }

  async comment(user: AuthUser, postId: string, body: string) {
    assertCanWrite(user);
    const post = await this.prisma.post.findFirst({ where: { id: postId, status: 'PUBLISHED' } });
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    const comment = await this.prisma.comment.create({ data: { postId, authorId: user.id, body: body.trim() } });
    if (post.authorId !== user.id) {
      await this.prisma.notification.create({
        data: { userId: post.authorId, kind: 'COMMENT', title: 'New comment', body: body.slice(0, 140), data: { postId } },
      });
    }
    const author = await this.authorCard(user.id);
    return { ...comment, author };
  }

  async comments(postId: string) {
    const rows = await this.prisma.comment.findMany({ where: { postId, status: 'PUBLISHED' }, orderBy: { createdAt: 'asc' }, take: 100 });
    return Promise.all(rows.map(async (row) => ({ ...row, author: await this.authorCard(row.authorId) })));
  }

  async share(user: AuthUser, postId: string) {
    await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'share', props: { postId } } });
    return { shared: true };
  }

  async vote(user: AuthUser, postId: string, option: number) {
    const post = await this.prisma.post.findFirst({ where: { id: postId, status: 'PUBLISHED' } });
    if (!post?.poll) throw new AppError(400, 'POLL_MISSING', 'This post has no poll');
    const prior = await this.prisma.analyticsEvent.findFirst({ where: { userId: user.id, name: 'poll_vote', props: { path: ['postId'], equals: postId } } });
    if (prior) throw new AppError(409, 'ALREADY_VOTED', 'You already voted');
    const poll = post.poll as { question: string; options: Array<{ text: string; votes: number }> };
    if (!poll.options[option]) throw new AppError(400, 'POLL_OPTION', 'Choose a valid option');
    poll.options[option].votes += 1;
    await this.prisma.post.update({ where: { id: postId }, data: { poll } });
    await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'poll_vote', props: { postId, option } } });
    return poll;
  }

  async createStory(user: AuthUser, input: { kind: StoryKind; text?: string; mediaUrl?: string; visibility?: Visibility; stickers?: unknown; mentions?: string[]; poll?: unknown; question?: string; musicTrack?: string; linkUrl?: string; businessId?: string }) {
    assertCanWrite(user);
    if (input.businessId) await this.assertBusinessMember(user.id, input.businessId);
    const hours = Number((await this.setting('story_ttl_hours')) ?? 24);
    const story = await this.prisma.story.create({
      data: {
        authorId: user.id,
        businessId: input.businessId,
        kind: input.kind,
        text: input.text,
        mediaUrl: input.mediaUrl,
        visibility: input.visibility ?? 'PUBLIC',
        stickers: input.stickers as object | undefined,
        mentions: normalizeMentions(input.mentions),
        poll: input.poll as object | undefined,
        question: input.question,
        musicTrack: input.musicTrack,
        linkUrl: input.linkUrl,
        expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
      },
    });
    await this.notifyMentions(user, story.mentions, 'story', story.id);
    return story;
  }

  async stories(user: AuthUser) {
    const following = await this.prisma.follow.findMany({ where: { followerId: user.id, status: 'ACCEPTED' }, select: { followeeId: true } });
    const rows = await this.prisma.story.findMany({
      where: {
        status: 'PUBLISHED',
        expiresAt: { gt: new Date() },
        OR: [{ authorId: user.id }, { authorId: { in: following.map((item) => item.followeeId) } }, { visibility: 'PUBLIC' }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return Promise.all(rows.map(async (story) => ({ ...story, author: await this.authorCard(story.authorId) })));
  }

  async viewStory(user: AuthUser, id: string) {
    await this.prisma.storyView.upsert({ where: { storyId_userId: { storyId: id, userId: user.id } }, update: {}, create: { storyId: id, userId: user.id } });
    return { viewed: true };
  }

  async reactStory(user: AuthUser, id: string, emoji: string) {
    await this.prisma.storyReaction.upsert({
      where: { storyId_userId: { storyId: id, userId: user.id } },
      update: { emoji },
      create: { storyId: id, userId: user.id, emoji },
    });
    const story = await this.prisma.story.findUnique({ where: { id } });
    if (story && story.authorId !== user.id) {
      await this.prisma.notification.create({ data: { userId: story.authorId, kind: 'STORY', title: 'Story reaction', body: emoji, data: { storyId: id } } });
    }
    return { reacted: true };
  }

  async createReel(user: AuthUser, input: { caption?: string; videoUrl: string; coverUrl?: string; durationMs?: number; hashtags?: string[]; mentions?: string[]; edit?: unknown; audioTrack?: string; businessId?: string }) {
    assertCanWrite(user);
    if (input.businessId) await this.assertBusinessMember(user.id, input.businessId);
    const hashtags = normalizeTags(input.hashtags);
    const reel = await this.prisma.reel.create({
      data: {
        authorId: user.id,
        businessId: input.businessId,
        caption: input.caption,
        videoUrl: input.videoUrl,
        coverUrl: input.coverUrl,
        durationMs: input.durationMs,
        hashtags,
        mentions: normalizeMentions(input.mentions),
        edit: input.edit as object | undefined,
        audioTrack: input.audioTrack,
      },
    });
    await this.bumpTags(hashtags);
    await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'reel_created', props: { reelId: reel.id } } });
    return { ...reel, author: await this.authorCard(user.id) };
  }

  async reels(query: { cursor?: string; limit?: string }, viewerId?: string) {
    const limit = clampLimit(query.limit);
    const rows = await this.prisma.reel.findMany({ where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: limit });
    return Promise.all(rows.map(async (reel) => ({ ...reel, author: await this.authorCard(reel.authorId), liked: viewerId ? !!(await this.prisma.like.findFirst({ where: { userId: viewerId, reelId: reel.id } })) : false })));
  }

  async likeReel(user: AuthUser, reelId: string) {
    assertCanWrite(user);
    await this.prisma.like.upsert({ where: { userId_reelId: { userId: user.id, reelId } }, update: {}, create: { userId: user.id, reelId } });
    return { liked: true };
  }

  async explore(user: AuthUser) {
    const profile = user.profile;
    const businesses = await this.prisma.businessProfile.findMany({
      where: { status: 'ACTIVE', ...(profile?.countryCode ? { countryCode: profile.countryCode } : {}) },
      take: 12,
      orderBy: { createdAt: 'desc' },
    });
    const reels = await this.reels({ limit: '8' }, user.id);
    const lives = await this.prisma.liveStream.findMany({ where: { status: 'LIVE' }, take: 6, orderBy: { viewerCount: 'desc' } });
    const tags = await this.prisma.hashtag.findMany({ orderBy: { uses: 'desc' }, take: 12 });
    const ads = await this.prisma.advertisement.findMany({ where: { placement: 'EXPLORE', status: 'ACTIVE' }, take: 2 });
    return {
      businesses: await Promise.all(businesses.map(async (business) => ({ ...business, ...(await this.entitlements.business(business.id)) }))),
      reels,
      lives,
      hashtags: tags,
      ads: ads.map((ad) => ({ ...ad, sponsored: true })),
    };
  }

  async search(user: AuthUser, q: string, type?: string) {
    const query = q.trim();
    if (query.length < 1) return { users: [], businesses: [], posts: [], reels: [], services: [], hashtags: [], lives: [] };
    const users = type && type !== 'users' ? [] : await this.prisma.userProfile.findMany({
      where: { OR: [{ username: { contains: query, mode: 'insensitive' } }, { displayName: { contains: query, mode: 'insensitive' } }] },
      take: 10,
    });
    const businesses = type && type !== 'businesses' ? [] : await this.prisma.businessProfile.findMany({
      where: { status: 'ACTIVE', OR: [{ username: { contains: query, mode: 'insensitive' } }, { name: { contains: query, mode: 'insensitive' } }, { category: { contains: query, mode: 'insensitive' } }] },
      take: 10,
    });
    const posts = type && type !== 'content' ? [] : await this.prisma.post.findMany({
      where: { status: 'PUBLISHED', visibility: 'PUBLIC', OR: [{ body: { contains: query, mode: 'insensitive' } }, { hashtags: { has: query.replace('#', '').toLowerCase() } }] },
      take: 10,
    });
    const services = type && type !== 'services' ? [] : await this.prisma.service.findMany({
      where: { active: true, OR: [{ name: { contains: query, mode: 'insensitive' } }, { category: { contains: query, mode: 'insensitive' } }] },
      include: { business: true },
      take: 10,
    });
    const hashtags = await this.prisma.hashtag.findMany({ where: { tag: { contains: query.replace('#', '').toLowerCase() } }, take: 10 });
    const lives = await this.prisma.liveStream.findMany({ where: { status: 'LIVE', title: { contains: query, mode: 'insensitive' } }, take: 5 });
    const cards = await Promise.all(users.map(async (profile) => ({ ...this.profileCard(profile), blueTick: (await this.entitlements.personal(profile.userId)).blueTickVisible })));
    return { users: cards, businesses, posts, services, hashtags, lives };
  }

  private async presentPost(post: { id: string; authorId: string; body: string | null; createdAt: Date; hashtags: string[]; location: string | null; visibility: Visibility; status: ContentStatus; poll: unknown; media?: unknown; businessId?: string | null }, viewerId?: string) {
    const [author, likes, comments, saved] = await Promise.all([
      this.authorCard(post.authorId),
      this.prisma.like.count({ where: { postId: post.id } }),
      this.prisma.comment.count({ where: { postId: post.id, status: 'PUBLISHED' } }),
      viewerId ? this.prisma.save.findFirst({ where: { userId: viewerId, postId: post.id } }) : null,
    ]);
    const liked = viewerId ? !!(await this.prisma.like.findFirst({ where: { userId: viewerId, postId: post.id } })) : false;
    return { ...post, author, likes, comments, liked, saved: Boolean(saved) };
  }

  private async authorCard(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const personal = await this.entitlements.personal(userId);
    return {
      id: userId,
      username: profile?.username,
      displayName: profile?.displayName,
      avatarUrl: profile?.avatarUrl,
      blueTick: personal.blueTickVisible,
    };
  }

  private profileCard(profile: { userId: string; username: string; displayName: string; avatarUrl: string | null }) {
    return { id: profile.userId, username: profile.username, displayName: profile.displayName, avatarUrl: profile.avatarUrl };
  }

  private async ownedPost(user: AuthUser, id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post || (post.authorId !== user.id && user.role === 'USER')) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    return post;
  }

  private async assertBusinessMember(userId: string, businessId: string) {
    const member = await this.prisma.businessMember.findUnique({ where: { businessId_userId: { businessId, userId } } });
    if (!member) throw new AppError(403, 'FORBIDDEN', 'You do not manage this business');
  }

  private async blockedIds(userId: string) {
    const rows = await this.prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
    return rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId));
  }

  private async bumpTags(tags: string[]) {
    for (const tag of tags) {
      await this.prisma.hashtag.upsert({ where: { tag }, update: { uses: { increment: 1 } }, create: { tag, uses: 1 } });
    }
  }

  private async notifyMentions(user: AuthUser, mentions: string[], targetType: string, targetId: string) {
    for (const username of mentions) {
      const profile = await this.prisma.userProfile.findUnique({ where: { username } });
      if (!profile || profile.userId === user.id) continue;
      await this.prisma.notification.create({
        data: { userId: profile.userId, kind: 'MENTION', title: 'You were mentioned', body: `${user.profile?.username ?? 'Someone'} mentioned you`, data: { targetType, targetId } },
      });
    }
  }

  private async setting(key: string) {
    const row = await this.prisma.platformSetting.findUnique({ where: { key } });
    return (row?.value as { hours?: number } | null)?.hours;
  }
}

function normalizeTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.replace(/^#/, '').trim().toLowerCase()).filter((tag) => /^[a-z0-9_]{1,40}$/.test(tag)))];
}

function normalizeMentions(mentions?: string[]): string[] {
  return [...new Set((mentions ?? []).map((item) => item.replace(/^@/, '').trim().toLowerCase()).filter(Boolean))];
}
