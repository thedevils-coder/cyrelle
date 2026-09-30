import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/app-error';
import { assertCanWrite, AuthUser } from '../../common/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class LiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async start(user: AuthUser, input: { title: string; businessId?: string }) {
    assertCanWrite(user);
    const features = await this.entitlements.features(user.id);
    const advanced = features.find((feature) => feature.key === 'AdvancedLiveTools');
    const live = await this.prisma.liveStream.create({
      data: {
        hostId: user.id,
        businessId: input.businessId,
        title: input.title,
        status: 'LIVE',
        ingest: { mode: process.env.LIVEKIT_URL ? 'livekit' : 'presence', room: `cyrelle_${user.id.slice(-6)}` },
      },
    });
    await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'live_started', props: { liveId: live.id } } });
    return { ...live, advancedTools: advanced?.state ?? 'disabled', mediaServer: process.env.LIVEKIT_URL ? 'configured' : 'presence-only' };
  }

  async end(user: AuthUser, id: string) {
    const live = await this.prisma.liveStream.findUnique({ where: { id } });
    if (!live || live.hostId !== user.id) throw new AppError(404, 'NOT_FOUND', 'Live not found');
    return this.prisma.liveStream.update({ where: { id }, data: { status: 'ENDED', endedAt: new Date() } });
  }

  list() {
    return this.prisma.liveStream.findMany({ where: { status: 'LIVE' }, orderBy: { viewerCount: 'desc' }, take: 30 });
  }

  async join(user: AuthUser, id: string) {
    const blocked = await this.prisma.liveViewer.findUnique({ where: { liveId_userId: { liveId: id, userId: user.id } } });
    if (blocked?.blocked) throw new AppError(403, 'BLOCKED', 'You cannot join this live');
    await this.prisma.liveViewer.upsert({ where: { liveId_userId: { liveId: id, userId: user.id } }, update: { leftAt: null }, create: { liveId: id, userId: user.id } });
    const count = await this.prisma.liveViewer.count({ where: { liveId: id, blocked: false, leftAt: null } });
    const live = await this.prisma.liveStream.update({ where: { id }, data: { viewerCount: count } });
    this.realtime.emitToLive(id, 'live:viewers', { viewerCount: live.viewerCount });
    return live;
  }

  async comment(user: AuthUser, id: string, body: string) {
    assertCanWrite(user);
    const live = await this.prisma.liveStream.findUnique({ where: { id } });
    if (!live || live.status !== 'LIVE') throw new AppError(404, 'NOT_FOUND', 'Live not found');
    const comment = await this.prisma.liveComment.create({ data: { liveId: id, userId: user.id, body } });
    this.realtime.emitToLive(id, 'live:comment', comment);
    return comment;
  }

  async react(user: AuthUser, id: string, emoji: string) {
    this.realtime.emitToLive(id, 'live:reaction', { userId: user.id, emoji });
    return { emoji };
  }

  async moderate(user: AuthUser, id: string, input: { blockUserId?: string; pinCommentId?: string; slowMode?: boolean }) {
    const live = await this.prisma.liveStream.findUnique({ where: { id } });
    if (!live || live.hostId !== user.id) throw new AppError(403, 'FORBIDDEN', 'Only the host can moderate');
    const features = await this.entitlements.features(user.id);
    const advanced = features.find((feature) => feature.key === 'AdvancedLiveTools');
    if ((input.pinCommentId || input.slowMode != null) && advanced?.state !== 'enabled') {
      throw new AppError(403, 'COMING_SOON', 'Advanced live tools are not enabled for your plan yet');
    }
    if (input.blockUserId) {
      await this.prisma.liveViewer.upsert({
        where: { liveId_userId: { liveId: id, userId: input.blockUserId } },
        update: { blocked: true },
        create: { liveId: id, userId: input.blockUserId, blocked: true },
      });
    }
    if (input.pinCommentId) await this.prisma.liveComment.update({ where: { id: input.pinCommentId }, data: { pinned: true } });
    if (input.slowMode != null) await this.prisma.liveStream.update({ where: { id }, data: { slowMode: input.slowMode } });
    return { moderated: true };
  }
}
