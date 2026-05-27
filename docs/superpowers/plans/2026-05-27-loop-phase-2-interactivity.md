# Loop — Phase 2 (Interactivity → GitHub Issues + Resolve-on-Close) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Server-handled Slack buttons. Error & feedback messages get **Create Issue / + Auto-Fix** buttons; clicking one verifies the Slack signature, creates a GitHub issue in the event's project repo, then edits the Slack message in place to embed the issue link. A GitHub webhook flips the message to a ✅ "Resolved" banner when the issue closes. (To-dos / reminders = Phase 3.)

**Activation secrets (runtime env — code works without them at build time):**
- `SLACK_SIGNING_SECRET` — verify interaction requests (Elio app → Basic Information).
- `GITHUB_TOKEN` — a PAT (scope `repo`) Loop uses to create issues server-side.
- `GITHUB_WEBHOOK_SECRET` — shared secret for the GitHub webhook signature.

**Design — finding the event on click:** the Slack interaction payload carries `channel.id` + `message.ts`. We look the event up by `(slack_channel_id, slack_ts)` (already recorded at post time) — so buttons need no pre-generated id. The handler rebuilds the message from `payload.message.blocks`, swaps the action row for an issue link, and `chat.update`s it.

**Tech:** `lib/render/blocks.ts` + `index.ts`, `lib/ingest.ts`, `lib/auth.ts` (already exposes repo/autofix), new `lib/github.ts`, `lib/slack/verify.ts`, `lib/slack/transport.ts` (+chatUpdate), `app/api/slack/interactions/route.ts` (upgrade), new `app/api/webhooks/github/route.ts`, schema (issue columns already exist on `events`), Vitest.

---

## Task 1: Interactive (server-handled) buttons in the composer

**Files:** Modify `lib/render/blocks.ts`; test `tests/render.test.ts`

- [ ] **Step 1:** Add an interactive-button type distinct from URL buttons:
```ts
export interface InteractiveButton { text: string; actionId: string; value?: string; emoji?: string; style?: 'primary' | 'danger' }
```
Extend `RichMessageInput` with `interactiveActions?: InteractiveButton[]`. In `richMessage`, when rendering the `actions` block, include BOTH URL buttons (existing `actions`) and interactive buttons:
```ts
const urlButtons = (input.actions ?? []).map((a) => ({ type:'button', text:{type:'plain_text',text:a.emoji?`${a.emoji} ${a.text}`:a.text,emoji:true}, url:a.url, ...(a.style?{style:a.style}:{}) }));
const intButtons = (input.interactiveActions ?? []).map((b) => ({ type:'button', text:{type:'plain_text',text:b.emoji?`${b.emoji} ${b.text}`:b.text,emoji:true}, action_id:b.actionId, ...(b.value?{value:b.value}:{}), ...(b.style?{style:b.style}:{}) }));
const elements = [...intButtons, ...urlButtons];
if (elements.length) { if (input.divider) blocks.push({type:'divider'}); blocks.push({ type:'actions', elements }); }
```
(Replaces the URL-only actions block; keep ordering: interactive first, then URL.)
- [ ] **Step 2:** Test: a message with `interactiveActions:[{text:'Create Issue',actionId:'create_issue'}]` yields an `actions` element with `action_id:'create_issue'` and no `url`. `pnpm test tests/render.test.ts`; `tsc` clean. Commit: `feat(render): server-handled interactive buttons in composer`.

---

## Task 2: Issue buttons on error + feedback (gated by repo)

**Files:** Modify `lib/render/index.ts`, `lib/ingest.ts`; test `tests/render.test.ts`

