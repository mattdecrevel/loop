import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, projects } from '@/lib/db/schema';
import { chatUpdate } from '@/lib/slack/transport';
import { section, context } from '@/lib/render/blocks';

export const runtime = 'nodejs';

/** Verify the GitHub webhook HMAC-SHA256 signature (X-Hub-Signature-256). */
function verifyGitHubSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  if (!verifyGitHubSignature(raw, sig)) return new NextResponse('bad signature', { status: 401 });

  let body: { action?: string; issue?: { number?: number; html_url?: string } };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'closed' && body.issue?.number != null) {
    const issueNumber = body.issue.number;
    const [ev] = await db.select().from(events)
      .where(eq(events.githubIssueNumber, issueNumber))
      .limit(1);
    if (ev?.slackChannelId && ev.slackTs) {
      const issueUrl = ev.githubIssueUrl ?? body.issue.html_url ?? '';
      let source: string | undefined;
      if (ev.projectId) {
        const [proj] = await db.select().from(projects).where(eq(projects.id, ev.projectId)).limit(1);
        source = proj?.name;
      }
      const link = issueUrl ? `<${issueUrl}|Issue #${issueNumber}>` : `Issue #${issueNumber}`;
      const blocks = [
        section(`✅ *Resolved* · ${link} closed`),
        ...(source ? [context(source)] : []),
      ];
      await chatUpdate(ev.slackChannelId, ev.slackTs, `Resolved — issue #${issueNumber} closed`, blocks);
      await db.update(events).set({ resolvedAt: new Date() }).where(eq(events.id, ev.id));
    }
  }

  return NextResponse.json({ ok: true });
}
