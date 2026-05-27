import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, projects } from '@/lib/db/schema';
import { verifySlackRequest } from '@/lib/slack/verify';
import { buildIssue, createGitHubIssue } from '@/lib/github';
import { chatUpdate } from '@/lib/slack/transport';
import { context } from '@/lib/render/blocks';
import type { SlackBlock } from '@/lib/render/blocks';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const raw = await req.text();
  const ts = req.headers.get('x-slack-request-timestamp');
  const sig = req.headers.get('x-slack-signature');
  if (!verifySlackRequest(raw, ts, sig)) return new NextResponse('bad signature', { status: 401 });

  const params = new URLSearchParams(raw);
  const payload = JSON.parse(params.get('payload') ?? '{}');
  const action = payload.actions?.[0];
  if (!action) return NextResponse.json({ ok: true });
  const actionId: string = action.action_id;
  const channel = payload.channel?.id;
  const msgTs = payload.message?.ts;

  if (actionId === 'create_issue' || actionId === 'create_issue_autofix') {
    // Find the originating event by (channel, ts)
    const [ev] = await db.select().from(events)
      .where(and(eq(events.slackChannelId, channel), eq(events.slackTs, msgTs)))
      .limit(1);
    if (ev?.projectId) {
      const [proj] = await db.select().from(projects).where(eq(projects.id, ev.projectId)).limit(1);
      if (proj?.githubRepo) {
        const data = buildIssue(ev.type, ev.payload as Record<string, unknown>);
        if (actionId === 'create_issue_autofix') data.labels = [...data.labels, 'claude-code'];
        const issue = await createGitHubIssue(proj.githubRepo, data);
        if (issue) {
          await db.update(events)
            .set({ githubIssueNumber: issue.number, githubIssueUrl: issue.html_url })
            .where(eq(events.id, ev.id));
          // Rebuild message: drop the actions block, append the issue link.
          const oldBlocks = ((payload.message?.blocks ?? []) as SlackBlock[]).filter((b) => b.type !== 'actions');
          const newBlocks = [...oldBlocks, context(`→ <${issue.html_url}|Issue #${issue.number}> opened`)];
          await chatUpdate(channel, msgTs, payload.message?.text ?? 'issue created', newBlocks);
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}
