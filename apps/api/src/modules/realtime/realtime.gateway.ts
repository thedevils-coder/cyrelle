import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

@WebSocketGateway({ namespace: '/realtime', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = (client.handshake.auth?.token as string | undefined) || String(client.handshake.headers.authorization || '').replace('Bearer ', '');
      const payload = await this.jwt.verifyAsync<{ sub: string; tv: number }>(token, { secret: this.config.get('JWT_ACCESS_SECRET') });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.tokenVersion !== payload.tv) {
        client.disconnect();
        return;
      }
      client.data.userId = user.id;
      client.join(`user:${user.id}`);
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('conversation:join')
  async joinConversation(client: Socket, conversationId: string): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    const member = await this.prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
    if (member) client.join(`conversation:${conversationId}`);
  }

  @SubscribeMessage('live:join')
  async joinLive(client: Socket, liveId: string): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    const blocked = await this.prisma.liveViewer.findUnique({ where: { liveId_userId: { liveId, userId } } });
    if (blocked?.blocked) return;
    client.join(`live:${liveId}`);
  }

  emitToConversation(conversationId: string, event: string, payload: unknown): void {
    this.server?.to(`conversation:${conversationId}`).emit(event, payload);
  }

  emitToLive(liveId: string, event: string, payload: unknown): void {
    this.server?.to(`live:${liveId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
