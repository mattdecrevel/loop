# Loop — Centralized Notification Service

**Status:** Design approved (pending final spec review)
**Date:** 2026-05-27
**Author:** Matt Decrevel (with Claude)
**Repo:** `github.com/mattdecrevel/loop` (private, to be created)
**Client package:** `@mattdecrevel/loop`
**Deploy:** standalone Vercel project at `loop.decrevel.dev`, own Neon DB

> This is the umbrella architecture spec covering all phases. Each phase gets its
> own implementation plan. Phase 1 is the next implementation target.

---

## 1. Problem & Goal

Slack is Matt's standard alerts/notifications system across **3–5 projects today and
every future one**. The same message-building and posting logic is currently
duplicated and **already diverging** across repos:

- `mattdecrevel.com` — `lib/api/notifications/slack.ts` (webhooks, 2 channels, no interactivity)
- `poyse` — `lib/notifications/slack.ts` (the most mature: bot token, auto-issue, resolve-on-close, 6h digest, 5 channels, GitHub webhook)
- `@mattdecrevel/agent-seo` — `engine/slack.ts` + its own `SlackPayload`/`SlackBlock` types (third copy, drifting)

**Goal:** a single service that ingests typed notification events from any site and
renders + routes + posts them to Slack identically, with one Slack bot, one place to
iterate, granular per-project routing overrides, and interactive actions (GitHub
issues, to-dos, reminders).

### Non-goals (v1)

- Not distributed/sold (private, single-owner) — so it ships its own DB schema without
  the consumer-coupling concerns that drove agent-seo's stateless adapter design.
- Not multi-tenant beyond Matt's own projects.
- No queue/event-streaming layer in v1 (direct POST; Slack API is fast). Revisit if volume warrants.

---

## 2. Shape Decision (why a service, not a library)

Considered: per-site library vs centralized service. **Chose centralized service** because
at 3–5+ consumers, the library forces N Slack apps, N interactivity receivers, N bot
tokens, and N migration sets. The service inverts that cost: **one** Slack app, **one**
bot, **one** DB; onboarding a new project drops to "install the client, set an API key."
The single thing the service buys that a library can't is the single-Slack-app model,
and that is exactly what unlocks "fully leverage Slack integrations."

The "package" the user originally asked for still exists — it is the thin client SDK.

---

## 3. Topology

```
sites (decrevel.dev, poyse, agent-seo, future…) + @mattdecrevel/loop client
   │  POST /api/events  (Bearer API key + semantic event)  — fire-and-forget, fail-open
   ▼
LOOP  (Next.js on Vercel · own Neon DB · one Slack app)
   ingest → auth(project) → route(category) → render(Block Kit) → post(bot token) → record(event)
   ◀── /api/slack/interactions   (button clicks, signature-verified)
   ◀── /api/webhooks/github      (issue closed → resolve banner)
   ── digest cron (6h) ─▶ Slack
   ── reminder cron ────▶ Slack
   read API (Bearer) ──▶ decrevel.dev dashboard
   ▼
ONE Slack app (bot token)        GitHub / Linear (issues)
```

### Core principles

1. **The client is dumb.** It POSTs a typed event with the project API key, **fail-open**
   (≤3s timeout, swallow errors, never break the caller). Loop down = "no notification," never a broken request.
2. **Loop owns everything else** — routing, rendering, bot token, DB, interactivity, issue creation, digest, reminders.
3. **Bot token, not webhooks.** `chat.postMessage` posts to any channel by ID. Per-channel incoming webhooks are eliminated; routing becomes data.
4. **One Slack app** — one interactivity Request URL, one event subscription, one token to rotate. New projects need zero Slack setup.

---

## 4. Wire Contract

`POST /api/events`

```jsonc
{
  "type": "subscription",          // selects the renderer + Zod payload schema
  "category": "revenue",            // optional; defaults from type (see §5)
  "severity": "info",               // info | warning | error
  "payload": { /* type-specific, Zod-validated */ },
  "actions": ["issue", "todo", "remind"],  // optional; which buttons to attach
  "digest": false,                  // optional; fold routine successes into the 6h digest
  "idempotencyKey": "..."           // optional; dedups client retries
}
```

- **Identity** (project, GitHub repo, auto-fix enablement) comes from the **API key**, never the body.
- **`type`** = how it looks (renderer). **`category`** = where it goes (routing bucket). Orthogonal.
- Response is fast/non-blocking; the client does not depend on it.