- [ ] **Step 1:** Add to `RenderContext`: `githubRepo?: string | null`, `autofixEnabled?: boolean`. In `lib/ingest.ts`, pass them from the project:
```ts
const rendered = renderEvent(ev, { siteLabel: project.name, projectSlug: project.slug, githubRepo: project.githubRepo, autofixEnabled: project.autofixEnabled });
```
- [ ] **Step 2:** In `error` and `feedback` renderers, when `ctx?.githubRepo` AND `ev.actions.includes('issue')` (default-allow if actions empty for error/feedback — see note), add interactive buttons:
```ts
const issueActions: InteractiveButton[] = ctx?.githubRepo ? [
  { emoji: '🐛', text: 'Create Issue', actionId: 'create_issue', value: ev.type },
  ...(ctx.autofixEnabled || ev.actions.includes('autofix') ? [{ text: 'Create Issue + Auto-Fix', actionId: 'create_issue_autofix', value: ev.type, style: 'primary' as const }] : []),
] : [];
```
Feedback also keeps a **View Page** URL button when `payload.pageUrl`/`page` is a URL. Pass `interactiveActions: issueActions`, `divider: true`.
(Note: treat error/feedback as issue-eligible by default; other types only if `actions` explicitly includes `'issue'`.)
- [ ] **Step 3:** Tests: error with `ctx.githubRepo` set → has a `create_issue` action; without repo → none. `pnpm test`; `tsc`. Commit: `feat(render): issue buttons on error/feedback when repo configured`.

---

## Task 3: GitHub issue creation + issue body builder

**Files:** Create `lib/github.ts`; test `tests/github.test.ts`

- [ ] **Step 1:** Failing test for `buildIssue(type, payload)`: an `error` payload → `{ title, body, labels }` with title prefixed `[Error]`, labels include `bug`; a `feedback` bug → labels include `user-feedback`.
- [ ] **Step 2:** Implement `lib/github.ts`:
```ts
export interface IssueData { title: string; body: string; labels: string[] }
export function buildIssue(type: string, payload: Record<string, any>): IssueData { /* error: message/route/stack; feedback: message/steps/meta; generic fallback */ }
export async function createGitHubIssue(repo: string, data: IssueData): Promise<{ number: number; html_url: string } | null> {
  const token = process.env.GITHUB_TOKEN; if (!token) return null;
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, { method:'POST', headers:{ Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'Content-Type':'application/json' }, body: JSON.stringify({ title:data.title, body:data.body, labels:data.labels }) });
  if (!res.ok) { console.error('[loop/github]', res.status, await res.text().catch(()=> '')); return null; }
  const j = await res.json() as { number:number; html_url:string }; return { number:j.number, html_url:j.html_url };
}
```
- [ ] **Step 3:** `pnpm test tests/github.test.ts`; `tsc`. Commit: `feat(github): issue body builder + createGitHubIssue`.

---

## Task 4: Slack signature verify + chatUpdate transport

**Files:** Create `lib/slack/verify.ts`; modify `lib/slack/transport.ts`; test `tests/slack-verify.test.ts`

- [ ] **Step 1:** `lib/slack/verify.ts` — `verifySlackRequest(rawBody, timestamp, signature)` using `SLACK_SIGNING_SECRET`: reject if timestamp older than 5 min; compute `v0=` HMAC-SHA256 of `v0:{timestamp}:{rawBody}`, `timingSafeEqual` against the `X-Slack-Signature` header. Test with a known secret/body/signature triple.
- [ ] **Step 2:** Add to `lib/slack/transport.ts`:
```ts
export async function chatUpdate(channel: string, ts: string, text: string, blocks: SlackBlock[]): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN; if (!token) return false;
  const res = await fetch('https://slack.com/api/chat.update', { method:'POST', headers:{ Authorization:`Bearer ${token}`,'Content-Type':'application/json' }, body: JSON.stringify({ channel, ts, text, blocks }) });
  const d = await res.json() as { ok:boolean; error?:string }; if (!d.ok) console.error('[loop/slack] chat.update', d.error); return d.ok;
}
```
- [ ] **Step 3:** `pnpm test tests/slack-verify.test.ts`; `tsc`. Commit: `feat(slack): signing-secret verification + chat.update`.

---

## Task 5: Interactivity handler (create issue → update message)

**Files:** Modify `app/api/slack/interactions/route.ts`; modify `lib/db` usage as needed

