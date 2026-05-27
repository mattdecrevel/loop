import type { ParsedEvent } from '@/lib/events/schemas';
import { section, richMessage, type SlackBlock } from './blocks';

export interface Rendered { text: string; blocks: SlackBlock[] }
export interface RenderContext { siteLabel?: string; projectSlug?: string; time?: Date }

const EMOJI: Record<string, string> = {
  error: '🚨', seo_report: '🔎', signup: '👤', subscription: '💰',
  feedback: '💬', cron: '⚙️', infra: '📡', booking: '📅', contact: '✉️',
  generic: 'ℹ️', raw: 'ℹ️',
};

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function renderEvent(ev: ParsedEvent, ctx?: RenderContext): Rendered {
  const p = ev.payload as Record<string, any>;
  const emoji = EMOJI[ev.type] ?? 'ℹ️';
  const base = { siteLabel: ctx?.siteLabel, projectSlug: ctx?.projectSlug, time: ctx?.time };

  switch (ev.type) {
    case 'raw':
      // Exempt passthrough — no house-style footer.
      return { text: p.text, blocks: (p.blocks as SlackBlock[]) ?? [section(p.text)] };

    case 'error': {
      let body = String(p.message ?? '');
      if (p.stack) {
        const trimmed = String(p.stack).split('\n').slice(0, 6).join('\n');
        body += `\n\`\`\`${trimmed}\`\`\``;
      }
      return {
        text: `Error — ${p.message}`,
        blocks: richMessage({
          ...base, emoji, title: 'Error', body,
          meta: [p.route ? `\`${p.route}\`` : null, p.source ? `source: ${p.source}` : null],
        }),
      };
    }

    case 'feedback': {
      const category = String(p.category);
      const title = category === 'general' ? 'General Feedback' : `${cap(category)} Report`;
      const subject = p.name && p.section ? `${p.name} on ${p.section}` : p.name;
      const page = p.page ?? p.pageUrl;
      const meta = [
        p.userEmail ? `${p.userEmail}${p.plan ? ` · ${p.plan}` : ''}` : null,
        page ? `\`${page}\`` : null,
        [p.browser, p.viewport].filter(Boolean).join(' / ') || null,
        [p.screen, p.locale, p.timezone].filter(Boolean).join(' · ') || null,
      ];
      return {
        text: `Feedback — ${p.category}`,
        blocks: richMessage({
          ...base, emoji, title, subject, breadcrumb: p.breadcrumb,
          body: p.message, steps: p.steps, meta,
        }),
      };
    }

    case 'signup': {
      const identity = p.name ? `${p.name} (${p.email})` : p.email;
      return {
        text: `${ctx?.siteLabel ?? 'signup'} | ${identity}`,
        blocks: [section(`*${ctx?.siteLabel ?? 'New signup'}* | ${identity}`)],
      };
    }

    case 'subscription': {
      const amt = p.amount ? `$${p.amount}${p.interval ? `/${p.interval}` : ''}` : null;
      return {
        text: `Subscription ${p.kind} — ${p.email}`,
        blocks: richMessage({
          ...base, emoji, title: 'Subscription', subject: String(p.kind), body: p.email,
          meta: [p.plan, amt],
        }),
      };
    }

    case 'cron': {
      const ok = Boolean(p.ok);
      const bodyLines: string[] = [];
      if (p.summary) bodyLines.push(String(p.summary));
      if (Array.isArray(p.bullets) && p.bullets.length) {
        bodyLines.push(...p.bullets.map((b: string) => `• ${b}`));
      }
      return {
        text: `Cron ${p.name} ${ok ? 'ok' : 'failed'}`,
        blocks: richMessage({
          ...base, emoji: ok ? '✅' : '⚠️', title: 'Cron', subject: String(p.name),
          body: bodyLines.length ? bodyLines.join('\n') : undefined,
          table: p.table, meta: [ok ? '✅ ok' : '⚠️ failed'],
        }),
      };
    }

    case 'infra': {
      return {
        text: `Infra — ${p.host}: ${p.message}`,
        blocks: richMessage({
          ...base, emoji, title: String(p.host), body: p.message, meta: [p.metric],
        }),
      };
    }

    case 'booking': {
      return {
        text: `Booking — ${p.name}`,
        blocks: richMessage({
          ...base, emoji, title: 'New booking', body: `${p.name} (${p.email})`,
          meta: [p.start, p.notes],
        }),
      };
    }

    case 'contact': {
      const body = `${p.name} (${p.email})${p.message ? `\n${p.message}` : ''}`;
      return {
        text: `Contact — ${p.name}`,
        blocks: richMessage({
          ...base, emoji, title: `Contact${p.source ? ` (${p.source})` : ''}`, body,
        }),
      };
    }

    case 'seo_report': {
      const ctr = p.impressions > 0 ? ((p.clicks / p.impressions) * 100).toFixed(2) : '0.00';
      let body = `${p.clicks} clicks · ${p.impressions} impressions · ${ctr}% CTR`;
      if (Array.isArray(p.topQueries) && p.topQueries.length) {
        body += `\n${p.topQueries.slice(0, 5).map((x: string) => `• ${x}`).join('\n')}`;
      }
      return {
        text: `${p.siteLabel} — ${p.clicks}c/${p.impressions}i`,
        blocks: richMessage({
          ...base, emoji, title: String(p.siteLabel), subject: 'search digest', body,
          subSections: Array.isArray(p.subSections) ? p.subSections : undefined,
        }),
      };
    }

    case 'generic': {
      const meta: (string | null | undefined)[] = Array.isArray(p.fields)
        ? p.fields.map((f: { label: string; value: string }) => `*${f.label}:* ${f.value}`)
        : [];
      if (p.context) meta.push(p.context);
      return {
        text: p.title,
        blocks: richMessage({
          ...base, emoji, title: String(p.title), body: p.body, meta,
          subSections: Array.isArray(p.subSections) ? p.subSections : undefined,
          table: p.table,
        }),
      };
    }

    default:
      return { text: 'Notification', blocks: richMessage({ ...base, emoji, title: 'Notification' }) };
  }
}
