import { describe, it, expect } from 'vitest';
import { renderEvent } from '@/lib/render';

describe('renderEvent', () => {
  it('renders a signup as a single mobile-friendly section', () => {
    const { text, blocks } = renderEvent({ type: 'signup', payload: { email: 'a@b.com', name: 'Ada' } } as any);
    expect(text).toContain('a@b.com');
    expect(blocks[0].type).toBe('section');
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
