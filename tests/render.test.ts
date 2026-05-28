import { describe, it, expect } from 'vitest';
import { renderEvent } from '@/lib/render';
import { richMessage } from '@/lib/render/blocks';

describe('renderEvent', () => {
  it('renders a signup with the standardized skeleton and a source footer', () => {
    const { blocks } = renderEvent({ type: 'signup', payload: { email: 'a@b.com', name: 'Ada' } } as any, { siteLabel: 'decrevel.dev' });
    expect(blocks[0].type).toBe('section');
    const json = JSON.stringify(blocks);
    expect(json).toContain('👤');
    expect(json).toContain('New signup');
    expect(json).toContain('Ada (a@b.com)');
    // Now gets the source footer like every other type.
    expect(blocks.some((b) => b.type === 'context')).toBe(true);
    expect(blocks.at(-1)?.type).toBe('context');
    expect(JSON.stringify(blocks.at(-1))).toContain('decrevel.dev');
  });
  it('renders a feedback bug with the 🐛 emoji and a Bug Report title', () => {
    const { blocks } = renderEvent({
      type: 'feedback',
      payload: {
        category: 'bug', message: 'toggle resets', breadcrumb: 'A > B > C',
        steps: ['First do this', 'Then do that'],
      },
    } as any);
    const json = JSON.stringify(blocks);
    expect(json).toContain('🐛');
    expect(json).toContain('Bug Report');
    expect(json).toContain('A > B > C');
    expect(json).toContain('1. First do this');
    expect(json).toContain('2. Then do that');
  });
  it('renders general feedback with the 💬 emoji and differs from a bug', () => {
    const bug = renderEvent({ type: 'feedback', payload: { category: 'bug', message: 'x' } } as any);
    const general = renderEvent({ type: 'feedback', payload: { category: 'general', message: 'x' } } as any);
    const generalJson = JSON.stringify(general.blocks);
    expect(generalJson).toContain('💬');
    expect(generalJson).toContain('General Feedback');
    // contextual emoji varies by subtype: a bug and a general note are not the same.
    expect(JSON.stringify(bug.blocks)).not.toEqual(generalJson);
    expect(JSON.stringify(bug.blocks)).toContain('🐛');
  });
  it('renders a booking as an action card with a mailto button (no calendar without startIso)', () => {
    const { blocks } = renderEvent({
      type: 'booking',
      payload: { name: 'Sam', email: 'sam@x.com', start: 'May 30', notes: 'migration' },
    } as any, { siteLabel: 'decrevel.dev' });
    const actionsBlock = blocks.find((b) => b.type === 'actions') as
      | { type: string; elements: { url?: string }[] }
      | undefined;
    expect(actionsBlock).toBeDefined();
    const urls = actionsBlock!.elements.map((e) => e.url);
    expect(urls).toContain('mailto:sam@x.com');
    expect(urls.some((u) => u?.includes('calendar.google.com'))).toBe(false);
    const json = JSON.stringify(blocks);
    expect(blocks[0].type).toBe('header'); // bigger heading, not a bold section line
    expect(json).toContain('New Booking');
    expect(json).toContain('May 30'); // "When" field
  });
  it('renders Email / Join Meet / Reschedule buttons (no Add-to-Calendar) and a preceding divider', () => {
    const { blocks } = renderEvent({
      type: 'booking',
      payload: {
        name: 'Sam', email: 'sam@x.com', start: 'May 30', notes: 'migration',
        startIso: '2026-05-30T18:00:00Z', endIso: '2026-05-30T18:30:00Z',
        location: 'Google Meet', meetingUrl: 'https://meet.google.com/abc-defg-hij',
        manageUrl: 'https://cal.com/booking/abc123',
      },
    } as any, { siteLabel: 'decrevel.dev' });
    const dividerIdx = blocks.findIndex((b) => b.type === 'divider');
    const actionsIdx = blocks.findIndex((b) => b.type === 'actions');
    expect(dividerIdx).toBe(actionsIdx - 1);
    const actionsBlock = blocks[actionsIdx] as unknown as { elements: { url?: string }[] };
    const urls = actionsBlock.elements.map((e) => e.url);
    expect(urls).toContain('mailto:sam@x.com');
    expect(urls).toContain('https://meet.google.com/abc-defg-hij');
    expect(urls).toContain('https://cal.com/booking/abc123');
    // The legacy "Add to Calendar" button is gone — every booking source already
    // creates the calendar event upstream, so re-adding it was duplicate work.
    expect(urls.some((u) => u?.includes('calendar.google.com'))).toBe(false);
    expect(JSON.stringify(blocks)).toContain('Google Meet'); // "Location" field
    // Bookings default-include the To-Do + Remind interactive buttons.
    expect(JSON.stringify(blocks)).toContain('add_todo');
    expect(JSON.stringify(blocks)).toContain('remind_24h');
  });
  it('renders a cron table as a fenced code block', () => {
    const { blocks } = renderEvent({
      type: 'cron',
      payload: {
        name: 'picks', ok: true, summary: 'done',
        table: { columns: ['Ticker', 'EV'], rows: [['NVDA', '+18%']] },
      },
    } as any);
    const json = JSON.stringify(blocks);
    expect(json).toContain('```');
    expect(json).toContain('Ticker');
    expect(json).toContain('NVDA');
  });
  it('renders generic with provided title/body', () => {
    const { blocks } = renderEvent({ type: 'generic', category: 'ops', payload: { title: 'Deploy', body: 'shipped' } } as any);
    expect(JSON.stringify(blocks)).toContain('Deploy');
  });
  it('passes raw blocks through', () => {
    const { blocks } = renderEvent({ type: 'raw', payload: { text: 't', blocks: [{ type: 'divider' }] } } as any);
    expect(blocks).toEqual([{ type: 'divider' }]);
  });
  it('appends a source context footer for non-raw types', () => {
    const { blocks } = renderEvent({ type: 'error', payload: { message: 'boom' } } as any, { siteLabel: 'decrevel.dev' });
    expect(blocks.at(-1)?.type).toBe('context');
  });
  it('omits any timestamp from the source footer', () => {
    const { blocks } = renderEvent({ type: 'error', payload: { message: 'boom' } } as any, { siteLabel: 'decrevel.dev' });
    const footer = blocks.at(-1) as unknown as { type: string; elements: { text: string }[] };
    expect(footer.type).toBe('context');
    const text = footer.elements[0].text;
    expect(text).toContain('decrevel.dev');
    expect(text).not.toMatch(/\d:\d\d/);
  });
  it('omits the footer for raw passthrough', () => {
    const { blocks } = renderEvent({ type: 'raw', payload: { text: 't', blocks: [{ type: 'divider' }] } } as any);
    expect(blocks.some((b) => b.type === 'context')).toBe(false);
  });
  it('includes the project slug in the footer when ctx is passed', () => {
    const { blocks } = renderEvent({ type: 'error', payload: { message: 'boom' } } as any, { projectSlug: 'decrevel-dev' });
    expect(JSON.stringify(blocks)).toContain('decrevel-dev');
  });
  it('prefers the site domain label in the footer when provided', () => {
    const { blocks } = renderEvent({ type: 'error', payload: { message: 'boom' } } as any, { siteLabel: 'decrevel.dev', projectSlug: 'decrevel-dev' });
    expect(JSON.stringify(blocks)).toContain('decrevel.dev');
  });
});

