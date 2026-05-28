export interface SlackBlock { type: string; [k: string]: unknown }
export function section(text: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}
export function context(text: string): SlackBlock {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}

/** Render an aligned monospace table inside a code block. */
export function codeTable(columns: string[], rows: (string | number)[][]): string {
  const widths = columns.map((c, i) => Math.max(c.length, ...rows.map((r) => String(r[i] ?? '').length)));
  const fmtRow = (cells: (string | number)[]) =>
    cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ').trimEnd();
  const lines = [fmtRow(columns), ...rows.map(fmtRow)];
  return '```\n' + lines.join('\n') + '\n```';
}

export interface RichSubSection { header: string; lines: string[] }
export interface RichField { label: string; value: string }
export interface ActionButton { text: string; url: string; emoji?: string; style?: 'primary' | 'danger' }
export interface InteractiveButton { text: string; actionId: string; value?: string; emoji?: string; style?: 'primary' | 'danger' }

export interface RichMessageInput {
  emoji: string;
  title: string;
  header?: boolean;                 // render the title as a Slack header block (larger heading) instead of a bold section line
  subject?: string;                 // ` · {subject}` on the title line (e.g. "Ada on Pipeline")
  breadcrumb?: string;              // muted line under the title (e.g. "A > B > C")
  body?: string;
  steps?: string[];                 // numbered list (bug repro)
  subSections?: RichSubSection[];   // bold header + key/value lines (digests)
  fields?: RichField[];             // 2-col key/value grid (section.fields)
  table?: { columns: string[]; rows: (string | number)[][] };  // monospace code block
  meta?: (string | null | undefined)[];  // → muted context block
  actions?: ActionButton[];        // URL action buttons (rendered before the footer)
  interactiveActions?: InteractiveButton[];  // server-handled (action_id) buttons — rendered before URL buttons
  divider?: boolean;               // divider before the actions block
  footerNote?: string;             // optional helpful note in the footer (e.g. "Anthropic budget: $2.43 of $25.00 this month")
  siteLabel?: string;              // source footer (preferred)
  projectSlug?: string;            // source footer fallback
}

export function richMessage(input: RichMessageInput): SlackBlock[] {
  const blocks: SlackBlock[] = [];
  const head: string[] = [];
  if (input.header) {
    blocks.push({ type: 'header', text: { type: 'plain_text', text: `${input.emoji} ${input.title}`, emoji: true } });
  } else {
    head.push(`${input.emoji} *${input.title}*${input.subject ? ` · ${input.subject}` : ''}`);
  }
  if (input.breadcrumb) head.push(`_${input.breadcrumb}_`);
  if (input.body) head.push(input.body);
  if (input.steps?.length) {
    head.push('*Steps*');
    input.steps.forEach((s, i) => head.push(`${i + 1}. ${s}`));
  }
  for (const ss of input.subSections ?? []) {
    head.push('');
    head.push(`*${ss.header}*`);
    head.push(...ss.lines);
  }
  if (head.length) blocks.push(section(head.join('\n')));

  if (input.fields?.length) {
    blocks.push({
      type: 'section',
      fields: input.fields.map((f) => ({ type: 'mrkdwn', text: `*${f.label}*\n${f.value}` })),
    });
  }
  if (input.table) blocks.push(section(codeTable(input.table.columns, input.table.rows)));

  const meta = (input.meta ?? []).filter((m): m is string => Boolean(m && m.trim()));
  if (meta.length) blocks.push(context(meta.join('  ·  ')));

  const urlButtons = (input.actions ?? []).map((a) => ({
    type: 'button',
    text: { type: 'plain_text', text: a.emoji ? `${a.emoji} ${a.text}` : a.text, emoji: true },
    url: a.url,
    ...(a.style ? { style: a.style } : {}),
  }));
  const intButtons = (input.interactiveActions ?? []).map((b) => ({
    type: 'button',
    text: { type: 'plain_text', text: b.emoji ? `${b.emoji} ${b.text}` : b.text, emoji: true },
    action_id: b.actionId,
    ...(b.value ? { value: b.value } : {}),
    ...(b.style ? { style: b.style } : {}),
  }));
  const elements = [...intButtons, ...urlButtons];
  if (elements.length) {
    if (input.divider) blocks.push({ type: 'divider' });
    blocks.push({ type: 'actions', elements });
  }

  const source = input.siteLabel ?? input.projectSlug;
  const footer = [input.footerNote, source].filter((s): s is string => Boolean(s && s.trim())).join('  ·  ');
  if (footer) blocks.push(context(footer));
  return blocks;
}