### Contract model: semantic-first + generic fallback

- Known `type`s are rendered server-side for total consistency.
- `generic` type (`{title, body, fields?, context?, actions?}`) covers one-offs without a service change.
- `raw` type (pre-built blocks + text) is a rare escape hatch.

---

## 5. Event Taxonomy (v1)

| `type` | default `category` | notes |
|---|---|---|
| `error` | `errors` | → issue/todo/remind actions |
| `seo_report` | `seo` | from agent-seo |
| `signup` | `users` | |
| `subscription` | `revenue` | revenue tracker; new / upgrade / cancel / payment-failed / refund / add-on |
| `feedback` | `feedback` | its own channel; → issue/todo actions |
| `cron` | `ops` | run summaries; digest-eligible |
| `infra` | `ops` | homelab: low storage, service down |
| `booking` | `bookings` | calendar bookings |
| `contact` | `bookings` | contact form |
| `generic` | (required in body) | escape hatch |
| `raw` | (required in body) | passthrough |

**Categories:** `users` · `revenue` · `feedback` · `errors` · `seo` · `ops` · `bookings`.

Each `type` has a Zod payload schema + a Block Kit renderer. Renderers follow POYSE's
**mobile-friendly** philosophy: a single `section` mrkdwn block plus an optional
`actions` block — no `header`/`fields`/`divider` chrome that stacks badly on phones.

---

## 6. Routing & Overrides

Routing resolves to **exactly one** destination per event — an override **replaces**,
it never **duplicates** (explicit guarantee).

**Precedence (most-specific match wins):**

1. `(project, category)` — e.g. `(portfolio, errors) → #portfolio-errors`
2. `(project, *)` — project-wide; "move all portfolio notifications to #portfolio"
3. `(*, category)` — global default; "all user-related → #users"
4. global fallback channel

A route's **target** is *either*:
- a **Slack channel ID** (bot posts there — the clean, native path), or
- an **external webhook URL** (Loop POSTs the rendered payload there instead — covers
  "provide a webhook to intercept and redirect," e.g. to a different workspace).

Exactly one matched target fires → **one post, no duplicate.**

---

## 7. Auth

- Each project gets an API key `loop_pk_…`, stored **hashed** in `projects`.
- Client sends `Authorization: Bearer <key>`.
- Key → project identity → drives routing overrides, attribution (per-project
  notification volume), GitHub repo for issues, and auto-fix enablement.
- Admin dashboard mints/rotates keys.

---

## 8. Data Model (Loop's own Neon DB, Drizzle)

- **`projects`** — id, slug, name, `api_key_hash`, `github_repo`, `linear_team` (null), `autofix_enabled`, created_at
- **`channels`** — logical registry: id, `slack_channel_id`, name (e.g. "users")
- **`routes`** — `project_id` (null = global), `category` (null = all), `target_channel_id` (null), `target_webhook_url` (null), priority/specificity
- **`events`** — ingest log: id, project_id, type, category, severity, payload (jsonb), `slack_ts`, `slack_channel_id`, `github_issue_number`, `github_issue_url`, status, `resolved_at`, digest flags, idempotency_key, created_at
- **`todos`** — id, event_id, project_id, text, status, created_at, completed_at
- **`reminders`** — id, event_id, `remind_at`, channel_id, status, created_at

(`events` carries the posted-message `ts` + issue link directly, rather than a separate
`messages` table, since one event = one message here.)

---

## 9. The Slack Bot — Interactive Actions

One Slack app: bot token (`chat.postMessage` / `chat.update`), signature-verified
**Interactivity Request URL** (`/api/slack/interactions`), seams for slash commands /
Events API later.

All buttons handled **server-side by Loop** (this is the genuinely new part — POYSE used
prefilled-URL buttons; Loop creates resources server-side and edits the message in place):

| Button | Loop action |
|---|---|
| **Create Issue** / **+ Auto-Fix** | Calls GitHub API for the project's repo, creates the issue, `chat.update`s the message to embed the issue link, records issue# ↔ `ts`. Auto-Fix adds the `claude-code` label. |
| **Add to To-Do** | Inserts a `todos` row; `chat.update`s a ✓ line. Surfaced in dashboard. (Linear / GitHub Projects = export seam.) |
| **Remind me** (1h / tomorrow) | Inserts a `reminders` row; the reminder cron re-surfaces the message at `remind_at`. |

