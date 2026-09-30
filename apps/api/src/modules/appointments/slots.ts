import { DateTime } from 'luxon';

export interface SlotRule {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface BusyRange {
  startsAt: Date;
  endsAt: Date;
}

export interface AppointmentSlot {
  startsAt: string;
  endsAt: string;
  businessLabel: string;
  viewerLabel: string;
  businessZone: string;
  viewerZone: string;
}

export function generateAppointmentSlots(input: {
  date: string;
  businessZone: string;
  viewerZone: string;
  durationMinutes: number;
  rules: SlotRule[];
  busy: BusyRange[];
  now?: Date;
}): AppointmentSlot[] {
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0 || input.durationMinutes > 24 * 60) {
    return [];
  }
  const businessZone = input.businessZone || 'UTC';
  const viewerZone = input.viewerZone || businessZone;
  const day = DateTime.fromISO(input.date, { zone: businessZone });
  if (!day.isValid) return [];
  const weekday = day.weekday % 7;
  const now = DateTime.fromJSDate(input.now ?? new Date()).toUTC();
  const slots: AppointmentSlot[] = [];

  for (const rule of input.rules.filter((item) => item.weekday === weekday)) {
    let cursor = day.startOf('day').plus({ minutes: rule.startMinute });
    const windowEnd = day.startOf('day').plus({ minutes: rule.endMinute });
    while (cursor.plus({ minutes: input.durationMinutes }) <= windowEnd) {
      const slotEnd = cursor.plus({ minutes: input.durationMinutes });
      const startsAt = cursor.toUTC().toJSDate();
      const endsAt = slotEnd.toUTC().toJSDate();
      const overlaps = input.busy.some((item) => startsAt < item.endsAt && endsAt > item.startsAt);
      if (!overlaps && cursor.toUTC() > now) {
        slots.push({
          startsAt: cursor.toUTC().toISO()!,
          endsAt: slotEnd.toUTC().toISO()!,
          businessLabel: cursor.setZone(businessZone).toFormat('HH:mm'),
          viewerLabel: cursor.setZone(viewerZone).toFormat('HH:mm'),
          businessZone,
          viewerZone,
        });
      }
      cursor = slotEnd;
    }
  }
  return slots;
}
