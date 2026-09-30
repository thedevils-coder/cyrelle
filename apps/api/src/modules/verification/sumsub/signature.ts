import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Sumsub request signature.
 * https://docs.sumsub.com/reference/authentication
 * HMAC-SHA256 hex of: timestamp + UPPER(method) + path-with-query + raw body.
 */
export function signSumsubRequest(secret: string, timestamp: string, method: string, pathWithQuery: string, body: string): string {
  const payload = `${timestamp}${method.toUpperCase()}${pathWithQuery}${body}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

const WEBHOOK_ALGORITHMS: Record<string, string> = {
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
  HMAC_SHA1_HEX: 'sha1',
};

/**
 * Sumsub webhook digest.
 * https://docs.sumsub.com/docs/webhook-manager
 * HMAC of the raw body bytes. Algorithm comes from X-Payload-Digest-Alg.
 */
export function verifySumsubWebhookDigest(secret: string, rawBody: Buffer, digestHeader: string | undefined, algorithmHeader: string | undefined): boolean {
  if (!secret || !digestHeader || !algorithmHeader) return false;
  const nodeAlgorithm = WEBHOOK_ALGORITHMS[algorithmHeader.trim().toUpperCase()];
  if (!nodeAlgorithm) return false;
  const calculated = createHmac(nodeAlgorithm, secret).update(rawBody).digest('hex');
  const left = Buffer.from(calculated.toLowerCase());
  const right = Buffer.from(digestHeader.trim().toLowerCase());
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
