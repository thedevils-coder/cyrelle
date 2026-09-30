import { createHmac } from 'crypto';
import { signSumsubRequest, verifySumsubWebhookDigest } from './signature';

describe('Sumsub signatures', () => {
  it('signs timestamp, method, path, and exact body the way the Sumsub API describes', () => {
    const timestamp = '1607551635';
    const method = 'post';
    const path = '/resources/accessTokens?userId=cfd20712-24a2-4c7d-9ab0-146f3c142335&levelName=basic-kyc-level&ttlInSecs=600';
    const body = '';
    const expected = createHmac('sha256', 'secret').update(`${timestamp}POST${path}${body}`).digest('hex');
    expect(signSumsubRequest('secret', timestamp, method, path, body)).toBe(expected);
  });

  it('verifies webhook digests with the algorithm header, including the mislabeled sample', () => {
    const secret = 'SoMe_SeCrEt_KeY';
    const raw = Buffer.from('someText');
    const publishedSample = 'f6e92ffe371718694d46e28436f76589312df8db';
    const sha256 = createHmac('sha256', secret).update(raw).digest('hex');
    const sha512 = createHmac('sha512', secret).update(raw).digest('hex');
    expect(sha256).not.toBe(publishedSample);
    expect(verifySumsubWebhookDigest(secret, raw, sha256, 'HMAC_SHA256_HEX')).toBe(true);
    expect(verifySumsubWebhookDigest(secret, raw, publishedSample, 'HMAC_SHA256_HEX')).toBe(false);
    expect(verifySumsubWebhookDigest(secret, raw, publishedSample, 'HMAC_SHA1_HEX')).toBe(true);
    expect(verifySumsubWebhookDigest(secret, raw, sha512, 'HMAC_SHA512_HEX')).toBe(true);
    expect(verifySumsubWebhookDigest(secret, raw, sha256.toUpperCase(), 'HMAC_SHA256_HEX')).toBe(true);
  });

  it('accepts a SHA-256 webhook digest of the raw body and rejects tampering', () => {
    const secret = 'sandbox-webhook-secret';
    const raw = Buffer.from('{"type":"applicantReviewed","reviewResult":{"reviewAnswer":"GREEN"}}');
    const digest = createHmac('sha256', secret).update(raw).digest('hex');
    expect(verifySumsubWebhookDigest(secret, raw, digest, 'HMAC_SHA256_HEX')).toBe(true);
    expect(verifySumsubWebhookDigest(secret, raw, digest, 'HMAC_SHA512_HEX')).toBe(false);
    expect(verifySumsubWebhookDigest(secret, Buffer.from(raw.toString() + ' '), digest, 'HMAC_SHA256_HEX')).toBe(false);
    expect(verifySumsubWebhookDigest(secret, raw, undefined, 'HMAC_SHA256_HEX')).toBe(false);
    expect(verifySumsubWebhookDigest(secret, raw, digest, undefined)).toBe(false);
    expect(verifySumsubWebhookDigest(secret, raw, '0'.repeat(digest.length), 'HMAC_SHA256_HEX')).toBe(false);
  });
});