### Auto-Fix contract (documented)

"+ Auto-Fix" creates a GitHub issue with the `claude-code` label. The fix runs in the
**target repo's** `.github/workflows/claude-code.yml`, which consumes **that repo's**
`ANTHROPIC_API_KEY` Actions secret. **Anthropic keys live per-repo, not in Loop** — this
gives per-project Anthropic cost attribution for free in the Anthropic console. Loop
stores only `github_repo` + `autofix_enabled` per project.

### Resolve-on-close

GitHub webhook → `/api/webhooks/github` → on `issues.closed`, find the event by issue#,
`chat.update` to prepend a ✅ "Resolved by @x" banner. (Direct extraction from POYSE.)

---

## 10. Digest

Events with `digest: true` + `severity: info` are suppressed from immediate posting,
persisted, and a 6h cron folds them into one summary per category/project. Warnings and
errors always post immediately. (Extraction from POYSE's `runSlackDigest`.)

---

## 11. Dashboard & Read API (`loop.decrevel.dev`)

- **Admin dashboard:** manage projects/keys, channel registry, routing overrides (the
  override UI), event history/search, todos, reminders, digest config.
- **Read API (Bearer-authed):** `GET /api/events`, stats endpoints — so the **decrevel.dev
  dashboard pulls Loop data** without coupling Loop's DB into the main site's DB.

---

## 12. Tech Stack

Next.js 16 (App Router) · Vercel · Neon Postgres · Drizzle ORM · TypeScript strict · shadcn/ui
for the dashboard. Mirrors Matt's standard stack so patterns transfer directly.

---

## 13. Client SDK — `@mattdecrevel/loop`

Tiny, dependency-free, fail-open:

```ts
import { Loop } from '@mattdecrevel/loop';
const loop = new Loop({ apiKey: process.env.LOOP_API_KEY!, baseUrl: 'https://loop.decrevel.dev' });

await loop.notify({ type: 'signup', payload: { email, name } });
await loop.error(err, { route: '/api/contact' });          // sugar for type:'error'
await loop.notify({ type: 'generic', category: 'ops', payload: { title, body } });
```

- ≤3s timeout, swallows all errors (logs to stderr), never throws into the caller.
- Optional `idempotencyKey` passthrough.
- Published to GitHub Packages (same registry/auth model as agent-seo) — private.

---

## 14. Phasing

Each phase = its own implementation plan.

### Phase 1 — Spine
Repo + Vercel deploy + Neon DB + `projects`/`channels`/`routes`/`events` schema +
API-key auth + ingest endpoint + routing engine (overrides, no-dup resolution) +
bot-token transport + renderers for all v1 types + `@mattdecrevel/loop` client (fail-open).
**First consumer: `mattdecrevel.com`** — replace `lib/api/notifications/slack.ts`.

### Phase 2 — Bot interactivity & issues
Interactivity receiver (signature verify) + GitHub issue actions + issue↔event mapping +
resolve-on-close GitHub webhook. **Migrate POYSE.**

### Phase 3 — To-dos, reminders, digest, dashboard, read API
`todos` + `reminders` actions and their crons + rolling digest + admin dashboard +
read API for decrevel.dev. **Migrate agent-seo's SEO digest.** Linear seam.

---

## 15. What's Autonomous vs Manual (operational)

**Autonomous (background):** create private repo + scaffold Phase 1; provision Neon +
migrate; create/link Vercel project + git auto-deploy + non-secret env; client SDK +
docs + Slack app manifest; first-consumer branch on `mattdecrevel.com`.

**Requires Matt (one batched checklist):**
1. Create + install the Slack app (manifest provided) → paste back **bot token** + **signing secret**.
2. Invite the bot to target channels; provide channel names/IDs (or set later in dashboard).
3. A dedicated GitHub PAT for Loop (Phase 2 — server-side issue creation).

**First integration targets:** (1) `mattdecrevel.com` / decrevel.dev, (2) Profolio (confirm repo). Rest follow.

---

## 16. Open Items

- Confirm the second integration target repo name ("Profolio" / `profiles`?).
- Channel naming map (`users`, `revenue`, `feedback`, `errors`, `seo`, `ops`, `bookings`) → actual Slack channels.
- Whether the dashboard reads Loop's DB directly (shared read-only string) or only via the read API (default: read API).
