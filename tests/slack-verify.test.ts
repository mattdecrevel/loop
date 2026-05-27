import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySlackRequest } from '@/lib/slack/verify';

const SECRET = 'test_signing_secret';

function sign(body: string, ts: string, secret = SECRET): string {
  return `v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`;
}

describe('verifySlackRequest', () => {
  const original = process.env.SLACK_SIGNING_SECRET;
  beforeEach(() => { process.env.SLACK_SIGNING_SECRET = SECRET; });
  afterEach(() => {
    if (original === undefined) delete process.env.SLACK_SIGNING_SECRET;
    else process.env.SLACK_SIGNING_SECRET = original;
  });

  it('accepts a valid signature within the skew window', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = 'payload=%7B%22type%22%3A%22block_actions%22%7D';
    expect(verifySlackRequest(body, ts, sign(body, ts))).toBe(true);
  });

  it('rejects a tampered body', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = 'payload=ok';
    const sig = sign(body, ts);
    expect(verifySlackRequest('payload=tampered', ts, sig)).toBe(false);
  });

  it('rejects a stale timestamp (>5 min skew)', () => {
    const ts = String(Math.floor(Date.now() / 1000) - 600);
    const body = 'payload=ok';
    expect(verifySlackRequest(body, ts, sign(body, ts))).toBe(false);
  });

  it('rejects when the signing secret is unset', () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const ts = String(Math.floor(Date.now() / 1000));
    const body = 'payload=ok';
    expect(verifySlackRequest(body, ts, sign(body, ts))).toBe(false);
  });

  it('rejects missing timestamp or signature', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(verifySlackRequest('body', null, 'v0=abc')).toBe(false);
    expect(verifySlackRequest('body', ts, null)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = 'payload=ok';
    expect(verifySlackRequest(body, ts, sign(body, ts, 'other_secret'))).toBe(false);
  });
});
