import { describe, it, expect } from 'vitest';
import { renderEvent } from '@/lib/render';

describe('renderEvent', () => {
  it('renders a signup as a minimal one-liner with no footer chrome', () => {
    const { text, blocks } = renderEvent({ type: 'signup', payload: { email: 'a@b.com', name: 'Ada' } } as any, { siteLabel: 'decrevel.dev' });
    expect(text).toBe('decrevel.dev | Ada (a@b.com)');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('section');
    expect(JSON.stringify(blocks)).toContain('Ada (a@b.com)');
    expect(blocks.some((b) => b.type === 'context')).toBe(false);
  });
  it('renders feedback with a breadcrumb and numbered steps', () => {
    const { blocks } = renderEvent({
      type: 'feedback',
      payload: {
        category: 'bug', message: 'toggle resets', breadcrumb: 'A > B > C',
        steps: ['First do this', 'Then do that'],
      },
    } as any);
    const json = JSON.stringify(blocks);
    expect(json).toContain('A > B > C');
    expect(json).toContain('1. First do this');
    expect(json).toContain('2. Then do that');
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
  it('appends a context footer for non-raw types', () => {
    const { blocks } = renderEvent({ type: 'error', payload: { message: 'boom' } } as any);
    expect(blocks.at(-1)?.type).toBe('context');
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
