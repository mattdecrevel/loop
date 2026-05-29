import { describe, it, expect } from 'vitest';
import { renderEvent } from '@/lib/render';
import type { ParsedEvent } from '@/lib/events/schemas';

/**
 * Per-event-type baseline snapshots — locks the default house style so any
 * change to a renderer is forced through a test update. Each input is the
 * minimum-viable payload for that type with no extras.
 */
function ev(partial: Partial<ParsedEvent> & Pick<ParsedEvent, 'type' | 'category' | 'payload'>): ParsedEvent {
  return {
    severity: 'info',
    actions: [],
    digest: false,
    ...partial,
  } as ParsedEvent;
}

describe('renderEvent — per-type baseline snapshots', () => {
  it('error', () => {
    const { text, blocks } = renderEvent(ev({ type: 'error', category: 'errors', payload: { message: 'boom' } }), { siteLabel: 'demo.dev' });
    expect(text).toBe('Error — boom');
    expect(JSON.stringify(blocks)).toContain('🚨');
    expect(JSON.stringify(blocks)).toContain('Error');
  });

  it('signup', () => {
    const { text, blocks } = renderEvent(ev({ type: 'signup', category: 'users', payload: { email: 'a@b.com' } }), { siteLabel: 'demo.dev' });
    expect(text).toBe('New signup — a@b.com');
    expect(JSON.stringify(blocks)).toContain('👤');
  });

  it('subscription', () => {
    const { text, blocks } = renderEvent(ev({ type: 'subscription', category: 'revenue', payload: { email: 'a@b.com', kind: 'new', amount: 49, interval: 'month' } }), { siteLabel: 'demo.dev' });
    expect(text).toBe('Subscription new — a@b.com');
    expect(JSON.stringify(blocks)).toContain('🎉');
    expect(JSON.stringify(blocks)).toContain('$49/month');
  });

  it('feedback', () => {
    const { text, blocks } = renderEvent(ev({ type: 'feedback', category: 'feedback', payload: { category: 'question', message: 'how?' } }), { siteLabel: 'demo.dev' });
    expect(text).toBe('Feedback — question');
    expect(JSON.stringify(blocks)).toContain('❓');
    expect(JSON.stringify(blocks)).toContain('Question');
  });

  it('cron (ok)', () => {
    const { text, blocks } = renderEvent(ev({ type: 'cron', category: 'ops', payload: { name: 'nightly', ok: true } }), { siteLabel: 'demo.dev' });
    expect(text).toBe('Cron nightly ok');
    expect(JSON.stringify(blocks)).toContain('✅');
  });

  it('cron (failed)', () => {
    const { text, blocks } = renderEvent(ev({ type: 'cron', category: 'ops', payload: { name: 'nightly', ok: false } }), { siteLabel: 'demo.dev' });
    expect(text).toBe('Cron nightly failed');
    expect(JSON.stringify(blocks)).toContain('⚠️');
  });

  it('infra (info severity)', () => {
    const { text, blocks } = renderEvent(ev({ type: 'infra', category: 'ops', severity: 'info', payload: { host: 'web-1', message: 'high cpu' } }), { siteLabel: 'demo.dev' });
    expect(text).toBe('Infra — web-1: high cpu');
    expect(JSON.stringify(blocks)).toContain('📡');
  });

  it('booking', () => {
    const { text, blocks } = renderEvent(ev({ type: 'booking', category: 'bookings', payload: { name: 'Ada', email: 'a@b.com', start: 'May 30' } }), { siteLabel: 'demo.dev' });
    // Slack notification text still includes 'New booking' framing for sidebar previews.
    expect(text).toBe('New booking — Ada');
    // The booking renderer no longer uses a big header block — it leads with
    // an inline title line so the name + 📅 emoji are the opening signal.
    expect(blocks[0].type).toBe('section');
    expect(JSON.stringify(blocks[0])).toContain('*Ada*');
  });

  it('contact', () => {
    const { text, blocks } = renderEvent(ev({ type: 'contact', category: 'bookings', payload: { name: 'Ada', email: 'a@b.com', message: 'hi' } }), { siteLabel: 'demo.dev' });
    expect(text).toBe('Contact — Ada');
    expect(JSON.stringify(blocks)).toContain('✉️');
  });

  it('seo_report', () => {
    const { text, blocks } = renderEvent(ev({ type: 'seo_report', category: 'seo', payload: { siteLabel: 'demo.dev', clicks: 10, impressions: 100, product: { signups24h: 3, mrrUsd: 50 }, budget: { spentUsd: 2, capUsd: 25 } } }), { siteLabel: 'demo.dev' });
    expect(text).toBe('SEO digest · demo.dev — 10c/100i');
    const json = JSON.stringify(blocks);
    expect(json).toContain('📈');
    expect(json).toContain('*SEO digest*');
    expect(json).toContain('CTR: *10.0%*');
    expect(json).toContain('Search · last 7 days');
    // structured product → standard Product section + budget footer
    expect(json).toContain('Product · last 24h / 7d');
    expect(json).toContain('signups (24h): *3*');
    expect(json).toContain('MRR: *$50.00*');
    expect(json).toContain('Anthropic budget: $2.00 of $25.00 this month');
  });

  it('generic', () => {
    const { text, blocks } = renderEvent(ev({ type: 'generic', category: 'ops', payload: { title: 'Deploy', body: 'shipped' } }), { siteLabel: 'demo.dev' });
    expect(text).toBe('Deploy');
    expect(JSON.stringify(blocks)).toContain('Deploy');
    expect(JSON.stringify(blocks)).toContain('shipped');
  });

  it('raw', () => {
    const { text, blocks } = renderEvent(ev({ type: 'raw', category: 'ops', payload: { text: 'plain', blocks: [{ type: 'divider' }] } }));
    expect(text).toBe('plain');
    expect(blocks).toEqual([{ type: 'divider' }]);
  });
});

