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