describe('base-level links + footerNote primitives', () => {
  function actions(blocks: any[]) {
    return blocks.find((b) => b.type === 'actions') as { elements: { url?: string; text?: { text: string } }[] } | undefined;
  }
  it('renders base-level links as URL buttons on a non-booking event', () => {
    const { blocks } = renderEvent({
      type: 'error',
      links: [{ label: 'View in Sentry', url: 'https://sentry.io/issues/1' }],
      payload: { message: 'boom' },
    } as any, { siteLabel: 'decrevel.dev' });
    const a = actions(blocks);
    expect(a).toBeDefined();
    const urls = a!.elements.map((e) => e.url);
    expect(urls).toContain('https://sentry.io/issues/1');
    expect(JSON.stringify(blocks)).toContain('View in Sentry');
  });
  it('appends base-level links onto a bookings own action buttons', () => {
    const { blocks } = renderEvent({
      type: 'booking',
      links: [{ label: 'Open CRM', url: 'https://crm.example.com/lead/9' }],
      payload: { name: 'Sam', email: 'sam@x.com', start: 'May 30' },
    } as any, { siteLabel: 'decrevel.dev' });
    const a = actions(blocks);
    const urls = a!.elements.map((e) => e.url);
    expect(urls).toContain('mailto:sam@x.com');
    expect(urls).toContain('https://crm.example.com/lead/9');
  });
  it('renders footerNote in the footer context block on an arbitrary event', () => {
    const { blocks } = renderEvent({
      type: 'signup',
      footerNote: 'MRR: $4,210 this month',
      payload: { email: 'a@b.com', name: 'Ada' },
    } as any, { siteLabel: 'decrevel.dev' });
    const footer = blocks.at(-1) as unknown as { type: string; elements: { text: string }[] };
    expect(footer.type).toBe('context');
    expect(footer.elements[0].text).toContain('MRR: $4,210 this month');
    expect(footer.elements[0].text).toContain('decrevel.dev');
  });
});

