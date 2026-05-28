# Loop

Centralized Slack notification & alerts service for all decrevel projects. Sites send **typed semantic events** to one HTTP endpoint; Loop owns routing, Block Kit rendering, the Slack bot, interactivity, and the database — so every project's alerts look identical and there's one place to iterate.

- **Live:** https://loop.decrevel.dev (operator console + API), Vercel team `nineteen87`, own Neon Postgres DB
- **Client:** [`@mattdecrevel/loop`](https://www.npmjs.com/package/@mattdecrevel/loop) on public npm — the thin, fail-open SDK sites install

---

## How it works

```
your site + @mattdecrevel/loop ──POST /api/events (Bearer API key)──▶ LOOP
                                                                        │ auth(project) → route(category) → render(Block Kit)
                                                                        │ → post via ONE Slack bot (chat.postMessage)
                                                                        ▼
   /api/slack/interactions ◀── button clicks (signature-verified)   Slack
   /api/webhooks/github    ◀── issue closed → ✅ resolve banner
```

- **The client is dumb & fail-open**: it POSTs a typed event with the project's API key, ≤3s timeout, swallows all errors, never throws into the caller. Loop being down = "no notification," never a broken request.
- **Loop owns everything else**: routing, rendering, the bot token, the DB, interactivity, issue creation.
- **One Slack app** (the bot is named **Elio**): one bot token, one interactivity Request URL, one event subscription. New projects need zero Slack setup — just an API key.

---

## Event taxonomy

Two orthogonal concepts: **`type`** = how it renders, **`category`** = where it routes.

| `type` | default `category` | notes |
|---|---|---|
| `error` | `errors` | → Create Issue / + Auto-Fix buttons (when the project has a repo) |
| `seo_report` | `seo` | search/metrics digest |
| `signup` | `users` | |
| `subscription` | `revenue` | `kind`: new / upgrade / downgrade / cancel / expired / payment_failed / refund / addon; `endsAt`, `source`, `variant`, `subscriptionId` |
| `feedback` | `feedback` | bug/question/feature/general; breadcrumb, steps, browser/viewport meta |
| `cron` | `ops` | run summaries; supports a monospace `table` |
| `infra` | `ops` | homelab/infra alerts |
| `booking` | `bookings` | action card with Email / Add-to-Calendar / Reschedule URL buttons |
| `contact` | `bookings` | contact form |
| `generic` | (required) | escape hatch: title/body/fields/subSections/table |
| `raw` | (required) | pre-built Block Kit passthrough |

**Categories:** `users` · `revenue` · `feedback` · `errors` · `seo` · `ops` · `bookings`.

Every event also supports (on `LoopEventBase`): `severity`, `digest`, `idempotencyKey`, **`links: {label,url}[]`** (rendered as URL buttons on any event), and **`footerNote`** (a context line, e.g. an AI-budget figure). House style: emoji + bold title, body, muted metadata context line, and a **source-site footer** (no timestamp — Slack shows that).

---

## Sending events (consumer setup)

Sites install the published client from public npm — no auth, no `.npmrc`:

1. `npm install @mattdecrevel/loop` (or `pnpm add` / `yarn add` / `bun add`).
2. `transpilePackages: ['@mattdecrevel/loop']` in `next.config` (it ships raw TS).
3. Set `LOOP_API_KEY` (the project's key) in the site's env.

```ts
import { Loop } from '@mattdecrevel/loop';
import type { LoopEvent } from '@mattdecrevel/loop/types';

const loop = new Loop({ apiKey: process.env.LOOP_API_KEY!, baseUrl: process.env.LOOP_BASE_URL });
await loop.notify({ type: 'signup', payload: { email, name } });
```

Mint a project + API key with the operator console (`/projects`) or `pnpm seed:project <slug> "<Site Name>" [owner/repo]`.

---

## Routing & overrides

Each event resolves to **exactly one** destination (an override replaces, never duplicates), most-specific match wins:

1. `(project, category)` → 2. `(project, *)` → 3. `(*, category)` → 4. global fallback

A route's target is a **Slack channel ID** or an **external webhook URL**. Manage routes in the console (`/routes`) — the "send portfolio errors to #portfolio" override lives there.

---

## Operator console

The entire web UI (behind one login) is the operator console — no public surface. Auth is env-var based: `LOOP_ADMIN_USER` + `LOOP_ADMIN_PASSWORD` → an HMAC-signed session cookie (`SESSION_SECRET`); `proxy.ts` gates everything except `/api/*` and `/login`.

Pages: **Projects** (mint keys) · **Channels** (name → Slack channel ID) · **Routes** (override UI) · **Events** (history) · **Previews** (render every message type + "Send live").

---

## Interactivity (Phase 2)

`error` and `feedback` events get **Create Issue / + Auto-Fix** buttons when the project has a `github_repo`. Clicking (signature-verified at `/api/slack/interactions`) opens an issue **in that project's own repo**, edits the Slack message to link it, and a GitHub webhook (`/api/webhooks/github`) flips the message to a ✅ Resolved banner when the issue closes. "+ Auto-Fix" adds the `claude-code` label. Per-repo: set Interactivity Request URL on the Slack app + add a GitHub webhook (event: Issues) with `GITHUB_WEBHOOK_SECRET`.

---

## Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Neon (runtime / migrations) |
| `SLACK_BOT_TOKEN` | `chat.postMessage` / `chat.update` |
| `SLACK_SIGNING_SECRET` | verify interactivity requests (Phase 2) |
| `LOOP_ADMIN_USER` / `LOOP_ADMIN_PASSWORD` | console login |
| `SESSION_SECRET` | signs the console session cookie |
| `GITHUB_TOKEN` | server-side issue creation (Phase 2) |
| `GITHUB_WEBHOOK_SECRET` | verify the GitHub resolve-on-close webhook |

---

## Releasing the client

`packages/client` publishes to **public npm** via `.github/workflows/publish-client.yml`. One click does the whole sequence — bump → commit → tag → npm publish (with provenance) → GitHub Release with auto-generated notes.

**Fire a release:**

```bash
gh workflow run publish-client.yml -f bump=patch   # or minor / major
```

…or via the GitHub Actions UI: **Actions → "Release client 🚀" → Run workflow → pick the bump**.

Requires the `NPM_TOKEN` repo secret (npm Automation token with publish access to the `@mattdecrevel` scope). Public repo + `id-token: write` give us `--provenance` for free.

A `client-v*` tag push still works as a fallback (publishes + releases, skips the bump+commit step) for re-releasing without a version bump. See [releases](https://github.com/mattdecrevel/loop/releases).

---

## Consumers

- **decrevel.dev** (`mattdecrevel/mattdecrevel.com`) — live; contact/booking/resume/job-cron events.
- **prflio.com** (`mattdecrevel/profiles`) — signups, subscription lifecycle, payments, team/referral, webhook errors, cron.

---

## Status & roadmap

**Built:** ingest + API-key auth · routing engine w/ overrides · all event renderers (rich-hybrid house style) · bot transport · operator console · Phase 2 interactivity (GitHub issues + resolve-on-close) · published client (`0.2.0`).

**Deferred (Phase 3):**
- **To-Do / Remind buttons** — the `todos` / `reminders` tables, action handlers, and crons are not built yet (the `'todo'`/`'remind'` actions are accepted in the wire contract but not rendered or handled).
- **Digest** — events accept `digest: true` and are recorded as `digested` (suppressed from immediate posting), **but the aggregation cron that posts the rolling summary is not built yet** — so don't set `digest: true` in production until it lands, or those events won't surface.
- **Read API** — a Bearer-authed endpoint for the decrevel.dev dashboard to pull Loop stats.
- **Idempotency** — `idempotencyKey` is recorded but not yet enforced (no dedup), so retries can double-post.
- **agent-seo SEO digest** still posts via its own adapter Slack webhook (not through Loop) — candidate to reroute to a `seo_report` event.

---

## Commands

| | |
|---|---|
| `pnpm dev` | dev server (port 4000) |
| `pnpm build` | migrate + build |
| `pnpm test` | Vitest |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations |
| `pnpm seed:project <slug> "<name>" [owner/repo]` | mint a project + API key |
