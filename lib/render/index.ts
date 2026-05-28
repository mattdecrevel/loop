import type { ParsedEvent } from '@/lib/events/schemas';
import { section, richMessage, type ActionButton, type InteractiveButton, type RichField, type SlackBlock } from './blocks';

export interface Rendered { text: string; blocks: SlackBlock[] }
export interface RenderContext { siteLabel?: string; projectSlug?: string; time?: Date; githubRepo?: string | null; autofixEnabled?: boolean }

/** Contextual emoji per type AND subtype. */
function pickEmoji(ev: ParsedEvent): string {
  const p = ev.payload as Record<string, any>;
  switch (ev.type) {
    case 'error': return '🚨';
    case 'feedback': return ({ bug: '🐛', question: '❓', feature: '💡', general: '💬' } as Record<string, string>)[p.category] ?? '💬';
    case 'subscription': return ({ new: '🎉', upgrade: '⬆️', downgrade: '⬇️', cancel: '👋', expired: '⌛', payment_failed: '⚠️', refund: '💸', addon: '➕' } as Record<string, string>)[p.kind] ?? '💳';
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

/**
 * Opt-in To-Do / Remind buttons. Only rendered when the caller includes
 * `'todo'` / `'remind'` in the event's `actions`, so default messages stay clean.
 */
function actionButtonsFor(ev: ParsedEvent): InteractiveButton[] {
  const out: InteractiveButton[] = [];
  if (ev.actions?.includes('todo')) out.push({ emoji: '✅', text: 'Add to To-Do', actionId: 'add_todo' });
  if (ev.actions?.includes('remind')) {
    out.push({ text: 'Remind 1h', actionId: 'remind_1h' });
    out.push({ text: 'Remind tomorrow', actionId: 'remind_24h' });
  }
  return out;
}

/**
 * Build the Create Issue / + Auto-Fix interactive buttons for issue-eligible types.
 * Gated on the project having a github_repo. error/feedback are issue-eligible by default.
 */
function issueButtons(ev: ParsedEvent, ctx?: RenderContext): InteractiveButton[] {
  if (!ctx?.githubRepo) return [];
  return [
    { emoji: '🐛', text: 'Create Issue', actionId: 'create_issue', value: ev.type },
    ...(ctx.autofixEnabled || ev.actions.includes('autofix')
      ? [{ text: 'Create Issue + Auto-Fix', actionId: 'create_issue_autofix', value: ev.type, style: 'primary' as const }]
      : []),
  ];
}

export function renderEvent(ev: ParsedEvent, ctx?: RenderContext): Rendered {
  const p = ev.payload as Record<string, any>;
  const emoji = pickEmoji(ev);
  // Base-level primitives available to every non-raw type: a footer note and
  // link buttons (rendered as URL action buttons). Per-type renderers that build
  // their own URL buttons append these so nothing is clobbered.
  const linkActions: ActionButton[] = ev.links?.map((l) => ({ text: l.label, url: l.url })) ?? [];
  const base = {
    siteLabel: ctx?.siteLabel,
    projectSlug: ctx?.projectSlug,
    footerNote: ev.footerNote,
    ...(linkActions.length ? { actions: linkActions } : {}),
  };

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
      const errorIssueActions = [...issueButtons(ev, ctx), ...actionButtonsFor(ev)];
      return {
        text: `Error — ${p.message}`,
        blocks: richMessage({
          ...base, emoji, title: 'Error', body,
          meta: [p.route ? `\`${p.route}\`` : null, p.source ? `source: ${p.source}` : null],
          ...(errorIssueActions.length ? { interactiveActions: errorIssueActions, divider: true } : {}),
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
      const feedbackIssueActions = [...issueButtons(ev, ctx), ...actionButtonsFor(ev)];
      const pageUrl = typeof page === 'string' && /^https?:\/\//.test(page) ? page : null;
      const feedbackUrlActions: ActionButton[] = [
        ...(pageUrl ? [{ emoji: '🔗', text: 'View Page', url: pageUrl }] : []),
        ...linkActions,
      ];
      const hasActions = feedbackIssueActions.length || feedbackUrlActions.length;
      return {
        text: `Feedback — ${p.category}`,
        blocks: richMessage({
          ...base, emoji, title, subject, breadcrumb: p.breadcrumb,
          body: p.message, steps: p.steps, meta,
          ...(hasActions ? { interactiveActions: feedbackIssueActions, actions: feedbackUrlActions, divider: true } : {}),
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
          meta: [p.plan, amt, p.endsAt ? `ends ${p.endsAt}` : null, p.source, p.variant ? `\`${p.variant}\`` : null, p.subscriptionId ? `sub ${p.subscriptionId}` : null],
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
      const fields: RichField[] = [
        { label: 'When', value: String(p.start) },
        { label: 'Email', value: String(p.email) },
      ];
      if (p.location) fields.push({ label: 'Location', value: String(p.location) });
      // URL buttons: Email (mailto), Join Meet (if joinable URL provided),
      // Reschedule (if Cal.com manage URL provided), plus any `links` from extras.
      // The legacy "Add to Calendar" button is intentionally removed — every
      // realistic booking source (Cal.com, Calendly, etc.) already creates the
      // calendar event on its own, so re-adding it was duplicate work.
      const actions: ActionButton[] = [{ text: 'Email', url: `mailto:${p.email}` }];
      if (p.meetingUrl) actions.push({ text: '🎥 Join Meet', style: 'primary', url: String(p.meetingUrl) });
      if (p.manageUrl) actions.push({ text: 'Reschedule', url: p.manageUrl });
      actions.push(...linkActions);
      // Bookings are always follow-up candidates — default-include To-Do +
      // Remind interactive buttons even if the caller didn't opt in via
      // `actions: [...]`. Other event types still require explicit opt-in.
      const explicit = actionButtonsFor(ev);
      const haveTodo = explicit.some(b => b.actionId === 'add_todo');
      const haveRemind = explicit.some(b => b.actionId === 'remind_24h');
      const bookingInteractive: InteractiveButton[] = [
        ...(haveTodo ? [] : [{ emoji: '✅', text: 'Add to To-Do', actionId: 'add_todo' } as InteractiveButton]),
        ...(haveRemind ? [] : [{ text: 'Remind tomorrow', actionId: 'remind_24h' } as InteractiveButton]),
        ...explicit,
      ];
      return {
        text: `New booking — ${p.name}`,
        blocks: richMessage({
          ...base, emoji, header: true, title: 'New Booking',
          body: `*${p.name}*${p.notes ? ` · ${p.notes}` : ''}`,
          fields, actions, divider: true,
          interactiveActions: bookingInteractive,
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
        }),
      };
    }

    default:
      return { text: 'Notification', blocks: richMessage({ ...base, emoji, title: 'Notification' }) };
  }
}
