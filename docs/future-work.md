# Loop — Future Work

Ideas captured for beyond the shipped Phases 1–3 + dashboard panel. Each item
is a real project in its own right; pick when there's appetite.

## Forward growth

### 1. More sites onto Loop
Wire additional consumer projects to send through Loop — `homelab`, `sizecharts`,
`byodb`, `scoreboards`, `picks`, anything else in the stack. Each is a
**3-step add**:

1. Seed a project + API key (`pnpm seed:project <slug> "<Site>" [owner/repo]`)
2. Set `LOOP_API_KEY` + `LOOP_BASE_URL` on the site's Vercel project
3. Drop in a thin local `notifyLoop` helper (or import the published client directly)
4. Grant the consuming repo **Read** on the `@mattdecrevel/loop` GH Package
   (Package settings → *Manage Actions access*) so CI + Vercel can install it

### 2. Alerting rules
"If N errors in M minutes → escalate" — paged-style logic on top of the events
table. Likely shape:

- A new `alert_rules` table (project / category / severity threshold / window / action)
- A cron that evaluates rules against the events table on a schedule
- An `escalations` table tracking fired alerts so they don't double-fire
- An action surface: post-to-different-channel, DM-a-user, hit-a-webhook

### 3. Loop status / uptime page
Public health endpoint + a tiny status site. Probably:

- `/api/status` (uncached, no auth) — uptime, queue depth, recent ingest rate
- A small Next.js frontend on `status.loop.decrevel.dev` reading from the read API
- Optionally integrate with a third-party uptime monitor

### 4. Slack DMs / on-call rotation
Route certain alerts to a user DM instead of a channel — useful for
`severity: 'error'` in specific categories or for the on-call engineer.

- An `on_call_schedule` table (user / start / end / categories)
- The router checks for an active on-call before falling back to channel routing
- Bot needs `im:write` scope and the user ID(s)

### 5. Webhook ingest
Let services that can't run a Node client POST raw payloads to a dedicated
ingest endpoint (Linear, GitHub Actions, raw cURL, Zapier, etc.). Loop wraps
them as `generic` or `raw` events.

- `/api/ingest/<source>` endpoints, auth via per-source webhook tokens
- A `webhook_sources` table mapping a token → project + default category
- Optional payload transformers (e.g. Linear comment → `feedback` event)

## Smaller polish (lower priority)
- **Bump consumer deps to `@mattdecrevel/loop@^0.3.0`** opportunistically to use the typed helpers (`loop.signup()`, `loop.subscription()`, …) at call sites.
- **Idempotency dedup window** narrower than DB-level — in-memory LRU for very high-frequency events to skip the DB roundtrip.
- **`/api/read` health + version** — small endpoint that confirms Loop service version + DB connectivity, for the status page and external monitors.
- **Read API pagination + filters** — `?category=`, `?severity=`, `?since=`, `?limit=` for richer external consumers.
- **Sentry integration** for Loop's own runtime errors (the loop service itself, separate from consumer apps).

## Captured for context
- Loop repo workflow stays `main`-direct (single-owner; auto-deploys). Revisit if a second contributor joins.
- Phase 3 backlog leftovers — **all done as of 2026-05-28**: digest cron, to-do/remind buttons, idempotency enforcement, agent-seo reroute, dashboard panel.
