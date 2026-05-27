import type { ParsedEvent } from '@/lib/events/schemas';
import { section, richMessage, type ActionButton, type SlackBlock } from './blocks';
import { googleCalendarUrl } from './calendar';

export interface Rendered { text: string; blocks: SlackBlock[] }
export interface RenderContext { siteLabel?: string; projectSlug?: string; time?: Date }

/** Contextual emoji per type AND subtype. */
function pickEmoji(ev: ParsedEvent): string {
  const p = ev.payload as Record<string, any>;
  switch (ev.type) {
    case 'error': return '🚨';
    case 'feedback': return ({ bug: '🐛', question: '❓', feature: '💡', general: '💬' } as Record<string, string>)[p.category] ?? '💬';
    case 'subscription': return ({ new: '🎉', upgrade: '⬆️', cancel: '👋', payment_failed: '⚠️', refund: '💸', addon: '➕' } as Record<string, string>)[p.kind] ?? '💳';
    case 'signup': return '👤';
    case 'cron': return p.ok ? '✅' : '⚠️';
    case 'infra': return ev.severity === 'error' ? '🔴' : '📡';
    case 'booking': return '📅';
    case 'contact': return '✉️';
    case 'seo_report': return '🔎';
    case 'generic': return (p.emoji as string) ?? 'ℹ️';
    default: return 'ℹ️';
  }
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function renderEvent(ev: ParsedEvent, ctx?: RenderContext): Rendered {
  const p = ev.payload as Record<string, any>;
  const emoji = pickEmoji(ev);
  const base = { siteLabel: ctx?.siteLabel, projectSlug: ctx?.projectSlug };

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
      const title = ({ bug: 'Bug Report', question: 'Question', feature: 'Feature Request', general: 'General Feedback' } as Record<string, string>)[category] ?? cap(category);
      const subject = p.name && p.section ? `${p.name} on ${p.section}` : (p.name ?? p.section);
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
        text: `New signup — ${identity}`,
        blocks: richMessage({
          ...base, emoji, title: 'New signup', subject: identity,
        }),
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
          ...base, emoji, title: String(p.name),
          body: bodyLines.length ? bodyLines.join('\n') : undefined,
          table: p.table, meta: [ok ? 'ok' : 'failed'],
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
      const bodyLines = [`*${p.name}*${p.notes ? ` · ${p.notes}` : ''}`, `🗓️ ${p.start}`, `📧 ${p.email}`];
      if (p.location) bodyLines.push(`📍 ${p.location}`);
      const actions: ActionButton[] = [{ emoji: '📧', text: 'Email', url: `mailto:${p.email}` }];
      if (p.startIso) actions.push({ emoji: '📅', text: 'Add to Calendar', style: 'primary',
        url: googleCalendarUrl({ title: p.notes || `Booking — ${p.name}`, startIso: p.startIso, endIso: p.endIso, location: p.location }) });
      if (p.manageUrl) actions.push({ emoji: '🗓️', text: 'Reschedule', url: p.manageUrl });
      return {
        text: `New booking — ${p.name}`,
        blocks: richMessage({
          ...base, emoji, title: 'New Booking', body: bodyLines.join('\n'),
          actions, divider: true,
        }),
      };
    }

    case 'contact': {
      const body = `${p.name} (${p.email})${p.message ? `\n${p.message}` : ''}`;
      return {
        text: `Contact — ${p.name}`,
        blocks: richMessage({
          ...base, emoji, title: 'Contact', subject: p.source, body,
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
          footerNote: p.footerNote,
        }),
      };
    }

    case 'generic': {
      return {
        text: p.title,
        blocks: richMessage({
          ...base, emoji, title: String(p.title), body: p.body,
          fields: Array.isArray(p.fields) ? p.fields : undefined,
          subSections: Array.isArray(p.subSections) ? p.subSections : undefined,
          table: p.table,
          meta: [p.context],
          footerNote: p.footerNote,
        }),
      };
    }

    default:
      return { text: 'Notification', blocks: richMessage({ ...base, emoji, title: 'Notification' }) };
  }
}
