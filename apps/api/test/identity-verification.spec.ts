import { createHmac } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

const prisma = new PrismaClient();
const SECRET = 'sandbox-webhook-secret';
const APP_TOKEN = 'sandbox-app-token';
const API_SECRET = 'sandbox-secret-key';

function signed(raw: string, alg: 'sha256' | 'sha512' = 'sha256') {
  const digest = createHmac(alg, SECRET).update(Buffer.from(raw)).digest('hex');
  return { raw, digest, algorithm: alg === 'sha256' ? 'HMAC_SHA256_HEX' : 'HMAC_SHA512_HEX' };
}

describe('Sumsub identity verification', () => {
  let app: INestApplication;
  const originalFetch = globalThis.fetch;
  const createdApplicants = new Set<string>();
  let createCount = 0;

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
      data: { code: 'US', name: 'United States', currency: 'USD', languages: ['en'], timeZones: ['America/New_York'], emergency: [], paymentProviders: ['stripe'] },
    });
    await prisma.pricePlan.create({
      data: { product: 'PERSONAL_PREMIUM', interval: 'MONTH', countryCode: '', currency: 'USD', amountMinor: 699 },
    });

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || 'GET';
      const body = typeof init?.body === 'string' ? init.body : '';
      const headers = new Headers(init?.headers);
      if (headers.get('x-app-token') === API_SECRET || body.includes(API_SECRET) || body.includes(SECRET)) {
        throw new Error('secret leaked to Sumsub request body');
      }
      if (url.includes('/resources/applicants/-;externalUserId=')) {
        const externalUserId = decodeURIComponent(url.split('externalUserId=')[1]?.split('/')[0] || '');
        if (!createdApplicants.has(externalUserId)) {
          return new Response(JSON.stringify({ description: 'Not found', code: 404 }), { status: 404 });
        }
        return new Response(JSON.stringify({ id: `applicant-${externalUserId}`, inspectionId: `inspection-${externalUserId}` }), { status: 200 });
      }
      if (url.includes('/resources/applicants?levelName=')) {
        const parsed = JSON.parse(body) as { externalUserId?: string; phone?: string; document?: string };
        if (parsed.phone || parsed.document) throw new Error('applicant create included a phone or document');
        if (!headers.get('x-app-access-sig') || headers.get('x-app-token') !== APP_TOKEN) {
          return new Response(JSON.stringify({ description: 'Request signature mismatch', code: 401 }), { status: 401 });
        }
        createdApplicants.add(parsed.externalUserId || '');
        createCount += 1;
        return new Response(JSON.stringify({ id: `applicant-${parsed.externalUserId}`, inspectionId: `inspection-${parsed.externalUserId}`, info: { idDocs: [{ number: 'SHOULD-NOT-BE-STORED' }] } }), { status: 200 });
      }
      if (url.includes('/resources/accessTokens/sdk')) {
        return new Response(JSON.stringify({ token: 'sdk-token-value', userId: 'member' }), { status: 200 });
      }
      if (url.includes('/presence/deactivated')) {
        return new Response(JSON.stringify({ ok: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 500 }), { status: 500 });
    }) as typeof fetch;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await app.close();
    await prisma.$disconnect();
  });

  async function register(username: string, email: string) {
    const response = await request(app.getHttpServer()).post('/v1/auth/register').send({
      name: username,
      username,
      email,
      password: 'CyrelleTest1',
      countryCode: 'US',
      acceptTerms: true,
      acceptPrivacy: true,
    });
    expect(response.status).toBe(201);
    return { token: response.body.accessToken as string, userId: response.body.account.id as string, verify: response.body.devPreview.token as string };
  }

  function webhook(raw: string, digest?: string, algorithm?: string) {
    const call = request(app.getHttpServer()).post('/v1/identity-verification/sumsub/webhook').set('Content-Type', 'application/json');
    if (digest) call.set('X-Payload-Digest', digest);
    if (algorithm) call.set('X-Payload-Digest-Alg', algorithm);
    return call.send(raw);
  }

  it('rejects unauthenticated reads, client-supplied results, and document uploads', async () => {
    await request(app.getHttpServer()).get('/v1/identity-verification/status').expect(401);
    const member = await register('memberone', 'memberone@cyrelle.test');
    const forged = await request(app.getHttpServer())
      .post('/v1/identity-verification/start')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ status: 'VERIFIED' });
    expect(forged.status).toBe(400);

    const upload = await request(app.getHttpServer())
      .post('/v1/verification')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ documentType: 'passport', documentCountry: 'US', document: 'image-bytes', selfie: 'selfie-bytes' });
    expect(upload.status).toBe(410);
    const stored = await prisma.userVerification.findUnique({ where: { userId: member.userId } });
    expect(stored?.documentCipher ?? null).toBeNull();
    expect(stored?.selfieCipher ?? null).toBeNull();
  });

  it('creates one Sumsub applicant, ignores client commission-style status, and keeps secrets on the server', async () => {
    const member = await register('membertwo', 'membertwo@cyrelle.test');
    const other = await register('memberthree', 'memberthree@cyrelle.test');
    const started = await request(app.getHttpServer())
      .post('/v1/identity-verification/start')
      .set('Authorization', `Bearer ${member.token}`)
      .send({});
    expect(started.status).toBe(201);
    expect(started.body.accessToken).toBe('sdk-token-value');
    expect(started.body.provider).toBe('sumsub');
    expect(JSON.stringify(started.body)).not.toContain(API_SECRET);
    expect(JSON.stringify(started.body)).not.toContain(SECRET);
    expect(JSON.stringify(started.body)).not.toContain(APP_TOKEN);
    expect(started.body.applicantId).toBeUndefined();

    const beforeReuse = createCount;
    const again = await request(app.getHttpServer())
      .post('/v1/identity-verification/start')
      .set('Authorization', `Bearer ${member.token}`)
      .send({});
    expect(again.status).toBe(201);
    expect(createdApplicants.has(member.userId)).toBe(true);
    expect(createCount).toBe(beforeReuse);

    const otherStatus = await request(app.getHttpServer())
      .get('/v1/identity-verification/status?userId=' + member.userId)
      .set('Authorization', `Bearer ${other.token}`);
    expect(otherStatus.status).toBe(200);
    expect(otherStatus.body.status).toBe('NOT_STARTED');

    const missing = await webhook('{"type":"applicantReviewed"}');
    expect(missing.status).toBe(401);
    const bad = signed('{"type":"applicantReviewed"}');
    const rejected = await webhook(bad.raw, 'deadbeef', bad.algorithm);
    expect(rejected.status).toBe(401);

    const approvedRaw = JSON.stringify({
      applicantId: `applicant-${member.userId}`,
      inspectionId: `inspection-${member.userId}`,
      correlationId: 'corr-approved',
      externalUserId: member.userId,
      type: 'applicantReviewed',
      reviewStatus: 'completed',
      sandboxMode: true,
      createdAtMs: '2026-04-30 08:00:00.000',
      reviewResult: {
        reviewAnswer: 'GREEN',
        clientComment: 'passport AB1234567',
        moderationComment: '123-45-6789',
      },
      info: { idDocs: [{ number: 'AB1234567' }] },
    });
    const approved = signed(approvedRaw);
    expect((await webhook(approved.raw, approved.digest, approved.algorithm)).status).toBe(200);
    expect((await webhook(approved.raw, approved.digest, approved.algorithm)).body.duplicate).toBe(true);

    const row = await prisma.userVerification.findUnique({ where: { userId: member.userId } });
    expect(row?.status).toBe('VERIFIED');
    expect(row?.providerApplicantId).toBe(`applicant-${member.userId}`);
    expect(row?.documentCipher).toBeNull();
    const dumped = JSON.stringify(await prisma.identityVerificationEvent.findMany({ where: { userId: member.userId } }))
      + JSON.stringify(await prisma.notification.findMany({ where: { userId: member.userId } }))
      + JSON.stringify(await prisma.auditLog.findMany({ where: { actorId: member.userId } }));
    expect(dumped).not.toContain('AB1234567');
    expect(dumped).not.toContain('123-45-6789');
    expect(await prisma.notification.count({ where: { userId: member.userId, body: 'Your identity verification is complete.' } })).toBe(1);

    await request(app.getHttpServer()).post('/v1/auth/verify-email').send({ token: member.verify }).expect(201);
    const beforePremium = await request(app.getHttpServer()).get('/v1/me/entitlements').set('Authorization', `Bearer ${member.token}`);
    expect(beforePremium.body.premiumBlueTick).toBe(false);

    const premium = await request(app.getHttpServer())
      .post('/v1/premium/checkout')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ interval: 'MONTH' });
    expect(premium.status).toBe(201);
    const withPremium = await request(app.getHttpServer()).get('/v1/me/entitlements').set('Authorization', `Bearer ${member.token}`);
    expect(withPremium.body.plan).toBe('PREMIUM');
    expect(withPremium.body.premiumBlueTick).toBe(true);

    const finalRaw = JSON.stringify({
      applicantId: `applicant-${member.userId}`,
      correlationId: 'corr-final',
      externalUserId: member.userId,
      type: 'applicantReviewed',
      reviewStatus: 'completed',
      createdAtMs: '2026-04-30 09:00:00.000',
      reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'FINAL', rejectLabels: ['FORGERY'] },
    });
    const finalEvent = signed(finalRaw);
    expect((await webhook(finalEvent.raw, finalEvent.digest, finalEvent.algorithm)).status).toBe(200);
    const restricted = await request(app.getHttpServer()).get('/v1/me/entitlements').set('Authorization', `Bearer ${member.token}`);
    expect(restricted.body.premiumBlueTick).toBe(false);
    const retry = await request(app.getHttpServer()).post('/v1/identity-verification/retry').set('Authorization', `Bearer ${member.token}`).send({});
    expect(retry.status).toBe(403);

    const staleRaw = JSON.stringify({
      applicantId: `applicant-${member.userId}`,
      correlationId: 'corr-stale',
      externalUserId: member.userId,
      type: 'applicantPending',
      reviewStatus: 'pending',
      createdAtMs: '2026-04-30 07:00:00.000',
    });
    const stale = signed(staleRaw);
    expect((await webhook(stale.raw, stale.digest, stale.algorithm)).status).toBe(200);
    expect((await prisma.userVerification.findUnique({ where: { userId: member.userId } }))?.status).toBe('RESTRICTED');
  });

  it('retries a resubmission rejection until the configured limit and records manual review', async () => {
    const member = await register('memberfour', 'memberfour@cyrelle.test');
    await request(app.getHttpServer()).post('/v1/identity-verification/start').set('Authorization', `Bearer ${member.token}`).send({}).expect(201);

    async function fail(correlationId: string, createdAtMs: string) {
      const raw = JSON.stringify({
        applicantId: `applicant-${member.userId}`,
        correlationId,
        externalUserId: member.userId,
        type: 'applicantReviewed',
        reviewStatus: 'completed',
        createdAtMs,
        reviewResult: { reviewAnswer: 'RED', reviewRejectType: 'RETRY', rejectLabels: ['UNSATISFACTORY_PHOTOS'] },
      });
      const event = signed(raw);
      expect((await webhook(event.raw, event.digest, event.algorithm)).status).toBe(200);
    }

    await fail('corr-retry-1', '2026-05-01 08:00:00.000');
    expect((await request(app.getHttpServer()).post('/v1/identity-verification/retry').set('Authorization', `Bearer ${member.token}`).send({})).status).toBe(201);
    await fail('corr-retry-2', '2026-05-01 09:00:00.000');
    expect((await request(app.getHttpServer()).post('/v1/identity-verification/retry').set('Authorization', `Bearer ${member.token}`).send({})).status).toBe(201);
    await fail('corr-retry-3', '2026-05-01 10:00:00.000');
    const limited = await request(app.getHttpServer()).post('/v1/identity-verification/retry').set('Authorization', `Bearer ${member.token}`).send({});
    expect(limited.status).toBe(403);
    expect((await prisma.userVerification.findUnique({ where: { userId: member.userId } }))?.retryCount).toBe(2);
    expect((await prisma.notification.findFirst({ where: { userId: member.userId, body: { contains: 'could not be completed' } } }))?.body).not.toContain('UNSATISFACTORY');

    const reviewer = await register('reviewerone', 'reviewer@cyrelle.test');
    await request(app.getHttpServer()).post('/v1/identity-verification/start').set('Authorization', `Bearer ${reviewer.token}`).send({}).expect(201);
    const holdRaw = JSON.stringify({
      applicantId: `applicant-${reviewer.userId}`,
      correlationId: 'corr-hold',
      externalUserId: reviewer.userId,
      type: 'applicantOnHold',
      reviewStatus: 'onHold',
      createdAtMs: '2026-05-02 08:00:00.000',
    });
    const hold = signed(holdRaw);
    expect((await webhook(hold.raw, hold.digest, hold.algorithm)).status).toBe(200);
    const status = await request(app.getHttpServer()).get('/v1/identity-verification/status').set('Authorization', `Bearer ${reviewer.token}`);
    expect(status.body.status).toBe('MANUAL_REVIEW');
    expect(status.body.canRetry).toBe(false);
    const history = await request(app.getHttpServer()).get('/v1/identity-verification/history').set('Authorization', `Bearer ${reviewer.token}`);
    expect(JSON.stringify(history.body)).not.toContain(API_SECRET);
    expect(history.body.some((event: { eventType: string }) => event.eventType === 'applicantOnHold')).toBe(true);
  });

  it('lets admins review status without opening identity documents', async () => {
    const admin = await register('adminmember', 'adminmember@cyrelle.test');
    await prisma.user.update({ where: { id: admin.userId }, data: { role: 'ADMIN' } });
    const login = await request(app.getHttpServer()).post('/v1/auth/login').send({ email: 'adminmember@cyrelle.test', password: 'CyrelleTest1' });
    const adminToken = login.body.accessToken as string;
    const manual = await register('manualmember', 'manual@cyrelle.test');
    const record = await prisma.userVerification.findUniqueOrThrow({ where: { userId: manual.userId } });
    await prisma.userVerification.update({ where: { id: record.id }, data: { provider: 'manual', status: 'MANUAL_REVIEW' } });

    const list = await request(app.getHttpServer()).get('/v1/admin/verifications?status=MANUAL_REVIEW').set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((row: { id: string }) => row.id === record.id)).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain('documentCipher');

    const sumsubMember = await register('sumsubmember', 'sumsub@cyrelle.test');
    await request(app.getHttpServer()).post('/v1/identity-verification/start').set('Authorization', `Bearer ${sumsubMember.token}`).send({}).expect(201);
    const sumsubRecord = await prisma.userVerification.findUniqueOrThrow({ where: { userId: sumsubMember.userId } });
    const blocked = await request(app.getHttpServer())
      .post(`/v1/admin/verifications/${sumsubRecord.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'VERIFIED' });
    expect(blocked.status).toBe(403);

    const documents = await request(app.getHttpServer())
      .post(`/v1/admin/verifications/${record.id}/document`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(documents.status).toBe(403);
    expect(JSON.stringify(documents.body)).not.toContain('image');

    const reviewed = await request(app.getHttpServer())
      .post(`/v1/admin/verifications/${record.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'VERIFIED', note: 'Manual provider review' });
    expect(reviewed.status).toBe(201);
  });

  it('rate limits repeated verification starts', async () => {
    const member = await register('ratelimit', 'ratelimit@cyrelle.test');
    let limited = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/v1/identity-verification/start')
        .set('Authorization', `Bearer ${member.token}`)
        .send({});
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
