import type { EventType } from '@/lib/events/schemas';

/** Ordered list of message types shown on the Previews page. */
export const SAMPLE_TYPES: EventType[] = [
  'signup', 'subscription', 'cron', 'seo_report', 'booking',
  'error', 'feedback', 'infra', 'contact', 'generic', 'raw',
];

/**
 * One realistic sample event envelope per type. Each is a full ingest payload
 * (envelope with `type` + `payload`), ready to feed through parseEvent / ingestEvent.
 */
export const SAMPLES: Record<EventType, unknown> = {
  signup: {
    type: 'signup',
    payload: { email: 'ada@example.com', name: 'Ada Lovelace' },
  },
  subscription: {
    type: 'subscription',
    payload: { email: 'ada@example.com', kind: 'new', plan: 'Pro', amount: 29, interval: 'mo' },
  },
  cron: {
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
  seo_report: {
    type: 'seo_report',
    payload: {
      siteLabel: 'decrevel.dev',
      clicks: 312,
      impressions: 8420,
      topQueries: ['matt decrevel', 'agentic workflows', 'next.js notification service'],
      subSections: [
        { header: 'Top movers', lines: ['• "loop notifications" +42 clicks', '• "drizzle neon" +18 clicks'] },
        { header: 'Health', lines: ['• 0 crawl errors', '• 3 new pages indexed'] },
      ],
      footerNote: 'Anthropic budget: $2.43 of $25.00 this month',
    },
  },
  booking: {
    type: 'booking',
    payload: {
      name: 'Sam Rivera',
      email: 'sam@example.com',
      start: 'May 30, 2026 · 2:00 PM ET',
      notes: 'Wants to talk through a platform migration.',
      startIso: '2026-05-30T18:00:00Z',
      endIso: '2026-05-30T18:30:00Z',
      location: 'Google Meet',
      manageUrl: 'https://cal.com/booking/abc123',
    },
  },
  error: {
    type: 'error',
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
  feedback: {
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
    },
  },
  infra: {
    type: 'infra',
    payload: { host: 'db-primary', message: 'Disk usage is high.', metric: '92% of 100GB' },
  },
  contact: {
    type: 'contact',
    payload: {
      name: 'Jordan Lee',
      email: 'jordan@example.com',
      message: 'Loved the article on resume generation — do you do consulting?',
      source: 'contact-form',
    },
  },
  generic: {
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
  raw: {
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
};
