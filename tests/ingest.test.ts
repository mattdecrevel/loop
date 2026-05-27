import { describe, it, expect } from 'vitest';
import { validateIngest } from '@/lib/ingest';

describe('validateIngest', () => {
  it('rejects unknown type with a 400-shaped result', () => {
    const r = validateIngest({ type: 'bogus', payload: {} });
    expect(r.ok).toBe(false);
  });
  it('accepts a valid event', () => {
    const r = validateIngest({ type: 'cron', payload: { name: 'x', ok: true } });
    expect(r.ok).toBe(true);
  });
});