describe('renderEvent — severity override on infra', () => {
  it('info severity → 📡', () => {
    const { blocks } = renderEvent(ev({ type: 'infra', category: 'ops', severity: 'info', payload: { host: 'h', message: 'm' } }));
    expect(JSON.stringify(blocks)).toContain('📡');
  });
  it('warning severity stays 📡 (only error overrides)', () => {
    const { blocks } = renderEvent(ev({ type: 'infra', category: 'ops', severity: 'warning', payload: { host: 'h', message: 'm' } }));
    expect(JSON.stringify(blocks)).toContain('📡');
  });
  it('error severity → 🔴', () => {
    const { blocks } = renderEvent(ev({ type: 'infra', category: 'ops', severity: 'error', payload: { host: 'h', message: 'm' } }));
    expect(JSON.stringify(blocks)).toContain('🔴');
  });
});

describe('renderEvent — links + footerNote primitives across event types', () => {
  it('links add a URL button block on signup', () => {
    const { blocks } = renderEvent(ev({
      type: 'signup',
      category: 'users',
      links: [{ label: 'Open CRM', url: 'https://crm.example.com/lead/1' }],
      payload: { email: 'a@b.com' },
    }), { siteLabel: 'demo.dev' });
    const json = JSON.stringify(blocks);
    expect(json).toContain('Open CRM');
    expect(json).toContain('https://crm.example.com/lead/1');
  });

  it('footerNote renders as a context line on a cron event', () => {
    const { blocks } = renderEvent(ev({
      type: 'cron',
      category: 'ops',
      footerNote: 'Anthropic budget: $2.43 of $25.00 this month',
      payload: { name: 'nightly', ok: true },
    }), { siteLabel: 'demo.dev' });
    const footer = blocks.at(-1) as unknown as { type: string; elements: { text: string }[] };
    expect(footer.type).toBe('context');
    expect(footer.elements[0].text).toContain('Anthropic budget');
  });
});

describe('renderEvent — actions: todo / remind button identity', () => {
  function actionsOf(blocks: unknown[]) {
    return (blocks.find((b) => (b as { type: string }).type === 'actions') as
      | { elements: { action_id?: string; text: { text: string } }[] }
      | undefined);
  }

  it("actions: ['todo'] renders an Add to To-Do button with action_id=add_todo", () => {
    const { blocks } = renderEvent(ev({ type: 'error', category: 'errors', actions: ['todo'], payload: { message: 'boom' } }));
    const a = actionsOf(blocks);
    expect(a).toBeDefined();
    const btn = a!.elements.find((e) => e.action_id === 'add_todo');
    expect(btn).toBeDefined();
    expect(btn!.text.text).toContain('Add to To-Do');
  });

  it("actions: ['remind'] renders Remind 1h + Remind tomorrow with the correct action_ids", () => {
    const { blocks } = renderEvent(ev({ type: 'error', category: 'errors', actions: ['remind'], payload: { message: 'boom' } }));
    const a = actionsOf(blocks);
    expect(a).toBeDefined();
    const ids = a!.elements.map((e) => e.action_id);
    expect(ids).toContain('remind_1h');
    expect(ids).toContain('remind_24h');
    expect(ids).not.toContain('add_todo');
  });
});
