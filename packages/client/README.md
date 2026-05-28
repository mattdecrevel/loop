# @mattdecrevel/loop

Thin, fail-open client for the [Loop](https://loop.decrevel.dev) notification service.

Loop ingests typed notification events over an authenticated HTTP endpoint and
routes them to Slack. This client is a zero-runtime-dependency wrapper around the
`POST /api/events` endpoint. It **never throws** — if Loop is down or the request
times out, your application code keeps running.

## Install

This package is published to GitHub Packages. Add an `.npmrc` to your repo:

```
@mattdecrevel:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then:

```bash
pnpm add @mattdecrevel/loop
```

> **Next.js consumers:** this package ships raw TypeScript (no build step). Add it
> to `transpilePackages` in your `next.config.ts` so Next compiles it:
>
> ```ts
> const nextConfig = { transpilePackages: ['@mattdecrevel/loop'] };
> ```

## Usage

```ts
import { Loop } from '@mattdecrevel/loop';

const loop = new Loop({ apiKey: process.env.LOOP_API_KEY! });

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
await loop.subscription({ email, kind: 'new', plan: 'Pro', amount: 29, interval: 'mo', source: 'lemon' });
await loop.feedback({ category: 'bug', message: 'Toggle broken', userEmail, page });
await loop.cron({ name: 'nightly-sync', ok: true, summary: '42 records' });
await loop.booking({ name, email, start, startIso, location });
await loop.contact({ name, email, message, source: 'form' });
await loop.error(err, { route: '/api/checkout', links: [{ label: 'View in Sentry', url: sentryUrl }] });

// `generic` and `raw` require an explicit routing category:
await loop.generic({ title: 'Deploy', body: 'shipped' }, 'ops');
```

Use `notify(event)` directly when you want full control over the envelope.

### Options

| Option      | Default                       | Description                          |
| ----------- | ----------------------------- | ------------------------------------ |
| `apiKey`    | (required)                    | Loop project API key (`loop_pk_…`).  |
| `baseUrl`   | `https://loop.decrevel.dev`   | Override the Loop service base URL.  |
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
- `digest` — fold routine `info` events into a rolling summary *(handler not yet active — see the service README roadmap)*
- `idempotencyKey` — recorded for dedup *(enforcement pending)*
