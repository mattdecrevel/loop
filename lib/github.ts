export interface IssueData { title: string; body: string; labels: string[] }

function truncate(s: string, max = 120): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Build a GitHub issue (title/body/labels) from a Loop event type + payload. */
export function buildIssue(type: string, payload: Record<string, unknown>): IssueData {
  const p = payload ?? {};

  if (type === 'error') {
    const message = String(p.message ?? 'Unknown error');
    const lines: string[] = [`**Message:** ${message}`];
    if (p.route) lines.push(`**Route:** \`${String(p.route)}\``);
    if (p.source) lines.push(`**Source:** ${String(p.source)}`);
    if (p.stack) lines.push('', '**Stack:**', '```', String(p.stack), '```');
    return {
      title: `[Error] ${truncate(message)}`,
      body: lines.join('\n'),
      labels: ['bug'],
    };
  }

  if (type === 'feedback') {
    const category = String(p.category ?? 'general');
    const message = String(p.message ?? '');
    const lines: string[] = [];
    if (message) lines.push(message);
    if (Array.isArray(p.steps) && p.steps.length) {
      lines.push('', '**Steps:**');
      (p.steps as unknown[]).forEach((s, i) => lines.push(`${i + 1}. ${String(s)}`));
    }
    const meta: string[] = [];
    if (p.userEmail) meta.push(`From: ${String(p.userEmail)}`);
    const page = p.page ?? p.pageUrl;
    if (page) meta.push(`Page: ${String(page)}`);
    if (p.breadcrumb) meta.push(`Path: ${String(p.breadcrumb)}`);
    if (meta.length) lines.push('', meta.join(' · '));
    return {
      title: `[Feedback: ${category}] ${truncate(message || category)}`,
      body: lines.join('\n'),
      labels: ['user-feedback'],
    };
  }

  // Generic fallback.
  const title = String(p.title ?? p.message ?? `Loop event: ${type}`);
  const body = String(p.body ?? p.message ?? JSON.stringify(p, null, 2));
  return { title: `[${type}] ${truncate(title)}`, body, labels: ['loop'] };
}

/** Create a GitHub issue server-side using GITHUB_TOKEN. Returns null if no token or on failure. */
export async function createGitHubIssue(repo: string, data: IssueData): Promise<{ number: number; html_url: string } | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: data.title, body: data.body, labels: data.labels }),
  });
  if (!res.ok) {
    console.error('[loop/github]', res.status, await res.text().catch(() => ''));
    return null;
  }
  const j = (await res.json()) as { number: number; html_url: string };
  return { number: j.number, html_url: j.html_url };
}
