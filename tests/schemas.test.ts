import { describe, it, expect } from 'vitest';
import { projects, channels, routes, events } from '@/lib/db/schema';
describe('schema', () => {
  it('exports all tables', () => {
    expect(projects).toBeDefined();
    expect(channels).toBeDefined();
    expect(routes).toBeDefined();
    expect(events).toBeDefined();
  });
});

import { parseEvent } from '@/lib/events/schemas';

describe('event envelope', () => {
  it('accepts a valid signup event and defaults category from type', () => {
    const r = parseEvent({ type: 'signup', payload: { email: 'a@b.com' } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('users');
  });
  it('rejects an unknown type', () => {
    const r = parseEvent({ type: 'nope', payload: {} });
    expect(r.success).toBe(false);
  });
  it('requires category for generic', () => {
    const r = parseEvent({ type: 'generic', payload: { title: 'x', body: 'y' } });
    expect(r.success).toBe(false); // category required when type=generic
  });
});
