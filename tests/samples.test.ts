import { describe, it, expect } from 'vitest';
import { SAMPLE_ENTRIES, sampleById, type SampleId } from '@/lib/render/samples';
import { parseEvent } from '@/lib/events/schemas';
import { renderEvent } from '@/lib/render';

describe('preview samples', () => {
  it('every sample envelope parses successfully', () => {
    const failures = SAMPLE_ENTRIES.filter((s) => !parseEvent(s.envelope).success).map((s) => s.id);
    expect(failures).toEqual([]);
  });

  it('every sample renders without throwing', () => {
    for (const s of SAMPLE_ENTRIES) {
      const parsed = parseEvent(s.envelope);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(() => renderEvent(parsed.data, { projectSlug: 'demo', githubRepo: 'me/repo', autofixEnabled: true })).not.toThrow();
      }
    }
  });

  it('sample ids are unique', () => {
    const ids = SAMPLE_ENTRIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each entry envelope.type matches its declared type', () => {
    for (const s of SAMPLE_ENTRIES) {
      expect((s.envelope as { type: string }).type).toBe(s.type);
    }
  });

  it('sampleById resolves known ids and returns undefined otherwise', () => {
    expect(sampleById('signup')?.type).toBe('signup');
    expect(sampleById('signup-waitlist')?.type).toBe('signup');
    // Cast: exercising the runtime guard for an id outside the typed union.
    expect(sampleById('nope' as SampleId)).toBeUndefined();
  });

  it('includes the new variant + field samples', () => {
    const waitlist = sampleById('signup-waitlist');
    expect((waitlist?.envelope as { payload: { kind?: string } }).payload.kind).toBe('waitlist');

    const addonCancel = sampleById('subscription-addon-cancel');
    expect((addonCancel?.envelope as { payload: { kind?: string } }).payload.kind).toBe('addon_cancel');

    const feedback = sampleById('feedback');
    expect((feedback?.envelope as { payload: { consoleErrors?: string[] } }).payload.consoleErrors?.length).toBeGreaterThan(0);
  });
});
