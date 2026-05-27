import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_SKEW_SECONDS = 60 * 5;

/**
 * Verify an inbound Slack request using SLACK_SIGNING_SECRET.
 * Reject if the secret is unset, the timestamp is older than 5 minutes, or the
 * `v0=` HMAC-SHA256 of `v0:{timestamp}:{rawBody}` does not match X-Slack-Signature.
 */
export function verifySlackRequest(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) return false;

  const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
