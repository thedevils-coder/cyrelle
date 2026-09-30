import { generateAppointmentSlots } from './slots';

describe('appointment slots', () => {
  it('builds timezone-aware slots and skips busy ranges', () => {
    const slots = generateAppointmentSlots({
      date: '2026-06-01',
      businessZone: 'America/New_York',
      viewerZone: 'Asia/Kolkata',
      durationMinutes: 60,
      rules: [{ weekday: 1, startMinute: 10 * 60, endMinute: 12 * 60 }],
      busy: [{ startsAt: new Date('2026-06-01T14:00:00.000Z'), endsAt: new Date('2026-06-01T15:00:00.000Z') }],
      now: new Date('2026-05-01T00:00:00.000Z'),
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].startsAt).toBe('2026-06-01T15:00:00.000Z');
    expect(slots[0].businessLabel).toBe('11:00');
    expect(slots[0].viewerLabel).toBe('20:30');
  });

  it('does not offer slots in the past', () => {
    const slots = generateAppointmentSlots({
      date: '2026-06-01',
      businessZone: 'UTC',
      viewerZone: 'UTC',
      durationMinutes: 30,
      rules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60 }],
      busy: [],
      now: new Date('2026-06-01T09:15:00.000Z'),
    });
    expect(slots.map((slot) => slot.businessLabel)).toEqual(['09:30']);
  });
});
