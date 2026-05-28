# Loop

Self-hosted Slack notification service for your apps. Send typed semantic events from any project to one HTTP endpoint; Loop owns routing, Block Kit rendering, the Slack bot, and event history — so every project's alerts look consistent and there's one place to manage them.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmattdecrevel%2Floop&env=DATABASE_URL,DATABASE_URL_UNPOOLED,SLACK_BOT_TOKEN,SLACK_SIGNING_SECRET,LOOP_ADMIN_USER,LOOP_ADMIN_PASSWORD,SESSION_SECRET&envDescription=See%20the%20README%20for%20setup%20instructions&project-name=loop&repository-name=loop)

```
your app + @mattdecrevel/loop ──POST /api/events (Bearer API key)──▶ Loop
                                                                       │ auth → route → render Block Kit
                                                                       ▼
                                                                     Slack (one bot, chat.postMessage)
```

**Client package:** [`@mattdecrevel/loop`](https://www.npmjs.com/package/@mattdecrevel/loop) on npm — the thin, fail-open SDK your apps install.

---

## How it works

- **The client is dumb & fail-open**: POSTs a typed event with your API key, ≤3s timeout, swallows all errors. Loop being down = no notification, never a broken request.
- **Loop owns everything else**: routing rules, Block Kit rendering, the bot token, the DB, interactivity.
- **One Slack app**: one bot token, one interactivity Request URL. New projects need zero Slack setup — just an API key minted in the console.

---

## Self-hosting setup

### 1. Slack app

Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps) with these scopes under **OAuth & Permissions**:

- `chat:write` — post messages
- `chat:write.public` — post to channels without joining
- `reactions:write` — add emoji reactions (optional)

Install the app to your workspace and copy the **Bot User OAuth Token** (`xoxb-…`).

Copy the **Signing Secret** from **Basic Information**.

### 2. Database

Create a [Neon](https://neon.tech) Postgres database (free tier works). Copy the pooled and unpooled connection strings.

### 3. Deploy

Click the **Deploy with Vercel** button above, or deploy manually:

```bash
git clone https://github.com/mattdecrevel/loop
cd loop
pnpm install
cp .env.example .env   # fill in the values below
pnpm db:migrate
pnpm dev               # http://localhost:4000
```

### 4. Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | Neon unpooled connection string (migrations) |
| `SLACK_BOT_TOKEN` | Bot token (`xoxb-…`) |
| `SLACK_SIGNING_SECRET` | Slack app signing secret |
| `LOOP_ADMIN_USER` | Console login username |
| `LOOP_ADMIN_PASSWORD` | Console login password |
| `SESSION_SECRET` | Random string — signs the console session cookie |
| `GITHUB_TOKEN` | GitHub PAT — needed for Create Issue buttons (Phase 2) |
| `GITHUB_WEBHOOK_SECRET` | GitHub webhook secret — needed for resolve-on-close (Phase 2) |
| `CRON_SECRET` | Vercel Cron auth secret (Phase 3) |
| `LOOP_READ_KEY` | Bearer token for the read-only stats API (Phase 3) |

### 5. Create your first project

Open the console at `/projects`, create a project, and copy the API key. Or use the CLI:

```bash
pnpm seed:project <slug> "<Site Name>" [owner/repo]
```

---

## Sending events from your app

```bash
npm install @mattdecrevel/loop
```

```ts
import { Loop } from '@mattdecrevel/loop';

const loop = new Loop({
  apiKey: process.env.LOOP_API_KEY!,
  baseUrl: 'https://your-loop-instance.vercel.app', // or leave blank to use loop.decrevel.dev
});

await loop.notify({ type: 'signup', payload: { email, name } });
await loop.error(err, { route: '/api/checkout' });
```

See [`packages/client`](./packages/client) for the full client docs.

---

## Event taxonomy

| `type` | default `category` | notes |
|---|---|---|
| `error` | `errors` | → Create Issue / + Auto-Fix buttons (when project has a GitHub repo) |
| `signup` | `users` | |
| `subscription` | `revenue` | `kind`: new / upgrade / downgrade / cancel / expired / payment_failed / refund / addon |
| `feedback` | `feedback` | bug / question / feature / general; breadcrumb, steps, browser/viewport meta |
| `cron` | `ops` | run summaries with optional monospace table |
| `infra` | `ops` | infrastructure alerts |
| `booking` | `bookings` | action card with Email / Add-to-Calendar / Reschedule buttons |
| `contact` | `bookings` | contact form submissions |
| `seo_report` | `seo` | search metrics digest |
| `generic` | (required) | escape hatch: title / body / fields / subSections / table |
| `raw` | (required) | pre-built Block Kit passthrough |

**Categories:** `users` · `revenue` · `feedback` · `errors` · `seo` · `ops` · `bookings`

Every event supports optional base fields: `severity`, `category` (routing override), `links: {label,url}[]` (URL buttons), `footerNote`, `digest`, `idempotencyKey`.

---

## Routing

Each event resolves to exactly one destination (most-specific match wins):

1. `(project, category)` → 2. `(project, *)` → 3. `(*, category)` → 4. global fallback

A route target is a **Slack channel ID** or an **external webhook URL**. Manage routes in the console at `/routes`.

---

## Operator console

The web UI is behind a single login (`LOOP_ADMIN_USER` / `LOOP_ADMIN_PASSWORD`). Pages: **Projects** · **Channels** · **Routes** · **Events** · **Previews** (render + send live).

---

## Interactivity (Phase 2)

`error` and `feedback` events get **Create Issue / + Auto-Fix** buttons when the project has a `github_repo`. Clicking opens a GitHub issue in that project's repo, edits the Slack message to link it, and a GitHub webhook auto-resolves the banner when the issue closes.

Setup per-project: set Interactivity Request URL on your Slack app (`https://your-loop/api/slack/interactions`) and add a GitHub webhook (Issues event) pointing at `https://your-loop/api/webhooks/github` with `GITHUB_WEBHOOK_SECRET`.

---

## Publishing the client

`packages/client` publishes to npm via `.github/workflows/publish-client.yml` on a `client-v*` tag or manual dispatch. Requires an `NPM_TOKEN` secret (Automation token from npmjs.com).

```bash
# bump version in packages/client/package.json, then:
git tag client-v0.3.0 && git push origin client-v0.3.0
```

---

## Commands

| | |
|---|---|
| `pnpm dev` | dev server (port 4000) |
| `pnpm build` | migrate + build |
| `pnpm test` | Vitest |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations |
| `pnpm seed:project <slug> "<name>" [owner/repo]` | mint a project + API key |

---

## License

[MIT](./LICENSE)
