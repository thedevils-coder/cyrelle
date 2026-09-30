import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/auth.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './modules/admin/admin.module';
import { AdvertisingModule } from './modules/advertising/advertising.module';
import { AiModule } from './modules/ai/ai.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { AuthModule } from './modules/auth/auth.module';
import { BusinessModule } from './modules/business/business.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { LiveModule } from './modules/live/live.module';
import { MailModule } from './modules/mail/mail.module';
import { MediaModule } from './modules/media/media.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PremiumModule } from './modules/premium/premium.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SafetyModule } from './modules/safety/safety.module';
import { SocialModule } from './modules/social/social.module';
import { UsersModule } from './modules/users/users.module';
import { VerificationModule } from './modules/verification/verification.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    PrismaModule,
    MailModule,
    JobsModule,
    EntitlementsModule,
    PaymentsModule,
    AuthModule,
    RealtimeModule,
    UsersModule,
    VerificationModule,
    SocialModule,
    MessagingModule,
    LiveModule,
    BusinessModule,
    AppointmentsModule,
    PremiumModule,
    AdvertisingModule,
    SafetyModule,
    ModerationModule,
    NotificationsModule,
    MediaModule,
    PlatformModule,
    AiModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
