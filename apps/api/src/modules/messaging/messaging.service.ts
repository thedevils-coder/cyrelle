import { Injectable } from '@nestjs/common';
import { ConversationKind, MessageKind } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { assertCanWrite, AuthUser } from '../../common/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(user: AuthUser) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId: user.id },
      include: { conversation: { include: { members: { include: { user: { include: { profile: true } } } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });
    return memberships.map((membership) => ({
      id: membership.conversation.id,
      kind: membership.conversation.kind,
      title: membership.conversation.title,
      members: membership.conversation.members.map((member) => ({ id: member.userId, username: member.user.profile?.username, displayName: member.user.profile?.displayName })),
      lastMessage: membership.conversation.messages[0] ?? null,
      lastReadAt: membership.lastReadAt,
    }));
  }

  async open(user: AuthUser, input: { kind: ConversationKind; memberIds: string[]; title?: string }) {
    assertCanWrite(user);
    const ids = [...new Set([user.id, ...input.memberIds])];
    if (input.kind === 'DIRECT' && ids.length !== 2) throw new AppError(400, 'DIRECT_MEMBERS', 'A direct chat needs two people');
    if (input.kind === 'DIRECT') {
      const existing = await this.prisma.conversation.findFirst({
        where: { kind: 'DIRECT', AND: ids.map((id) => ({ members: { some: { userId: id } } })), members: { every: { userId: { in: ids } } } },
      });
      if (existing) return existing;
    }
    for (const id of ids) {
      if (id === user.id) continue;
      const blocked = await this.prisma.block.findFirst({ where: { OR: [{ blockerId: user.id, blockedId: id }, { blockerId: id, blockedId: user.id }] } });
      if (blocked) throw new AppError(403, 'BLOCKED', 'Messaging is not available');
    }
    return this.prisma.conversation.create({
      data: { kind: input.kind, title: input.title, createdBy: user.id, members: { create: ids.map((id) => ({ userId: id })) } },
    });
  }

  async messages(user: AuthUser, conversationId: string) {
    await this.mustMember(user.id, conversationId);
    return this.prisma.message.findMany({
      where: { conversationId },
      include: { media: true, reactions: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  async send(user: AuthUser, conversationId: string, input: { body?: string; kind?: MessageKind; mediaUrl?: string; replyToId?: string; forwarded?: boolean }) {
    assertCanWrite(user);
    await this.mustMember(user.id, conversationId);
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: user.id,
        kind: input.kind ?? 'TEXT',
        body: input.body,
        replyToId: input.replyToId,
        forwarded: input.forwarded ?? false,
        media: input.mediaUrl ? { create: { kind: input.kind === 'VOICE' ? 'AUDIO' : input.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE', url: input.mediaUrl } } : undefined,
      },
      include: { media: true },
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    const members = await this.prisma.conversationMember.findMany({ where: { conversationId } });
    for (const member of members) {
      if (member.userId === user.id) continue;
      await this.prisma.notification.create({ data: { userId: member.userId, kind: 'MESSAGE', title: 'New message', body: input.body?.slice(0, 120) || 'Sent an attachment', data: { conversationId } } });
    }
    this.realtime.emitToConversation(conversationId, 'message:new', message);
    await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'message_sent', props: { conversationId } } });
    return message;
  }

  async read(user: AuthUser, conversationId: string) {
    await this.mustMember(user.id, conversationId);
    const lastReadAt = new Date();
    await this.prisma.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: user.id } }, data: { lastReadAt } });
    this.realtime.emitToConversation(conversationId, 'message:read', { conversationId, userId: user.id, lastReadAt });
    return { lastReadAt };
  }

  async react(user: AuthUser, messageId: string, emoji: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new AppError(404, 'NOT_FOUND', 'Message not found');
    await this.mustMember(user.id, message.conversationId);
    return this.prisma.messageReaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId: user.id, emoji } },
      update: {},
      create: { messageId, userId: user.id, emoji },
    });
  }

  async remove(user: AuthUser, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.senderId !== user.id) throw new AppError(404, 'NOT_FOUND', 'Message not found');
    return this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date(), body: null } });
  }

  async typing(user: AuthUser, conversationId: string) {
    await this.mustMember(user.id, conversationId);
    this.realtime.emitToConversation(conversationId, 'typing', { conversationId, userId: user.id });
    return { ok: true };
  }

  private async mustMember(userId: string, conversationId: string) {
    const member = await this.prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
    if (!member) throw new AppError(403, 'FORBIDDEN', 'You are not in this conversation');
    return member;
  }
}
