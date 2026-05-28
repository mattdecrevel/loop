# Loop — Phase 3 (To-Dos, Reminders, Digest) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Complete the interactive + scheduled feature set: **Add to To-Do** and **Remind me** buttons (server-handled), a **reminder cron** that re-surfaces messages when due, and the **rolling digest cron** (re-enabling suppression now that there's a cron to post the summary).

**Builds on:** Phase 2 patterns — `app/api/slack/interactions/route.ts` (signature-verified action handling, find event by `(slackChannelId, slackTs)`, `chatUpdate`), `app/api/webhooks/github/route.ts` (HMAC-verified cron/webhook). Reuse them.

**Tech:** Drizzle (`lib/db/schema.ts`), the interactivity route, two new cron routes, `vercel.json`, Vitest. New env: `CRON_SECRET`.

---

## Task 1: Schema — todos, reminders, digest tracking

**Files:** `lib/db/schema.ts`, generate migration

- [ ] **Step 1:** Add to `lib/db/schema.ts`:
```ts
export const todoStatus = pgEnum('todo_status', ['open', 'done']);
export const reminderStatus = pgEnum('reminder_status', ['pending', 'sent', 'cancelled']);

export const todos = pgTable('todos', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  status: todoStatus('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const reminders = pgTable('reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  channelId: text('channel_id').notNull(),
  messageTs: text('message_ts'),
  remindAt: timestamp('remind_at', { withTimezone: true }).notNull(),
  status: reminderStatus('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});
```
- [ ] **Step 2:** Add `digestPostedAt: timestamp('digest_posted_at', { withTimezone: true })` to the `events` table (lets the digest cron mark which digested events it has already summarized).
- [ ] **Step 3:** `pnpm db:generate`, then apply with `DATABASE_URL_UNPOOLED=<loop unpooled> pnpm db:migrate`. Commit: `feat(db): todos + reminders tables + events.digest_posted_at`.

---

## Task 2: To-Do + Remind buttons on error/feedback

**Files:** `lib/render/index.ts`; `tests/render.test.ts`

- [ ] **Step 1:** Add a helper next to `issueButtons`:
```ts
function actionButtonsFor(ev: ParsedEvent): InteractiveButton[] {
  const out: InteractiveButton[] = [];
  if (ev.actions.includes('todo')) out.push({ emoji: '✅', text: 'Add to To-Do', actionId: 'add_todo' });
  if (ev.actions.includes('remind')) {
    out.push({ text: 'Remind 1h', actionId: 'remind_1h' });
    out.push({ text: 'Remind tomorrow', actionId: 'remind_24h' });
  }
  return out;
}
```
- [ ] **Step 2:** In the `error` and `feedback` cases, append `actionButtonsFor(ev)` to the existing `issueButtons(ev, ctx)` for `interactiveActions`. (Opt-in: only render when the caller includes `'todo'`/`'remind'` in `actions`, so default messages stay uncluttered.)
- [ ] **Step 3:** Test: an error with `actions: ['todo','remind']` yields `add_todo`, `remind_1h`, `remind_24h` action_ids. `pnpm test`; `tsc`. Commit: `feat(render): to-do + remind buttons (opt-in via actions)`.

---

## Task 3: Interactivity handler — add_todo / remind_*

**Files:** `app/api/slack/interactions/route.ts`; `lib/slack/transport.ts` (already has `chatUpdate`, `postToChannel`)

