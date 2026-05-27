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

/** Render an aligned monospace table inside a code block. */
export function codeTable(columns: string[], rows: (string | number)[][]): string {
  const widths = columns.map((c, i) => Math.max(c.length, ...rows.map((r) => String(r[i] ?? '').length)));
  const fmtRow = (cells: (string | number)[]) =>
    cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ').trimEnd();
  const lines = [fmtRow(columns), ...rows.map(fmtRow)];
  return '```\n' + lines.join('\n') + '\n```';
}

export interface RichSubSection { header: string; lines: string[] }

export interface RichMessageInput {
  emoji: string;
  title: string;
  subject?: string;                 // ` · {subject}` on the title line (e.g. "Ada on Pipeline")
  breadcrumb?: string;              // muted line under the title (e.g. "A > B > C")
  body?: string;
  steps?: string[];                 // numbered list (bug repro)
  subSections?: RichSubSection[];   // bold header + key/value lines (digests)
  meta?: (string | null | undefined)[];
  table?: { columns: string[]; rows: (string | number)[][] };  // monospace code block
  siteLabel?: string;              // footer source domain (preferred)
  projectSlug?: string;            // footer fallback
  time?: Date;
}

export function richMessage(input: RichMessageInput): SlackBlock[] {
  const lines: string[] = [];
  lines.push(`${input.emoji} *${input.title}*${input.subject ? ` · ${input.subject}` : ''}`);
  if (input.breadcrumb) lines.push(`_${input.breadcrumb}_`);
  if (input.body) lines.push(input.body);
  if (input.steps?.length) {
    lines.push('*Steps*');
    input.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  for (const ss of input.subSections ?? []) {
    lines.push('');
    lines.push(`*${ss.header}*`);
    lines.push(...ss.lines);
  }
  const meta = (input.meta ?? []).filter((m): m is string => Boolean(m && m.trim()));
  if (meta.length) { lines.push(''); lines.push(meta.join(' · ')); }

  const blocks: SlackBlock[] = [section(lines.join('\n'))];
  if (input.table) blocks.push(section(codeTable(input.table.columns, input.table.rows)));

  const source = input.siteLabel ?? input.projectSlug;
  const footer = [source, fmtTime(input.time ?? new Date())].filter(Boolean).join(' · ');
  if (footer) blocks.push(context(footer));
  return blocks;
}
