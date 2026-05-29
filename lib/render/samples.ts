import type { EventType } from '@/lib/events/schemas';

export interface SampleEntry {
  /** Stable id used by the preview send actions. Equals `type` for the canonical sample of a type. */
  id: string;
  /** Short human label shown on the preview card / fire-all chip. */
  label: string;
  /** The underlying event type (drives the raw-passthrough badge + parse). */
  type: EventType;
  /** Full ingest envelope (`type` + `payload`), ready to feed through parseEvent / ingestEvent. */
  envelope: unknown;
}

/**
 * One realistic sample per type, plus a handful of variant kinds that share a
 * type but render differently (e.g. a waitlist signup, an add-on cancellation).
 * Ordered for the Previews page + the "fire all" sequence. Canonical samples use
 * `id === type`; variants get a `<type>-<kind>` id so the send actions can address
 * them individually.
 */
export const SAMPLE_ENTRIES = [
  {
    id: 'signup',
    label: 'signup',
    type: 'signup',
    envelope: {
      type: 'signup',
      payload: { email: 'ada@example.com', name: 'Ada Lovelace' },
    },
  },
  {
    id: 'signup-waitlist',
    label: 'signup · waitlist',
    type: 'signup',
    envelope: {
      type: 'signup',
      payload: { email: 'grace@example.com', name: 'Grace Hopper', kind: 'waitlist' },
    },
  },
  {
    id: 'subscription',
    label: 'subscription · downgrade',
    type: 'subscription',
    envelope: {
      type: 'subscription',
      payload: { email: 'ada@example.com', kind: 'downgrade', plan: 'Starter', amount: 9, interval: 'mo', endsAt: 'Jun 30, 2026' },
    },
  },
  {
    id: 'subscription-addon-cancel',
    label: 'subscription · addon cancel',
    type: 'subscription',
    envelope: {
      type: 'subscription',
      payload: { email: 'ada@example.com', kind: 'addon_cancel', plan: 'Extra search runs', source: 'lemon' },
    },
  },
  {
    id: 'cron',
    label: 'cron',
    type: 'cron',
    envelope: {
      type: 'cron',
      payload: {
        name: 'picks-nightly',
        ok: true,
        summary: 'Scored 38 options, surfaced the top 5 by expected value.',
        table: {
          columns: ['Ticker', 'Strike', 'EV', 'Conf'],
          rows: [
            ['NVDA', '$120c', '+18.4%', '0.82'],
            ['AAPL', '$210c', '+9.1%', '0.74'],
            ['TSLA', '$260p', '+7.6%', '0.69'],
          ],
        },
      },
    },
  },
  {
    id: 'seo_report',
    label: 'seo_report',
    type: 'seo_report',
    envelope: {
      type: 'seo_report',
      footerNote: 'Anthropic budget: $2.43 of $25.00 this month',
      payload: {
        siteLabel: 'decrevel.dev',
        clicks: 312,
        impressions: 8420,
        topQueries: ['matt decrevel', 'agentic workflows', 'next.js notification service'],
        subSections: [
          { header: 'Top movers', lines: ['• "loop notifications" +42 clicks', '• "drizzle neon" +18 clicks'] },
          { header: 'Health', lines: ['• 0 crawl errors', '• 3 new pages indexed'] },
        ],
      },
    },
  },
  {
    id: 'booking',
    label: 'booking',
    type: 'booking',
    envelope: {
      type: 'booking',
      payload: {
        name: 'Sam Rivera',
        email: 'sam@example.com',
        start: 'May 30, 2026 · 2:00 PM ET',
        notes: 'Wants to talk through a platform migration.',
        startIso: '2026-05-30T18:00:00Z',
        endIso: '2026-05-30T18:30:00Z',
        location: 'Google Meet',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        manageUrl: 'https://cal.com/booking/abc123',
      },
    },
  },
  {
    id: 'error',
    label: 'error',
    type: 'error',
    envelope: {
      type: 'error',
      links: [{ label: 'View in Sentry', url: 'https://sentry.io/organizations/decrevel/issues/12345/' }],
      payload: {
        message: 'Cannot read properties of undefined (reading "id")',
        route: '/api/export',
        source: 'export-button',
        stack: [
          'TypeError: Cannot read properties of undefined (reading "id")',
          '    at handleExport (app/components/export-button.tsx:42:18)',
          '    at onClick (app/components/export-button.tsx:71:7)',
          '    at HTMLButtonElement.callCallback (react-dom.js:188:14)',
        ].join('\n'),
      },
    },
  },
  {
    id: 'feedback',
    label: 'feedback · bug',
    type: 'feedback',
    envelope: {
      type: 'feedback',
      payload: {
        category: 'bug',
        message: 'The dark-mode toggle resets on every page navigation.',
        userEmail: 'user@example.com',
        name: 'Elio Vance',
        section: 'Settings',
        breadcrumb: 'Account > Preferences > Appearance',
        steps: [
          'Enable dark mode on the Settings page.',
          'Navigate to any other page.',
          'Observe the theme reverts to light.',
        ],
        plan: 'Pro',
        page: '/settings',
        browser: 'Chrome 124',
        viewport: '1440x900',
        screen: '2560x1440',
        locale: 'en-US',
        timezone: 'America/New_York',
        consoleErrors: [
          'TypeError: Cannot read properties of null (reading "theme") at applyTheme (theme.ts:18)',
          'Warning: useLayoutEffect does nothing on the server.',
        ],
      },
    },
  },
  {
    id: 'infra',
    label: 'infra',
    type: 'infra',
    envelope: {
      type: 'infra',
      payload: { host: 'db-primary', message: 'Disk usage is high.', metric: '92% of 100GB' },
    },
  },
  {
    id: 'contact',
    label: 'contact',
    type: 'contact',
    envelope: {
      type: 'contact',
      payload: {
        name: 'Jordan Lee',
        email: 'jordan@example.com',
        message: 'Loved the article on resume generation — do you do consulting?',
        source: 'contact-form',
      },
    },
  },
  {
    id: 'generic',
    label: 'generic',
    type: 'generic',
    envelope: {
      type: 'generic',
      category: 'ops',
      payload: {
        emoji: '🚀',
        title: 'Deploy succeeded',
        body: 'Production deploy of decrevel.dev completed.',
        fields: [
          { label: 'Commit', value: 'a0fdd48' },
          { label: 'Duration', value: '1m 12s' },
        ],
        context: 'triggered by push to production',
      },
    },
  },
  {
    id: 'raw',
    label: 'raw',
    type: 'raw',
    envelope: {
      type: 'raw',
      category: 'ops',
      payload: {
        text: 'A custom raw message (exempt from house style).',
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: '*Custom block* — passed through verbatim.' } },
          { type: 'divider' },
          { type: 'context', elements: [{ type: 'mrkdwn', text: 'no loop footer here' }] },
        ],
      },
    },
  },
] as const satisfies readonly SampleEntry[];

/** A single sample entry (the precise element type, with literal `id`/`type`). */
export type Sample = (typeof SAMPLE_ENTRIES)[number];

/**
 * Union of every sample's `id` — derived from SAMPLE_ENTRIES so the list stays
 * the single source of truth (same `as const` → derived-union pattern as the
 * LOOP_* tuples). Keeps the preview send actions typed rather than stringly-typed.
 */
export type SampleId = Sample['id'];

/** Look up a sample entry by its stable id. */
export function sampleById(id: SampleId): Sample | undefined {
  return SAMPLE_ENTRIES.find((s) => s.id === id);
}