describe('subscription downgrade + expired kinds', () => {
  it('renders a downgrade subscription with the ⬇️ emoji and an ends meta when endsAt is set', () => {
    const { blocks } = renderEvent({
      type: 'subscription',
      payload: { email: 'a@b.com', kind: 'downgrade', plan: 'Starter', endsAt: 'Jun 30, 2026' },
    } as any, { siteLabel: 'decrevel.dev' });
    const json = JSON.stringify(blocks);
    expect(json).toContain('⬇️');
    expect(json).toContain('downgrade');
    expect(json).toContain('ends Jun 30, 2026');
  });
  it('renders an expired subscription with the ⌛ emoji', () => {
    const { blocks } = renderEvent({
      type: 'subscription',
      payload: { email: 'a@b.com', kind: 'expired' },
    } as any);
    const json = JSON.stringify(blocks);
    expect(json).toContain('⌛');
    expect(json).toContain('expired');
  });
});

describe('issue buttons (gated by repo)', () => {
  function actions(blocks: any[]) {
    return blocks.find((b) => b.type === 'actions') as { elements: { action_id?: string; url?: string; style?: string }[] } | undefined;
  }
  it('error with githubRepo set gets a create_issue action', () => {
    const { blocks } = renderEvent({ type: 'error', actions: [], payload: { message: 'boom' } } as any, { githubRepo: 'me/repo' });
    const a = actions(blocks);
    expect(a).toBeDefined();
    expect(a!.elements.some((e) => e.action_id === 'create_issue')).toBe(true);
  });
  it('error without githubRepo has no interactive actions', () => {
    const { blocks } = renderEvent({ type: 'error', actions: [], payload: { message: 'boom' } } as any, {});
    const a = actions(blocks);
    expect(a).toBeUndefined();
  });
  it('autofixEnabled adds the create_issue_autofix action', () => {
    const { blocks } = renderEvent({ type: 'error', actions: [], payload: { message: 'boom' } } as any, { githubRepo: 'me/repo', autofixEnabled: true });
    const a = actions(blocks);
    expect(a!.elements.some((e) => e.action_id === 'create_issue_autofix')).toBe(true);
  });
  it('event-level autofix action adds the auto-fix button even when project flag is off', () => {
    const { blocks } = renderEvent({ type: 'error', actions: ['autofix'], payload: { message: 'boom' } } as any, { githubRepo: 'me/repo' });
    const a = actions(blocks);
    expect(a!.elements.some((e) => e.action_id === 'create_issue_autofix')).toBe(true);
  });
  it('feedback with githubRepo gets create_issue and a View Page URL button when page is a URL', () => {
    const { blocks } = renderEvent({ type: 'feedback', actions: [], payload: { category: 'bug', message: 'x', page: 'https://decrevel.dev/blog' } } as any, { githubRepo: 'me/repo' });
    const a = actions(blocks);
    expect(a!.elements.some((e) => e.action_id === 'create_issue')).toBe(true);
    expect(a!.elements.some((e) => e.url === 'https://decrevel.dev/blog')).toBe(true);
  });
  it('feedback without a URL page omits the View Page button', () => {
    const { blocks } = renderEvent({ type: 'feedback', actions: [], payload: { category: 'bug', message: 'x', page: '/relative/path' } } as any, { githubRepo: 'me/repo' });
    const a = actions(blocks);
    expect(a!.elements.some((e) => e.url)).toBe(false);
  });
});

