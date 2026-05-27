export interface SlackBlock { type: string; [k: string]: unknown }
export function section(text: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}
export function context(text: string): SlackBlock {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}

function fmtTime(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export interface RichMessageInput {
  emoji: string;
  title: string;
  subject?: string;            // appended as ` · {subject}` on the title line
  body?: string;
  meta?: (string | null | undefined)[];   // present-only items, joined by ' · '
  projectSlug?: string;
  time?: Date;
}

/** Compose the house-style blocks: [section, context]. Actions are inserted by Phase 2. */
export function richMessage(input: RichMessageInput): SlackBlock[] {
  const lines: string[] = [];
  lines.push(`${input.emoji} *${input.title}*${input.subject ? ` · ${input.subject}` : ''}`);
  if (input.body) lines.push(input.body);
  const meta = (input.meta ?? []).filter((m): m is string => Boolean(m && m.trim()));
  if (meta.length) { lines.push(''); lines.push(meta.join(' · ')); }
  const footerBits = ['loop', input.projectSlug, fmtTime(input.time ?? new Date())].filter(Boolean);
  return [section(lines.join('\n')), context(footerBits.join(' · '))];
}
