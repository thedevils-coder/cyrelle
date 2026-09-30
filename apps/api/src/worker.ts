import { PrismaClient } from '@prisma/client';
import { Worker } from 'bullmq';

const prisma = new PrismaClient();

async function expireStories(): Promise<void> {
  await prisma.story.updateMany({ where: { status: 'PUBLISHED', expiresAt: { lt: new Date() } }, data: { status: 'REMOVED' } });
}

async function rollSubscriptions(): Promise<void> {
  const due = await prisma.personalSubscription.findMany({ where: { status: { in: ['ACTIVE', 'GRACE'] }, currentPeriodEnd: { lt: new Date() } } });
  for (const subscription of due) {
    if (subscription.cancelAtPeriodEnd || subscription.provider !== 'test') {
      await prisma.personalSubscription.update({ where: { id: subscription.id }, data: { status: 'EXPIRED' } });
      await prisma.subscriptionEvent.create({ data: { userId: subscription.userId, subscriptionId: subscription.id, type: 'premium.expired', payload: {} } });
      const user = await prisma.user.findUnique({ where: { id: subscription.userId } });
      if (user) {
        await prisma.emailDelivery.create({ data: { to: user.email, template: 'premium-expired', subject: 'Your Cyrelle Premium ended', body: 'Premium benefits and the Premium Blue Tick have ended unless another verification badge applies. Cyrelle Basic remains free.', status: 'QUEUED' } });
      }
    } else {
      const next = new Date(Date.now() + (subscription.interval === 'YEAR' ? 365 : 30) * 24 * 60 * 60 * 1000);
      await prisma.personalSubscription.update({ where: { id: subscription.id }, data: { currentPeriodEnd: next } });
      await prisma.subscriptionEvent.create({ data: { userId: subscription.userId, subscriptionId: subscription.id, type: 'premium.renewed', payload: {} } });
    }
  }
  const businessDue = await prisma.businessSubscription.findMany({ where: { status: 'ACTIVE', currentPeriodEnd: { lt: new Date() } } });
  for (const subscription of businessDue) {
    const status = subscription.cancelAtPeriodEnd || subscription.provider !== 'test' ? 'EXPIRED' : 'ACTIVE';
    const next = status === 'ACTIVE' ? new Date(Date.now() + (subscription.interval === 'YEAR' ? 365 : 30) * 24 * 60 * 60 * 1000) : subscription.currentPeriodEnd;
    await prisma.businessSubscription.update({ where: { id: subscription.id }, data: { status, currentPeriodEnd: next } });
  }
}

async function remindAppointments(): Promise<void> {
  const soon = new Date(Date.now() + 60 * 60 * 1000);
  const rows = await prisma.appointment.findMany({ where: { status: 'CONFIRMED', startsAt: { gt: new Date(), lt: soon } }, include: { service: true } });
  for (const row of rows) {
    const existing = await prisma.notification.findFirst({ where: { userId: row.customerId, kind: 'APPOINTMENT', data: { path: ['appointmentId'], equals: row.id } } });
    if (existing) continue;
    await prisma.notification.create({ data: { userId: row.customerId, kind: 'APPOINTMENT', title: 'Appointment reminder', body: row.service.name, data: { appointmentId: row.id, reminder: true } } });
  }
}

async function scan(): Promise<void> {
  await expireStories();
  await rollSubscriptions();
  await remindAppointments();
}

async function main(): Promise<void> {
  const redis = process.env.REDIS_URL;
  if (redis && process.env.ENABLE_QUEUES !== 'false') {
    const worker = new Worker(
      'cyrelle',
      async (job) => {
        if (job.name === 'stories.expire') await expireStories();
        if (job.name === 'subscriptions.roll') await rollSubscriptions();
        if (job.name === 'appointment.reminder') await remindAppointments();
        if (job.name === 'media.process') return { processed: true };
      },
      { connection: { url: redis } },
    );
    worker.on('failed', (job, error) => console.error(job?.name, error.message));
  }
  await scan();
  setInterval(() => void scan().catch((error) => console.error(error)), 60_000);
  console.log('Cyrelle worker running');
}

void main();
