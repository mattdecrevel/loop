import type { ParsedEvent } from '@/lib/events/schemas';
import { section, richMessage, type ActionButton, type InteractiveButton, type SlackBlock } from './blocks';

export interface Rendered { text: string; blocks: SlackBlock[] }
export interface RenderContext { siteLabel?: string; projectSlug?: string; time?: Date; githubRepo?: string | null; autofixEnabled?: boolean }

/** Contextual emoji per type AND subtype. */
function pickEmoji(ev: ParsedEvent): string {
  const p = ev.payload as Record<string, any>;
  switch (ev.type) {
    case 'error': return '🚨';
    case 'feedback': return ({ bug: '🐛', question: '❓', feature: '💡', general: '💬' } as Record<string, string>)[p.category] ?? '💬';
    case 'subscription': return ({ new: '🎉', upgrade: '⬆️', downgrade: '⬇️', cancel: '👋', expired: '⌛', payment_failed: '⚠️', refund: '💸', addon: '➕', addon_cancel: '➖' } as Record<string, string>)[p.kind] ?? '💳';
    case 'signup': return p.kind === 'waitlist' ? '📝' : '👤';
    case 'cron': return p.ok ? '✅' : '⚠️';
    case 'infra': return ev.severity === 'error' ? '🔴' : '📡';
    case 'booking': return '📅';
    case 'contact': return '✉️';
    case 'seo_report': return '📈';
    case 'generic': return (p.emoji as string) ?? 'ℹ️';
    default: return 'ℹ️';
  }
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Pull just the call frames out of a stack. A JS stack starts with
 * `Error: <message>` (often multi-line) and then `    at …` frames — the
 * header repeats the message we already show in the section, so we drop
 * everything before the first frame and cap the depth. Falls back to the
 * first few lines when no `at` frames are present.
 */
function stackFrames(stack: string, depth = 6): string {
  const lines = stack.split('\n');
  const first = lines.findIndex((l) => /^\s*at\s/.test(l));
  return (first >= 0 ? lines.slice(first) : lines)
    .slice(0, depth)
    .map((l) => l.trim())
    .join('\n');
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
      // Show the error once: message in the section, only the call frames in the
      // code block (the stack's `Error: <message>` header just repeats the message).
      let body = String(p.message ?? '');
      if (p.stack) {
        const frames = stackFrames(String(p.stack));
        if (frames) body += `\n\`\`\`${frames}\`\`\``;
      }
      const errorIssueActions = [...issueButtons(ev, ctx), ...actionButtonsFor(ev)];
      return {
        text: `Error — ${p.message}`,
        blocks: richMessage({
          ...base, emoji, title: 'Error', body,
          // Where it came from lives in the footer next to the site, not a
          // separate middle line: `site · route · source`.
          footerExtra: [p.route ? `\`${p.route}\`` : null, p.source ? String(p.source) : null],
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
      // Captured console errors render as a dedicated sub-section (newest last,
      // capped) so the report carries the failing client context with it.
      const consoleErrs = Array.isArray(p.consoleErrors) ? p.consoleErrors.filter(Boolean) : [];
      const feedbackSubSections = consoleErrs.length
        ? [{ header: 'Console errors', lines: consoleErrs.slice(-10).map((e: string) => `\`${String(e)}\``) }]
        : undefined;
      return {
        text: `Feedback — ${p.category}`,
        blocks: richMessage({
          ...base, emoji, title, subject, breadcrumb: p.breadcrumb,
          body: p.message, steps: p.steps, subSections: feedbackSubSections, meta,
          ...(hasActions ? { interactiveActions: feedbackIssueActions, actions: feedbackUrlActions, divider: true } : {}),
        }),
      };
    }

    case 'signup': {
      const identity = p.name ? `${p.name} (${p.email})` : p.email;
      const isWaitlist = p.kind === 'waitlist';
      const title = isWaitlist ? 'Waitlist signup' : 'New signup';
      return {
        text: `${isWaitlist ? 'New waitlist signup' : 'New signup'} — ${identity}`,
        blocks: richMessage({
          ...base, emoji, title, subject: identity,
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
      // Stacked label-on-each-line layout (instead of Slack's 2-column field
      // grid). Easier to scan on mobile and avoids the grid breaking when
      // one field's value is much longer than another's.
      const detailLines: string[] = [
        `*When:* ${String(p.start)}`,
        `*Email:* ${String(p.email)}`,
      ];
      if (p.location) detailLines.push(`*Location:* ${String(p.location)}`);
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
          // Title is the booker's name, with notes (if any) inline as subject.
          // No redundant "New Booking" header block — the 📅 emoji + name + meet/
          // reschedule buttons are enough context, and the Slack notification
          // text above still reads "New booking — <name>" for sidebar previews.
          ...base, emoji, title: p.name,
          subject: p.notes ? String(p.notes) : undefined,
          body: detailLines.join('\n'),
          actions, divider: true,
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
      const ctr = p.impressions > 0 ? ((p.clicks / p.impressions) * 100).toFixed(1) : '0.0';
      // Standard digest layout, rendered centrally so every site is identical:
      //   Search (7d) · Product (24h/7d, when sent) · then any caller subSections.
      const subSections: { header: string; lines: string[] }[] = [
        {
          header: 'Search · last 7 days',
          lines: [
            `impressions: *${p.impressions}*   clicks: *${p.clicks}*   CTR: *${ctr}%*`,
            ...(Array.isArray(p.topQueries) && p.topQueries.length
              ? p.topQueries.slice(0, 5).map((x: string) => `• ${x}`)
              : []),
          ],
        },
      ];
      const pr = p.product;
      if (pr) {
        const lines: string[] = [];
        if (pr.signups24h != null) lines.push(`signups (24h): *${pr.signups24h}*`);
        if (pr.paidConversions7d != null) lines.push(`paid conversions (7d): *${pr.paidConversions7d}*`);
        if (pr.totalUsers != null) lines.push(`total users: *${pr.totalUsers}*`);
        if (pr.paidUsers != null) lines.push(`paid users: *${pr.paidUsers}*`);
        if (pr.mrrUsd != null) lines.push(`MRR: *$${pr.mrrUsd.toFixed(2)}*`);
        if (lines.length) subSections.push({ header: 'Product · last 24h / 7d', lines });
      }
      if (Array.isArray(p.subSections)) subSections.push(...p.subSections);
      // Budget footer: explicit footerNote wins; otherwise derive the standard
      // line from the structured budget numbers. siteLabel is appended as source.
      const budgetNote = p.budget
        ? `Anthropic budget: $${Number(p.budget.spentUsd).toFixed(2)} of $${Number(p.budget.capUsd).toFixed(2)} this month`
        : undefined;
      return {
        text: `SEO digest · ${p.siteLabel} — ${p.clicks}c/${p.impressions}i`,
        blocks: richMessage({
          ...base, emoji, title: 'SEO digest', subject: String(p.siteLabel),
          subSections,
          footerNote: base.footerNote ?? budgetNote,
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
