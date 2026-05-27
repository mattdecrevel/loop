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
    expect(json).toContain('📅');
    expect(json).toContain('🗓️ May 30');
  });
  it('adds an Add-to-Calendar button and a preceding divider when startIso is supplied', () => {
    const { blocks } = renderEvent({
      type: 'booking',
      payload: {
        name: 'Sam', email: 'sam@x.com', start: 'May 30', notes: 'migration',
        startIso: '2026-05-30T18:00:00Z', endIso: '2026-05-30T18:30:00Z',
        location: 'Google Meet', manageUrl: 'https://cal.com/booking/abc123',
      },
    } as any, { siteLabel: 'decrevel.dev' });
    const dividerIdx = blocks.findIndex((b) => b.type === 'divider');
    const actionsIdx = blocks.findIndex((b) => b.type === 'actions');
    expect(dividerIdx).toBe(actionsIdx - 1);
    const actionsBlock = blocks[actionsIdx] as unknown as { elements: { url?: string }[] };
    const urls = actionsBlock.elements.map((e) => e.url);
    expect(urls).toContain('mailto:sam@x.com');
    expect(urls.some((u) => u?.includes('calendar.google.com'))).toBe(true);
    expect(urls).toContain('https://cal.com/booking/abc123');
    expect(JSON.stringify(blocks)).toContain('📍 Google Meet');
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