describe('opt-in to-do + remind buttons', () => {
  function actions(blocks: any[]) {
    return blocks.find((b) => b.type === 'actions') as { elements: { action_id?: string }[] } | undefined;
  }
  it('error with actions [todo,remind] yields add_todo + remind_1h + remind_24h', () => {
    const { blocks } = renderEvent({ type: 'error', actions: ['todo', 'remind'], payload: { message: 'boom' } } as any, {});
    const ids = actions(blocks)!.elements.map((e) => e.action_id);
    expect(ids).toContain('add_todo');
    expect(ids).toContain('remind_1h');
    expect(ids).toContain('remind_24h');
  });
  it('omits to-do/remind buttons by default (empty actions)', () => {
    const { blocks } = renderEvent({ type: 'error', actions: [], payload: { message: 'boom' } } as any, {});
    expect(actions(blocks)).toBeUndefined();
  });
  it('feedback with actions [todo] yields add_todo and no remind buttons', () => {
    const { blocks } = renderEvent({ type: 'feedback', actions: ['todo'], payload: { category: 'bug', message: 'x' } } as any, {});
    const ids = actions(blocks)!.elements.map((e) => e.action_id);
    expect(ids).toContain('add_todo');
    expect(ids).not.toContain('remind_1h');
  });
});

describe('richMessage actions', () => {
  it('renders an actions block of URL buttons before the footer', () => {
    const blocks = richMessage({
      emoji: '📅', title: 'Card', body: 'hi',
      actions: [{ emoji: '📧', text: 'Email', url: 'mailto:a@b.com' }],
      siteLabel: 'decrevel.dev',
    });
    const actionsBlock = blocks.find((b) => b.type === 'actions') as
      | { type: string; elements: { type: string; url?: string }[] }
      | undefined;
    expect(actionsBlock).toBeDefined();
    expect(actionsBlock!.elements[0].type).toBe('button');
    expect(actionsBlock!.elements[0].url).toBe('mailto:a@b.com');
    // actions come before the trailing source footer
    expect(blocks.at(-1)?.type).toBe('context');
  });
  it('renders interactive (action_id) buttons with no url and before URL buttons', () => {
    const blocks = richMessage({
      emoji: '🚨', title: 'Error', body: 'boom',
      interactiveActions: [{ text: 'Create Issue', actionId: 'create_issue' }],
      actions: [{ text: 'Open', url: 'https://example.com' }],
    });
    const actionsBlock = blocks.find((b) => b.type === 'actions') as
      | { type: string; elements: { type: string; action_id?: string; url?: string; text: { text: string } }[] }
      | undefined;
    expect(actionsBlock).toBeDefined();
    // interactive button rendered first
    expect(actionsBlock!.elements[0].action_id).toBe('create_issue');
    expect(actionsBlock!.elements[0].url).toBeUndefined();
    // URL button rendered after
    expect(actionsBlock!.elements[1].url).toBe('https://example.com');
    expect(actionsBlock!.elements[1].action_id).toBeUndefined();
  });
  it('renders interactive buttons with optional value and style', () => {
    const blocks = richMessage({
      emoji: '🚨', title: 'Error',
      interactiveActions: [{ text: 'Auto-Fix', actionId: 'create_issue_autofix', value: 'error', style: 'primary' }],
    });
    const actionsBlock = blocks.find((b) => b.type === 'actions') as
      | { elements: { action_id?: string; value?: string; style?: string }[] }
      | undefined;
    expect(actionsBlock!.elements[0].action_id).toBe('create_issue_autofix');
    expect(actionsBlock!.elements[0].value).toBe('error');
    expect(actionsBlock!.elements[0].style).toBe('primary');
  });
  it('inserts a divider before the actions block when divider:true', () => {
    const blocks = richMessage({
      emoji: '📅', title: 'Card', body: 'hi', divider: true,
      actions: [{ text: 'Open', url: 'https://example.com' }],
    });
    const dividerIdx = blocks.findIndex((b) => b.type === 'divider');
    const actionsIdx = blocks.findIndex((b) => b.type === 'actions');
    expect(dividerIdx).toBeGreaterThanOrEqual(0);
    expect(dividerIdx).toBe(actionsIdx - 1);
  });
});
