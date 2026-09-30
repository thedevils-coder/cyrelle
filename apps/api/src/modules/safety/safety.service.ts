import { Injectable } from '@nestjs/common';
import { SAFETY_LIMITATIONS, assertSosSourceAllowed, evaluateShakeSos } from '@cyrelle/shared';
import { SosSource } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { AuthUser } from '../../common/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class SafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async config(user: AuthUser) {
    const countryCode = user.profile?.countryCode;
    const country = countryCode ? await this.prisma.country.findUnique({ where: { code: countryCode } }) : null;
    return {
      countryCode: country?.code ?? null,
      emergencyNumbers: (country?.emergency as unknown[]) ?? [],
      smsSupported: country?.smsSupported ?? false,
      settings: {
        shakeSosEnabled: user.settings?.shakeSosEnabled ?? false,
        autoSosEnabled: user.settings?.autoSosEnabled ?? false,
        countdownMs: user.settings?.sosCountdownMs ?? 5000,
        shareLocationOnSos: user.settings?.shareLocationOnSos ?? true,
      },
      limitations: SAFETY_LIMITATIONS,
    };
  }

  async contacts(user: AuthUser) {
    return this.prisma.emergencyContact.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  }

  async addContact(user: AuthUser, input: { name: string; relationship: string; email?: string; phone?: string }) {
    if (!input.email && !input.phone) throw new AppError(400, 'CONTACT_CHANNEL_REQUIRED', 'Add an email or phone for this emergency contact');
    return this.prisma.emergencyContact.create({ data: { userId: user.id, ...input } });
  }

  async removeContact(user: AuthUser, id: string) {
    await this.prisma.emergencyContact.deleteMany({ where: { id, userId: user.id } });
    return { deleted: true };
  }

  async begin(user: AuthUser, source: SosSource, location?: { latitude: number; longitude: number; accuracyM?: number }) {
    const settings = {
      shakeSosEnabled: user.settings?.shakeSosEnabled ?? false,
      autoSosEnabled: user.settings?.autoSosEnabled ?? false,
      countdownMs: user.settings?.sosCountdownMs ?? 5000,
    };
    try {
      assertSosSourceAllowed(settings, source);
    } catch (error) {
      throw new AppError(403, (error as { code?: string }).code || 'SOS_DISABLED', error instanceof Error ? error.message : 'SOS is disabled');
    }
    const event = await this.prisma.emergencyEvent.create({
      data: {
        userId: user.id,
        source,
        status: 'COUNTDOWN',
        latitude: user.settings?.shareLocationOnSos ? location?.latitude : null,
        longitude: user.settings?.shareLocationOnSos ? location?.longitude : null,
        accuracyM: location?.accuracyM,
        actions: { phase: 'countdown', countdownMs: settings.countdownMs },
      },
    });
    return { event, countdownMs: settings.countdownMs, cancelable: true };
  }

  async cancel(user: AuthUser, id: string) {
    const event = await this.mustOwn(user.id, id);
    const phase = evaluateShakeSos({
      enabled: true,
      cancelled: true,
      startedAtMs: event.startedAt.getTime(),
      nowMs: Date.now(),
      countdownMs: user.settings?.sosCountdownMs ?? 5000,
    });
    const updated = await this.prisma.emergencyEvent.update({ where: { id }, data: { status: 'CANCELLED', actions: { phase } } });
    return updated;
  }

  async activate(user: AuthUser, id: string) {
    const event = await this.mustOwn(user.id, id);
    if (event.status !== 'COUNTDOWN') throw new AppError(409, 'SOS_NOT_COUNTING', 'This SOS is no longer in countdown');
    const countdownMs = user.settings?.sosCountdownMs ?? 5000;
    const phase = evaluateShakeSos({ enabled: true, cancelled: false, startedAtMs: event.startedAt.getTime(), nowMs: Date.now(), countdownMs });
    if (phase !== 'activate') throw new AppError(409, 'SOS_COUNTDOWN', 'The countdown is still running. You can cancel it.');
    const country = user.profile?.countryCode ? await this.prisma.country.findUnique({ where: { code: user.profile.countryCode } }) : null;
    const contacts = await this.prisma.emergencyContact.findMany({ where: { userId: user.id } });
    const numbers = (country?.emergency as Array<{ number: string; label: string }> | null) ?? [];
    for (const contact of contacts) {
      if (contact.email) {
        await this.mail.send(contact.email, 'emergency', `${user.profile?.displayName ?? 'A Cyrelle member'} needs help`, `An emergency event was activated. Location: ${event.latitude ?? 'not shared'}, ${event.longitude ?? 'not shared'}.`);
      }
    }
    await this.prisma.notification.create({ data: { userId: user.id, kind: 'SAFETY', title: 'SOS activated', body: 'Your emergency contacts were notified where a channel was available.', data: { eventId: id } } });
    await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'emergency_activated', props: { source: event.source } } });
    return this.prisma.emergencyEvent.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        actions: {
          contactsNotified: contacts.map((contact) => contact.id),
          smsDispatched: false,
          callPlacedByApp: false,
          officialNumbers: numbers,
          limitations: SAFETY_LIMITATIONS,
        },
      },
    });
  }

  async events(user: AuthUser) {
    return this.prisma.emergencyEvent.findMany({ where: { userId: user.id }, orderBy: { startedAt: 'desc' }, take: 50 });
  }

  async saveVoice(user: AuthUser, eventId: string | undefined, mediaUrl: string) {
    return this.prisma.emergencyVoice.create({ data: { userId: user.id, eventId, mediaUrl } });
  }

  private async mustOwn(userId: string, id: string) {
    const event = await this.prisma.emergencyEvent.findFirst({ where: { id, userId } });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Emergency event not found');
    return event;
  }
}
