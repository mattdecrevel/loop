import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, projects, reminders, todos } from '@/lib/db/schema';
import { verifySlackRequest } from '@/lib/slack/verify';
import { buildIssue, createGitHubIssue } from '@/lib/github';
import { chatUpdate } from '@/lib/slack/transport';
import { context } from '@/lib/render/blocks';
import { renderEvent } from '@/lib/render';
import type { ParsedEvent } from '@/lib/events/schemas';
import type { SlackBlock } from '@/lib/render/blocks';

export const runtime = 'nodejs';

type EventRow = typeof events.$inferSelect;

/** Find the originating event by the Slack (channel, message ts) pair. */
async function findEvent(channel: string, msgTs: string): Promise<EventRow | undefined> {
  const [ev] = await db.select().from(events)
    .where(and(eq(events.slackChannelId, channel), eq(events.slackTs, msgTs)))
    .limit(1);
  return ev;
}

/** A short human label for an event — reuses the renderer's one-line `text`. */
function summarize(ev: EventRow): string {
  try {
    return renderEvent({ type: ev.type, category: ev.category, severity: ev.severity, actions: [], digest: ev.digest, payload: ev.payload } as ParsedEvent).text;
  } catch {
    return `${ev.type} event`;
  }
}

/** Return the message blocks with the actions block dropped and a trailing context line appended. */
function appendContext(blocks: SlackBlock[] | undefined, text: string): SlackBlock[] {
  const kept = ((blocks ?? []) as SlackBlock[]).filter((b) => b.type !== 'actions');
  return [...kept, context(text)];
}

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
    const ev = await findEvent(channel, msgTs);
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
          const newBlocks = appendContext(payload.message?.blocks, `→ <${issue.html_url}|Issue #${issue.number}> opened`);
          await chatUpdate(channel, msgTs, payload.message?.text ?? 'issue created', newBlocks);
        }
      }
    }
  }

  if (actionId === 'add_todo') {
    const ev = await findEvent(channel, msgTs);
    if (ev) {
      await db.insert(todos).values({ eventId: ev.id, projectId: ev.projectId, text: summarize(ev) });
      const newBlocks = appendContext(payload.message?.blocks, '✅ Added to to-do');
      await chatUpdate(channel, msgTs, payload.message?.text ?? 'to-do added', newBlocks);
    }
  }

  if (actionId === 'remind_1h' || actionId === 'remind_24h') {
    const ev = await findEvent(channel, msgTs);
    if (ev) {
      const ms = actionId === 'remind_1h' ? 3_600_000 : 86_400_000;
      const remindAt = new Date(Date.now() + ms);
      await db.insert(reminders).values({
        eventId: ev.id, projectId: ev.projectId, text: summarize(ev),
        channelId: channel, messageTs: msgTs, remindAt,
      });
      const label = actionId === 'remind_1h' ? 'in 1 hour' : 'tomorrow';
      const newBlocks = appendContext(payload.message?.blocks, `⏰ Reminder set for ${label}`);
      await chatUpdate(channel, msgTs, payload.message?.text ?? 'reminder set', newBlocks);
    }
  }

  return NextResponse.json({ ok: true });
}
