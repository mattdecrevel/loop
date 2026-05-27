import type { ParsedEvent } from '@/lib/events/schemas';
import { section, context, type SlackBlock } from './blocks';

export interface Rendered { text: string; blocks: SlackBlock[] }

const EMOJI: Record<string, string> = {
  error: ':rotating_light:', seo_report: ':mag:', signup: ':bust_in_silhouette:',
  subscription: ':moneybag:', feedback: ':speech_balloon:', cron: ':gear:',
  infra: ':satellite_antenna:', booking: ':calendar:', contact: ':envelope:',
  generic: ':information_source:', raw: ':information_source:',
};

export function renderEvent(ev: ParsedEvent): Rendered {
  const p = ev.payload as Record<string, any>;
  const emoji = EMOJI[ev.type] ?? ':information_source:';

  switch (ev.type) {
    case 'raw':
      return { text: p.text, blocks: (p.blocks as SlackBlock[]) ?? [section(p.text)] };
    case 'generic': {
      const lines = [`${emoji} *${p.title}*`, p.body];
      if (Array.isArray(p.fields)) for (const f of p.fields) lines.push(`• *${f.label}:* ${f.value}`);
      const blocks = [section(lines.join('\n'))];
      if (p.context) blocks.push(context(p.context));
      return { text: p.title, blocks };
    }
    case 'signup': {
      const id = p.name ? `${p.name} (${p.email})` : p.email;
      return { text: `New signup — ${id}`, blocks: [section(`${emoji} *New signup*\n${id}`)] };
    }
    case 'subscription': {
      const id = p.email;
      const amt = p.amount ? ` — $${p.amount}${p.interval ? `/${p.interval}` : ''}` : '';
      return { text: `Subscription ${p.kind} — ${id}`, blocks: [section(`${emoji} *Subscription: ${p.kind}*\n${id}${p.plan ? ` · ${p.plan}` : ''}${amt}`)] };
    }
    case 'error': {
      const lines = [`${emoji} *Error*`, p.message];
      if (p.route) lines.push(`• \`${p.route}\``);
      if (p.stack) lines.push('```' + String(p.stack).split('\n').slice(0, 6).join('\n') + '```');
      return { text: `Error — ${p.message}`, blocks: [section(lines.join('\n'))] };
    }
    case 'feedback': {
      const lines = [`${emoji} *Feedback: ${p.category}*`, p.message];
      if (p.userEmail) lines.push(`• ${p.userEmail}`);
      if (p.page) lines.push(`• \`${p.page}\``);
      return { text: `Feedback — ${p.category}`, blocks: [section(lines.join('\n'))] };
    }
    case 'cron': {
      const icon = p.ok ? ':white_check_mark:' : ':warning:';
      return { text: `Cron ${p.name} ${p.ok ? 'ok' : 'failed'}`, blocks: [section(`${icon} *Cron: ${p.name}*${p.summary ? `\n${p.summary}` : ''}`)] };
    }
    case 'infra': {
      return { text: `Infra — ${p.host}: ${p.message}`, blocks: [section(`${emoji} *${p.host}*\n${p.message}${p.metric ? `\n• ${p.metric}` : ''}`)] };
    }
    case 'booking': {
      return { text: `Booking — ${p.name}`, blocks: [section(`${emoji} *New booking*\n${p.name} (${p.email})\n${p.start}${p.notes ? `\n${p.notes}` : ''}`)] };
    }
    case 'contact': {
      return { text: `Contact — ${p.name}`, blocks: [section(`${emoji} *Contact${p.source ? ` (${p.source})` : ''}*\n${p.name} (${p.email})\n${p.message}`)] };
    }
    case 'seo_report': {
      const ctr = p.impressions > 0 ? ((p.clicks / p.impressions) * 100).toFixed(2) : '0.00';
      const q = Array.isArray(p.topQueries) && p.topQueries.length ? `\n${p.topQueries.slice(0, 5).map((x: string) => `• ${x}`).join('\n')}` : '';
      return { text: `${p.siteLabel} — ${p.clicks}c/${p.impressions}i`, blocks: [section(`${emoji} *${p.siteLabel} — search digest*\n${p.clicks} clicks · ${p.impressions} impressions · ${ctr}% CTR${q}`)] };
    }
    default:
      return { text: 'Notification', blocks: [section('Notification')] };
  }
}
