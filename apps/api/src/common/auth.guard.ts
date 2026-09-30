import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AccountStatus, Prisma, Role } from '@prisma/client';
import { AppError } from './app-error';
import { IS_PUBLIC, ROLES_KEY } from './decorators';
import { PrismaService } from '../prisma/prisma.service';

export const authUserInclude = { profile: true, settings: true, verification: true } satisfies Prisma.UserInclude;
export type AuthUser = Prisma.UserGetPayload<{ include: typeof authUserInclude }>;

interface AccessPayload {
  sub: string;
  tv: number;
  role: Role;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest();
    const header = request.headers?.authorization as string | undefined;
    if (!header?.startsWith('Bearer ')) {
      if (isPublic) return true;
      throw new AppError(401, 'UNAUTHENTICATED', 'Sign in required');
    }
    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(header.slice(7));
    } catch {
      if (isPublic) return true;
      throw new AppError(401, 'UNAUTHENTICATED', 'Sign in required');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: authUserInclude });
    if (!user || user.tokenVersion !== payload.tv || user.deletedAt) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Sign in required');
    }
    if (user.accountStatus === AccountStatus.SUSPENDED || user.accountStatus === AccountStatus.BANNED) {
      throw new AppError(403, 'ACCOUNT_BLOCKED', 'This account cannot be used right now');
    }
    request.user = user;
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles?.length && !roles.includes(user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this action');
    }
    return true;
  }
}

export function assertCanWrite(user: AuthUser): void {
  if (user.accountStatus === AccountStatus.RESTRICTED || user.accountStatus === AccountStatus.PENDING_DELETION) {
    throw new AppError(403, 'ACCOUNT_RESTRICTED', 'This account cannot create content right now');
  }
}
