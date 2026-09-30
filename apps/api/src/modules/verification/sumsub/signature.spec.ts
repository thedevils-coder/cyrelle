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
