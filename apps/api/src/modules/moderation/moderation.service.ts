import { Injectable } from '@nestjs/common';
import { ReportTarget } from '@prisma/client';
import { assertCanWrite, AuthUser } from '../../common/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async report(user: AuthUser, input: { targetType: ReportTarget; targetId: string; reason: string; details?: string }) {
    assertCanWrite(user);
    const report = await this.prisma.report.create({ data: { reporterId: user.id, ...input } });
    const open = await this.prisma.report.count({ where: { targetType: input.targetType, targetId: input.targetId, status: { in: ['OPEN', 'IN_REVIEW'] } } });
    const threshold = await this.prisma.platformSetting.findUnique({ where: { key: 'report_autohide_threshold' } });
    const limit = (threshold?.value as { count?: number } | null)?.count ?? 5;
    if (open >= limit) await this.hideTarget(input.targetType, input.targetId, 'Auto-hidden after reports');
    return { id: report.id, status: report.status };
  }

  async block(user: AuthUser, username: string) {
    const profile = await this.prisma.userProfile.findUnique({ where: { username: username.toLowerCase() } });
    if (!profile) return { blocked: false };
    await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: profile.userId } },
      update: {},
      create: { blockerId: user.id, blockedId: profile.userId },
    });
    await this.prisma.follow.deleteMany({ where: { OR: [{ followerId: user.id, followeeId: profile.userId }, { followerId: profile.userId, followeeId: user.id }] } });
    return { blocked: true };
  }

  async mute(user: AuthUser, targetType: string, targetId: string) {
    await this.prisma.contentHide.upsert({
      where: { userId_targetType_targetId: { userId: user.id, targetType, targetId } },
      update: { reason: 'MUTE' },
      create: { userId: user.id, targetType, targetId, reason: 'MUTE' },
    });
    return { muted: true };
  }

  async hide(user: AuthUser, targetType: string, targetId: string, reason?: string) {
    await this.prisma.contentHide.upsert({
      where: { userId_targetType_targetId: { userId: user.id, targetType, targetId } },
      update: { reason: reason ?? 'NOT_INTERESTED' },
      create: { userId: user.id, targetType, targetId, reason: reason ?? 'NOT_INTERESTED' },
    });
    return { hidden: true };
  }

  private async hideTarget(targetType: ReportTarget, targetId: string, note: string) {
    if (targetType === 'POST') await this.prisma.post.updateMany({ where: { id: targetId }, data: { status: 'HIDDEN' } });
    if (targetType === 'REEL') await this.prisma.reel.updateMany({ where: { id: targetId }, data: { status: 'HIDDEN' } });
    if (targetType === 'STORY') await this.prisma.story.updateMany({ where: { id: targetId }, data: { status: 'HIDDEN' } });
    if (targetType === 'COMMENT') await this.prisma.comment.updateMany({ where: { id: targetId }, data: { status: 'HIDDEN' } });
    await this.prisma.moderationAction.create({ data: { targetType, targetId, action: 'HIDE', note } });
  }
}
