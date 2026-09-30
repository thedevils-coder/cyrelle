import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';

class DeviceDto {
  @IsString() token!: string;
  @IsString() platform!: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  @Post(':id/read')
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
    return { read: true };
  }

  @Post('devices')
  register(@CurrentUser() user: AuthUser, @Body() body: DeviceDto) {
    return this.prisma.pushDevice.upsert({
      where: { userId_token: { userId: user.id, token: body.token } },
      update: { platform: body.platform },
      create: { userId: user.id, token: body.token, platform: body.platform },
    });
  }
}