- [ ] **Step 1:** Upgrade the route:
```ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, projects } from '@/lib/db/schema';
import { verifySlackRequest } from '@/lib/slack/verify';
import { buildIssue, createGitHubIssue } from '@/lib/github';
import { chatUpdate } from '@/lib/slack/transport';
import { section, context } from '@/lib/render/blocks';

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
  const channel = payload.channel?.id; const msgTs = payload.message?.ts;

  if (actionId === 'create_issue' || actionId === 'create_issue_autofix') {
    // Find the originating event by (channel, ts)
    const [ev] = await db.select().from(events).where(and(eq(events.slackChannelId, channel), eq(events.slackTs, msgTs))).limit(1);
    if (ev?.projectId) {
      const [proj] = await db.select().from(projects).where(eq(projects.id, ev.projectId)).limit(1);
      if (proj?.githubRepo) {
        const data = buildIssue(ev.type, ev.payload as Record<string, unknown>);
        if (actionId === 'create_issue_autofix') data.labels = [...data.labels, 'claude-code'];
        const issue = await createGitHubIssue(proj.githubRepo, data);
        if (issue) {
          await db.update(events).set({ githubIssueNumber: issue.number, githubIssueUrl: issue.html_url }).where(eq(events.id, ev.id));
          // Rebuild message: drop the actions block, append the issue link.
          const oldBlocks = (payload.message?.blocks ?? []).filter((b: any) => b.type !== 'actions');
          const newBlocks = [...oldBlocks, context(`→ <${issue.html_url}|Issue #${issue.number}> opened`)];
          await chatUpdate(channel, msgTs, payload.message?.text ?? 'issue created', newBlocks);
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}
```
- [ ] **Step 2:** `pnpm exec next build` (dummy env, direct) succeeds; `tsc` clean. Commit: `feat(api): Slack interactivity handler creates GitHub issues + updates message`.

---

## Task 6: GitHub webhook → resolve-on-close

**Files:** Create `app/api/webhooks/github/route.ts`; test the signature helper if shared

- [ ] **Step 1:** Implement: verify `X-Hub-Signature-256` (HMAC-SHA256 of raw body with `GITHUB_WEBHOOK_SECRET`); on `action === 'closed'` for an `issue` event, find the event by `githubIssueNumber`, prepend a `✅ Resolved` context/section to its stored message and `chat.update` (use `events.slackChannelId`/`events.slackTs`; rebuild minimal blocks: a resolved banner + keep it simple), set `events.resolvedAt = now()`.
```ts
// verify sig → parse → if body.action==='closed' && body.issue: lookup event by githubIssueNumber → chatUpdate banner + set resolvedAt
```
(Storing full original blocks isn't available here, so post the resolved banner as the updated message: `✅ Resolved · <issueUrl|Issue #n> closed` + a context with the site. Acceptable v1.)
- [ ] **Step 2:** `pnpm exec next build` succeeds; `tsc` clean. Commit: `feat(api): GitHub webhook resolves Slack message on issue close`.

---

## Task 7: Env docs + Previews

**Files:** Modify `.env.example`, `app/(console)/previews/page.tsx`

- [ ] **Step 1:** Add `SLACK_SIGNING_SECRET`, `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET` to `.env.example`.
- [ ] **Step 2:** Previews: render `interactiveActions` (action_id) buttons as enabled-looking pills labeled with their text (they're real once secrets are set); keep them visually distinct from URL buttons if easy. `tsc`; `next build`. Commit: `chore: document Phase 2 env + preview interactive buttons`.

---

## Self-Review
- Buttons resolve their event by `(channel, ts)` — no schema change, uses columns already on `events`.
- Issue creation gated on the project having a `github_repo`; Auto-Fix adds the `claude-code` label (matches the existing repo workflow convention).
- Signature verification on both inbound endpoints (Slack + GitHub); both fail-closed (401) without valid signatures.
- Code is inert until `SLACK_SIGNING_SECRET` / `GITHUB_TOKEN` / `GITHUB_WEBHOOK_SECRET` are set — safe to deploy ahead of secrets.
- To-dos / reminders deferred to Phase 3. `raw` still exempt; formatting from Phase 1.x untouched except added buttons on error/feedback.
