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
