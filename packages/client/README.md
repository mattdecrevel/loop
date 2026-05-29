# @mattdecrevel/loop

Thin, fail-open client for the [Loop](https://loop.decrevel.dev) notification service.

Loop ingests typed notification events over an authenticated HTTP endpoint and
routes them to Slack. This client is a zero-runtime-dependency wrapper around the
`POST /api/events` endpoint. It **never throws** — if Loop is down or the request
times out, your application code keeps running.

## Install

```bash
npm install @mattdecrevel/loop
# or pnpm add / yarn add / bun add
```

> **Next.js consumers:** this package ships raw TypeScript (no build step). Add it
> to `transpilePackages` in your `next.config.ts` so Next compiles it:
>
> ```ts
> const nextConfig = { transpilePackages: ['@mattdecrevel/loop'] };
> ```

## Setup (bring your own endpoint)

`baseUrl` is **required** — Loop is self-hosted, so you point the client at your
own deployment. The recommended pattern is a single shared `loopClient` module
you import everywhere:

```ts
// lib/loop.ts
import { Loop } from '@mattdecrevel/loop';

export const loopClient = new Loop({
  apiKey: process.env.LOOP_API_KEY ?? '',
  baseUrl: 'https://loop.decrevel.dev', // your Loop deployment — required
});
```

`apiKey` is fail-open: if it's empty the client silently no-ops, so a not-yet-
configured environment never throws. `baseUrl` has no default — you must supply it.

## Usage

```ts
import { loopClient as loop } from '@/lib/loop';

// Fire-and-forget — never throws.
await loop.notify({
  type: 'contact',
  payload: { name: 'Ada', email: 'ada@example.com', message: 'Hello!' },
});

// Error sugar.
try {
  doRisky();
} catch (err) {
  await loop.error(err, { route: '/api/checkout', source: 'web' });
}
```

### Typed helpers (recommended)

Per-type sugar over `notify()` — less boilerplate, harder to misuse. Each helper
takes the typed payload + optional `LoopExtras` (`severity`, `links`, `footerNote`,
`digest`, `idempotencyKey`, `actions`, override `category`).

```ts
await loop.signup({ email: 'ada@example.com', name: 'Ada' });
await loop.signup({ email, name, kind: 'waitlist' });               // waitlist join (renders distinctly)
await loop.subscription({ email, kind: 'new', plan: 'Pro', amount: 29, interval: 'mo', source: 'lemon' });
await loop.subscription({ email, kind: 'addon_cancel', plan: 'Extra seats' });
await loop.feedback({ category: 'bug', message: 'Toggle broken', userEmail, page, consoleErrors });
await loop.cron({ name: 'nightly-sync', ok: true, summary: '42 records' });
await loop.booking({ name, email, start, startIso, location });
await loop.contact({ name, email, message, source: 'form' });
await loop.error(err, { route: '/api/checkout', links: [{ label: 'View in Sentry', url: sentryUrl }] });

// A "free signup" is just a signup routed to the revenue channel — no special kind:
await loop.signup({ email, name }, { category: 'revenue' });

// `generic` and `raw` require an explicit routing category:
await loop.generic({ title: 'Deploy', body: 'shipped' }, 'ops');
```

Use `notify(event)` directly when you want full control over the envelope.

### Options

| Option      | Default                       | Description                          |
| ----------- | ----------------------------- | ------------------------------------ |
| `apiKey`    | (required)                    | Loop project API key (`loop_pk_…`).  |
| `baseUrl`   | (required)                    | Your Loop deployment's base URL.     |
| `timeoutMs` | `3000`                        | Abort the request after this many ms.|

## Fail-open guarantee

Every method swallows errors, logs to `console.error`, and resolves. Notifications
are best-effort — they will never block or break the calling application.

## Event types

See `./types` (`LoopEvent`) for the full set of supported event types and their
payload shapes: `error`, `signup`, `subscription`, `feedback`, `cron`, `infra`,
`booking`, `contact`, `seo_report`, `generic`, `raw`.

Every event also accepts these optional base fields:

- `severity` — `'info' | 'warning' | 'error'`
- `category` — override the default routing category
- `links` — `{ label, url }[]`, rendered as URL buttons on the message (e.g. "View in Sentry")
- `footerNote` — a short context line in the footer (e.g. a budget/spend figure)
- `digest` — fold routine `info` events into a rolling summary (the service batches them and posts a per-category digest on a schedule)
- `idempotencyKey` — server drops a repeat event with the same key for the project (deduped at ingest)

### Runtime tuples (for dashboards, dropdowns, filters)

The union types above are derived from `as const` tuples that are also exported,
so consumer UIs can iterate the values at runtime without redeclaring them:

```ts
import {
  LOOP_CATEGORIES,        // → LoopCategory
  LOOP_SEVERITIES,        // → LoopSeverity
  LOOP_ACTIONS,           // → LoopAction
  LOOP_EVENT_TYPES,       // → LoopEventType
  LOOP_EVENT_STATUSES,    // → LoopEventStatus (server-side delivery status)
} from '@mattdecrevel/loop/types';

<Select>{LOOP_CATEGORIES.map(c => <Option key={c}>{c}</Option>)}</Select>
```

## Changelog

- **0.7.0** — **Breaking:** `baseUrl` is now required (bring-your-own-endpoint).
  The previous `https://loop.decrevel.dev` default was removed. Pass your Loop
  deployment URL explicitly, e.g. `new Loop({ apiKey, baseUrl: 'https://…' })`.
