import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

const prisma = new PrismaClient();

describe('Cyrelle platform', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`
      DO $$ DECLARE r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations') LOOP
          EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `);
    await prisma.country.create({
      data: {
        code: 'IN',
        name: 'India',
        currency: 'INR',
        languages: ['en', 'hi'],
        timeZones: ['Asia/Kolkata'],
        emergency: [{ label: 'Emergency', number: '112', voice: true, sms: false }],
        smsSupported: false,
        paymentProviders: ['razorpay', 'stripe'],
        minAccountAge: null,
      },
    });
    await prisma.country.create({
      data: {
        code: 'US',
        name: 'United States',
        currency: 'USD',
        languages: ['en'],
        timeZones: ['America/New_York'],
        emergency: [{ label: 'Emergency', number: '911', voice: true, sms: false }],
        paymentProviders: ['stripe'],
      },
    });
    await prisma.pricePlan.createMany({
      data: [
        { product: 'PERSONAL_PREMIUM', interval: 'MONTH', countryCode: 'IN', currency: 'INR', amountMinor: 49900 },
        { product: 'PERSONAL_PREMIUM', interval: 'YEAR', countryCode: 'IN', currency: 'INR', amountMinor: 500000 },
        { product: 'PERSONAL_PREMIUM', interval: 'MONTH', countryCode: '', currency: 'USD', amountMinor: 699 },
        { product: 'BUSINESS_BLUE_TICK', interval: 'MONTH', countryCode: '', currency: 'USD', amountMinor: 1299 },
      ],
    });
    await prisma.platformSetting.create({ data: { key: 'appointment_commission_bps', value: { bps: 1500 } } });
    await prisma.featureFlag.create({
      data: {
        key: 'AdvancedLiveTools',
        name: 'Advanced live tools',
        description: 'Pin comments and slow mode',
        enabled: true,
        premiumLaunchAt: new Date('2024-01-01T00:00:00Z'),
        basicLaunchAt: new Date('2027-06-01T00:00:00Z'),
        rolloutPercent: 100,
      },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('registers with email, without a phone number, and without a universal 18+ gate', async () => {
    const phone = await request(app.getHttpServer()).post('/v1/auth/register').send({
      name: 'Phone Attempt',
      username: 'phoneattempt',
      email: 'phone@cyrelle.test',
      password: 'CyrelleTest1',
      acceptTerms: true,
      acceptPrivacy: true,
      phoneNumber: '+15551212',
    });
    expect(phone.status).toBe(400);

    const young = await request(app.getHttpServer()).post('/v1/auth/register').send({
      name: 'Young Member',
      username: 'youngmember',
      email: 'young@cyrelle.test',
      password: 'CyrelleTest1',
      dateOfBirth: '2014-04-02',
      countryCode: 'US',
      acceptTerms: true,
      acceptPrivacy: true,
    });
    expect(young.status).toBe(201);
    expect(young.body.account.email).toBe('young@cyrelle.test');
    expect(young.body.accessToken).toBeTruthy();
  });

  it('settles a ₹1,000 appointment at 15% on the server', async () => {
    const owner = await request(app.getHttpServer()).post('/v1/auth/register').send({
      name: 'Diya Verma',
      username: 'diyaverma',
      email: 'diya@cyrelle.test',
      password: 'CyrelleTest1',
      countryCode: 'IN',
      acceptTerms: true,
      acceptPrivacy: true,
    });
    expect(owner.status).toBe(201);
    const ownerToken = owner.body.accessToken as string;
    await request(app.getHttpServer()).post('/v1/auth/verify-email').send({ token: owner.body.devPreview.token }).expect(201);
    await prisma.userVerification.update({ where: { userId: owner.body.account.id }, data: { status: 'VERIFIED' } });

    const business = await request(app.getHttpServer())
      .post('/v1/businesses')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Bloom Atelier', username: 'bloomatelier', category: 'Wellness', countryCode: 'IN', timezone: 'Asia/Kolkata' });
    expect(business.status).toBe(201);
    expect(business.body.tier).toBe('STANDARD');

    const service = await request(app.getHttpServer())
      .post(`/v1/businesses/${business.body.id}/services`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Signature facial', description: 'Sixty quiet minutes', category: 'Skin', durationMinutes: 60, priceMinor: 100000, currency: 'INR' });
    expect(service.status).toBe(201);

    await request(app.getHttpServer())
      .post(`/v1/businesses/${business.body.id}/hours`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 12 * 60 })) })
      .expect(201);

    const slots = await request(app.getHttpServer()).get(`/v1/services/${service.body.id}/slots`).query({ date: '2026-10-05', zone: 'Asia/Kolkata' });
    expect(slots.status).toBe(200);
    expect(slots.body.slots.length).toBeGreaterThan(0);

    const customer = await request(app.getHttpServer()).post('/v1/auth/register').send({
      name: 'Aisha Khan',
      username: 'aishakhan',
      email: 'aisha@cyrelle.test',
      password: 'CyrelleTest1',
      countryCode: 'US',
      acceptTerms: true,
      acceptPrivacy: true,
    });
    const customerToken = customer.body.accessToken as string;
    const booking = await request(app.getHttpServer())
      .post('/v1/appointments')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ serviceId: service.body.id, startsAt: slots.body.slots[0].startsAt, viewerZone: 'Asia/Kolkata' });
    expect(booking.status).toBe(201);

    const paid = await request(app.getHttpServer())
      .post(`/v1/appointments/${booking.body.id}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ amountMinor: 1, commissionMinor: 1, businessMinor: 999999, idempotencyKey: 'pay-1000' });
    expect(paid.status).toBe(201);
    expect(paid.body.payment.grossMinor).toBe(100000);
    expect(paid.body.payment.commissionMinor).toBe(15000);
    expect(paid.body.payment.businessMinor).toBe(85000);
    expect(paid.body.payment.currency).toBe('INR');
    expect(paid.body.payment.commissionStatus).toBe('PROJECTED');

    const completed = await request(app.getHttpServer())
      .post(`/v1/appointments/${booking.body.id}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(completed.status).toBe(201);
    expect(completed.body.payment.commissionStatus).toBe('ELIGIBLE');
    expect(completed.body.payment.payout.amountMinor).toBe(85000);
  });

  it('keeps Premium and Business Blue Tick independent, and removes the Premium tick when Premium ends', async () => {
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send({ email: 'diya@cyrelle.test', password: 'CyrelleTest1' });
    const token = login.body.accessToken as string;
    const userId = login.body.account.id as string;
    await prisma.userVerification.update({ where: { userId }, data: { status: 'VERIFIED' } });

    const checkout = await request(app.getHttpServer())
      .post('/v1/premium/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ interval: 'MONTH', idempotencyKey: 'premium-diya' });
    expect(checkout.status).toBe(201);
    expect(checkout.body.subscription.amountMinor).toBe(49900);
    expect(checkout.body.subscription.currency).toBe('INR');
    expect(checkout.body.entitlements.plan).toBe('PREMIUM');
    expect(checkout.body.entitlements.premiumBlueTick).toBe(true);

    const businesses = await request(app.getHttpServer()).get('/v1/me/entitlements').set('Authorization', `Bearer ${token}`);
    expect(businesses.body.businesses[0].tier).toBe('STANDARD');
    expect(businesses.body.businesses[0].blueTickVisible).toBe(false);

    const features = await request(app.getHttpServer()).get('/v1/features').set('Authorization', `Bearer ${token}`);
    expect(features.body.find((item: { key: string }) => item.key === 'AdvancedLiveTools').state).toBe('enabled');

    const basic = await request(app.getHttpServer()).post('/v1/auth/login').send({ email: 'aisha@cyrelle.test', password: 'CyrelleTest1' });
    const basicFeatures = await request(app.getHttpServer()).get('/v1/features').set('Authorization', `Bearer ${basic.body.accessToken}`);
    expect(basicFeatures.body.find((item: { key: string }) => item.key === 'AdvancedLiveTools').state).toBe('coming_soon');

    await prisma.personalSubscription.updateMany({ where: { userId }, data: { status: 'EXPIRED', currentPeriodEnd: new Date('2020-01-01T00:00:00Z') } });
    const after = await request(app.getHttpServer()).get('/v1/me/entitlements').set('Authorization', `Bearer ${token}`);
    expect(after.body.plan).toBe('BASIC');
    expect(after.body.premiumBlueTick).toBe(false);
    expect(after.body.entitlements).toEqual(['AI_STANDARD']);
    expect(after.body.businesses[0].tier).toBe('STANDARD');
  });
});
