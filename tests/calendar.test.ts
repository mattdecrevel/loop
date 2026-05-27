import { describe, it, expect } from 'vitest';
import { googleCalendarUrl } from '@/lib/render/calendar';

describe('googleCalendarUrl', () => {
  it('builds a Google Calendar template URL with compact dates and encoded title', () => {
    const url = googleCalendarUrl({
      title: 'Intro call',
      startIso: '2026-06-01T16:00:00Z',
      endIso: '2026-06-01T16:30:00Z',
    });
    expect(url).toContain('calendar.google.com');
    expect(url).toContain('dates=20260601T160000Z%2F20260601T163000Z');
    expect(url).toContain('text=Intro+call');
  });

  it('defaults to a 30-minute window when endIso is omitted', () => {
    const url = googleCalendarUrl({ title: 'Sync', startIso: '2026-06-01T16:00:00Z' });
    expect(url).toContain('dates=20260601T160000Z%2F20260601T163000Z');
  });
});
