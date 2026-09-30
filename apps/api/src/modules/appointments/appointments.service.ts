import { Injectable } from '@nestjs/common';
import { calculateAppointmentCommission } from '@cyrelle/shared';
import { AppointmentStatus } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { assertCanWrite, AuthUser } from '../../common/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { PaymentsService } from '../payments/payments.service';
import { generateAppointmentSlots } from './slots';

const OPEN_APPOINTMENTS: AppointmentStatus[] = [AppointmentStatus.PENDING_PAYMENT, AppointmentStatus.CONFIRMED];

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly jobs: JobsService,
  ) {}

  async slots(serviceId: string, date: string, viewerZone?: string) {
    const service = await this.prisma.service.findUnique({ include: { business: { include: { hours: true } } }, where: { id: serviceId } });
    if (!service?.active) throw new AppError(404, 'NOT_FOUND', 'Service not found');
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 48 * 60 * 60 * 1000);
    const [appointments, blocks] = await Promise.all([
      this.prisma.appointment.findMany({ where: { businessId: service.businessId, status: { in: OPEN_APPOINTMENTS }, startsAt: { gte: dayStart, lt: dayEnd } } }),
      this.prisma.availabilityBlock.findMany({ where: { businessId: service.businessId, endsAt: { gt: dayStart }, startsAt: { lt: dayEnd } } }),
    ]);
    return {
      service: { id: service.id, name: service.name, priceMinor: service.priceMinor, currency: service.currency, durationMinutes: service.durationMinutes },
      timezone: service.business.timezone,
      slots: generateAppointmentSlots({
        date,
        businessZone: service.business.timezone,
        viewerZone: viewerZone || service.business.timezone,
        durationMinutes: service.durationMinutes,
        rules: service.business.hours,
        busy: [
          ...appointments.map((item) => ({ startsAt: item.startsAt, endsAt: item.endsAt })),
          ...blocks.map((item) => ({ startsAt: item.startsAt, endsAt: item.endsAt })),
        ],
      }),
    };
  }

  async book(user: AuthUser, input: { serviceId: string; startsAt: string; viewerZone?: string; notes?: string }) {
    assertCanWrite(user);
    const service = await this.prisma.service.findUnique({ include: { business: true }, where: { id: input.serviceId } });
    if (!service?.active) throw new AppError(404, 'NOT_FOUND', 'Service not found');
    const available = await this.slots(service.id, input.startsAt.slice(0, 10), input.viewerZone);
    const match = available.slots.find((slot) => slot.startsAt === new Date(input.startsAt).toISOString());
    if (!match) throw new AppError(409, 'SLOT_UNAVAILABLE', 'That time is no longer available');
    const appointment = await this.prisma.appointment.create({
      data: {
        customerId: user.id,
        businessId: service.businessId,
        serviceId: service.id,
        startsAt: new Date(match.startsAt),
        endsAt: new Date(match.endsAt),
        timezone: service.business.timezone,
        notes: input.notes,
        status: 'PENDING_PAYMENT',
      },
    });
    await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'appointment_booked', props: { appointmentId: appointment.id } } });
    return appointment;
  }

  /**
   * Payment amounts are loaded from the service. Client commission and amount fields are ignored.
   */
  async pay(user: AuthUser, appointmentId: string, idempotencyKey?: string, clientPayload?: Record<string, unknown>) {
    const remembered = await this.payments.remember(user.id, idempotencyKey, {});
    if (remembered) return remembered;
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId }, include: { service: true, payment: true, business: true } });
    if (!appointment || appointment.customerId !== user.id) throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
    if (appointment.payment?.paymentStatus === 'SUCCEEDED') return appointment.payment;
    if (clientPayload && ('commissionMinor' in clientPayload || 'amountMinor' in clientPayload || 'businessMinor' in clientPayload)) {
      await this.prisma.fraudSignal.create({
        data: {
          userId: user.id,
          type: 'CLIENT_PRICE_OVERRIDE',
          severity: 'MEDIUM',
          details: { appointmentId, ignored: true },
        },
      });
    }
    const country = await this.prisma.country.findUnique({ where: { code: appointment.business.countryCode } });
    const grossMinor = appointment.service.priceMinor;
    const recordedTax = country?.taxBps ? Math.round((grossMinor * country.taxBps) / 10000) : 0;
    const settlement = calculateAppointmentCommission({
      grossMinor,
      currency: appointment.service.currency,
      commissionBps: await this.payments.commissionBps(),
      feeMinor: 0,
      taxMinor: 0,
    });
    const amounts = { ...settlement, taxMinor: recordedTax };
    const charge = await this.payments.charge({
      amountMinor: settlement.grossMinor,
      currency: settlement.currency,
      customerEmail: user.email,
      description: `Cyrelle appointment ${appointment.service.name}`,
      metadata: { appointmentId, businessId: appointment.businessId },
      idempotencyKey: idempotencyKey || `apt_${appointmentId}`,
    });
    if (charge.status === 'FAILED') throw new AppError(402, 'PAYMENT_FAILED', 'Payment did not complete');
    const payment = await this.prisma.appointmentPayment.upsert({
      where: { appointmentId },
      update: {
        ...amounts,
        commissionStatus: 'PROJECTED',
        paymentStatus: charge.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'REQUIRES_ACTION',
        provider: charge.provider,
        providerRef: charge.providerRef,
        receiptNo: `CYR-${appointmentId.slice(-8).toUpperCase()}`,
      },
      create: {
        appointmentId,
        ...amounts,
        commissionStatus: 'PROJECTED',
        paymentStatus: charge.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'REQUIRES_ACTION',
        provider: charge.provider,
        providerRef: charge.providerRef,
        receiptNo: `CYR-${appointmentId.slice(-8).toUpperCase()}`,
      },
    });
    if (charge.status === 'SUCCEEDED') {
      await this.prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'CONFIRMED' } });
      await this.prisma.notification.create({
        data: { userId: user.id, kind: 'APPOINTMENT', title: 'Appointment confirmed', body: 'Your appointment is booked.', data: { appointmentId } },
      });
      const delay = appointment.startsAt.getTime() - Date.now() - 60 * 60 * 1000;
      if (delay > 0) await this.jobs.enqueue('appointment.reminder', { appointmentId }, delay);
    }
    await this.prisma.analyticsEvent.create({ data: { userId: user.id, name: 'appointment_paid', props: { appointmentId, grossMinor: settlement.grossMinor, currency: settlement.currency } } });
    const response = { payment, clientSecret: charge.clientSecret ?? null };
    await this.payments.store(user.id, idempotencyKey, JSON.parse(JSON.stringify(response)));
    return response;
  }

  async complete(user: AuthUser, appointmentId: string) {
    const appointment = await this.ownedByBusiness(user.id, appointmentId);
    if (appointment.status !== 'CONFIRMED' || appointment.payment?.paymentStatus !== 'SUCCEEDED') {
      throw new AppError(409, 'APPOINTMENT_NOT_READY', 'Only a paid confirmed appointment can be completed');
    }
    const settlement = calculateAppointmentCommission({
      grossMinor: appointment.payment.grossMinor,
      currency: appointment.payment.currency,
      commissionBps: appointment.payment.commissionBps,
      feeMinor: appointment.payment.feeMinor,
      taxMinor: appointment.payment.taxMinor,
    });
    await this.prisma.$transaction([
      this.prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'COMPLETED' } }),
      this.prisma.appointmentPayment.update({
        where: { appointmentId },
        data: { ...settlement, commissionStatus: 'ELIGIBLE', payoutStatus: 'PENDING' },
      }),
      this.prisma.payout.create({
        data: {
          businessId: appointment.businessId,
          paymentId: appointment.payment.id,
          amountMinor: settlement.businessMinor,
          currency: settlement.currency,
          status: 'PENDING',
          provider: appointment.payment.provider,
        },
      }),
    ]);
    return this.prisma.appointment.findUnique({ where: { id: appointmentId }, include: { payment: { include: { payout: true } }, service: true } });
  }

  async cancel(user: AuthUser, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId }, include: { payment: true, service: true, business: { include: { members: true } } } });
    if (!appointment) throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
    const manages = appointment.business.members.some((member) => member.userId === user.id);
    if (appointment.customerId !== user.id && !manages) throw new AppError(403, 'FORBIDDEN', 'You cannot cancel this appointment');
    if (appointment.status === 'COMPLETED') throw new AppError(409, 'APPOINTMENT_COMPLETED', 'Completed appointments are refunded through support');
    if (appointment.payment?.paymentStatus === 'SUCCEEDED' && appointment.payment.providerRef) {
      await this.payments.provider().refund(appointment.payment.providerRef, appointment.payment.grossMinor, appointment.payment.currency);
      await this.prisma.appointmentPayment.update({
        where: { id: appointment.payment.id },
        data: { paymentStatus: 'REFUNDED', refundStatus: 'REFUNDED', commissionStatus: 'VOID', payoutStatus: 'NOT_DUE' },
      });
    }
    await this.prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'CANCELLED' } });
    await this.prisma.notification.create({ data: { userId: appointment.customerId, kind: 'APPOINTMENT', title: 'Appointment cancelled', body: appointment.service.name, data: { appointmentId } } });
    return { cancelled: true };
  }

  async reschedule(user: AuthUser, appointmentId: string, startsAt: string) {
    const appointment = await this.ownedByBusiness(user.id, appointmentId);
    const slots = await this.slots(appointment.serviceId, startsAt.slice(0, 10), appointment.timezone);
    const match = slots.slots.find((slot) => slot.startsAt === new Date(startsAt).toISOString());
    if (!match) throw new AppError(409, 'SLOT_UNAVAILABLE', 'That time is no longer available');
    return this.prisma.appointment.update({ where: { id: appointmentId }, data: { startsAt: new Date(match.startsAt), endsAt: new Date(match.endsAt) } });
  }

  async listMine(user: AuthUser) {
    return this.prisma.appointment.findMany({
      where: { OR: [{ customerId: user.id }, { business: { members: { some: { userId: user.id } } } }] },
      include: { service: true, payment: true, business: true },
      orderBy: { startsAt: 'desc' },
      take: 50,
    });
  }

  async review(user: AuthUser, appointmentId: string, rating: number, body?: string) {
    const appointment = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.customerId !== user.id) throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
    if (appointment.status !== 'COMPLETED') throw new AppError(409, 'APPOINTMENT_NOT_COMPLETE', 'Reviews are available after the appointment');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new AppError(400, 'INVALID_RATING', 'Choose a rating from 1 to 5');
    return this.prisma.review.create({ data: { appointmentId, businessId: appointment.businessId, authorId: user.id, rating, body } });
  }

  private async ownedByBusiness(userId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { payment: true, business: { include: { members: true } }, service: true },
    });
    if (!appointment) throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
    const manages = appointment.business.members.some((member) => member.userId === userId);
    if (!manages) throw new AppError(403, 'FORBIDDEN', 'Only the business can update this appointment');
    return appointment;
  }
}