- [ ] **Step 1:** In the interactions handler (after the existing `create_issue*` branch), add handling for `add_todo` / `remind_1h` / `remind_24h`. All resolve the event by `(channel, msgTs)` like issues do.
```ts
if (actionId === 'add_todo') {
  const ev = await findEvent(channel, msgTs);   // existing lookup
  if (ev) {
    const txt = summarize(ev);                  // event title/message → todo text
    await db.insert(todos).values({ eventId: ev.id, projectId: ev.projectId, text: txt });
    const blocks = appendContext(payload.message?.blocks, '✅ Added to to-do');
    await chatUpdate(channel, msgTs, payload.message?.text ?? 'to-do added', blocks);
  }
}
if (actionId === 'remind_1h' || actionId === 'remind_24h') {
  const ev = await findEvent(channel, msgTs);
  if (ev) {
    const ms = actionId === 'remind_1h' ? 3600_000 : 86_400_000;
    const remindAt = new Date(Date.now() + ms);
    await db.insert(reminders).values({ eventId: ev.id, projectId: ev.projectId, text: summarize(ev), channelId: channel, messageTs: msgTs, remindAt });
    const label = actionId === 'remind_1h' ? 'in 1 hour' : 'tomorrow';
    const blocks = appendContext(payload.message?.blocks, `⏰ Reminder set for ${label}`);
    await chatUpdate(channel, msgTs, payload.message?.text ?? 'reminder set', blocks);
  }
}
```
- [ ] **Step 2:** Factor out the existing event-by-(channel,ts) lookup into a `findEvent` helper if not already; add a small `appendContext(blocks, text)` that returns the message blocks with a trailing `context` block (drop the actions block so buttons aren't re-clicked). `summarize(ev)` = the event's title/message (reuse the renderer's text or payload.message/title).
- [ ] **Step 3:** `pnpm exec next build` (dummy env) compiles; `tsc` clean. Commit: `feat(api): handle add_todo + remind actions`.

---

## Task 4: Reminder cron

**Files:** Create `app/api/cron/reminders/route.ts`; `vercel.json`

- [ ] **Step 1:** `app/api/cron/reminders/route.ts` (Node runtime). Auth: `Authorization: Bearer ${process.env.CRON_SECRET}` (Vercel injects on prod). Query `reminders` where `status='pending'` and `remindAt <= now()`; for each, `postToChannel` a reminder (`⏰ Reminder: ${text}`) — as a thread reply to `messageTs` when present (add a `thread_ts` option to `postToChannel`, or post plain) — then set `status='sent', sentAt=now()`. Return a JSON summary.
- [ ] **Step 2:** `vercel.json` — add crons:
```json
{ "crons": [ { "path": "/api/cron/reminders", "schedule": "*/5 * * * *" } ] }
```
(keep `buildCommand`/`framework`).
- [ ] **Step 3:** `next build` compiles; commit: `feat(cron): reminder re-surfacing cron (every 5m)`.

---

## Task 5: Digest cron + re-enable suppression

**Files:** `lib/ingest.ts`, create `app/api/cron/digest/route.ts`, `vercel.json`

- [ ] **Step 1:** In `lib/ingest.ts`, RE-ENABLE digest suppression (now that a cron will post the summary): for `ev.digest && ev.severity === 'info'`, insert with `status: 'digested'` and `return { status: 'digested' }` (restore the branch removed by the footgun fix, but keep recording `digest`).
- [ ] **Step 2:** `app/api/cron/digest/route.ts` (CRON_SECRET auth). Query `events` where `status='digested'` and `digestPostedAt IS NULL` in the last window (e.g. 6h); group by `category` (and project), build one compact summary message per category route, `postToChannel`, then set `digestPostedAt=now()` on the included rows. (Mirror POYSE's `runSlackDigest`.)
- [ ] **Step 3:** `vercel.json` — add `{ "path": "/api/cron/digest", "schedule": "0 */6 * * *" }` to crons.
- [ ] **Step 4:** `pnpm test` (add an ingest test that digest:true+info → status 'digested'); `next build` compiles. Commit: `feat(cron): rolling digest + re-enable digest suppression`.

---

## Self-Review
- todos/reminders reference the originating event (nullable on delete); reminders carry channel+ts to re-surface.
- Buttons are opt-in via `actions` so default messages stay clean; handler resolves the event by (channel, ts) exactly like the Phase 2 issue flow.
- Digest suppression is only re-enabled together with the cron that posts the summary (no silent drop).
- Crons are `CRON_SECRET`-authed (orchestrator sets the env + Vercel injects the bearer on prod).
- Console surfacing of todos/reminders + the read API are a separate follow-up (Phase 3c).
