# @mattdecrevel/loop

Thin, fail-open client for the [Loop](https://github.com/mattdecrevel/loop) notification service.

Loop routes typed semantic events from your apps to Slack via a single bot — one token, one setup, zero per-project Slack config. This client POSTs events to a Loop instance and **never throws** — if Loop is unreachable or times out, your application keeps running.

## Install

```bash
npm install @mattdecrevel/loop
```

## Usage

```ts
import { Loop } from '@mattdecrevel/loop';

const loop = new Loop({ apiKey: process.env.LOOP_API_KEY! });

// Fire-and-forget — never throws.
await loop.notify({
  type: 'signup',
  payload: { email: 'ada@example.com', name: 'Ada' },
});

// Error sugar.
try {
  doRisky();
} catch (err) {
  await loop.error(err, { route: '/api/checkout', source: 'web' });
}
```

### Options

| Option      | Default                       | Description                                      |
| ----------- | ----------------------------- | ------------------------------------------------ |
| `apiKey`    | (required)                    | Project API key — mint one in the Loop console.  |
| `baseUrl`   | `https://loop.decrevel.dev`   | Override if you're self-hosting Loop.            |
| `timeoutMs` | `3000`                        | Abort the request after this many ms.            |

## Event types

Import `LoopEvent` from `@mattdecrevel/loop/types` for the full set of typed payloads:

| type            | default `category` | description                                          |
| --------------- | ------------------ | ---------------------------------------------------- |
| `error`         | `errors`           | Error with optional stack, route, source             |
| `signup`        | `users`            | New user registration                                |
| `subscription`  | `revenue`          | Billing events (new / upgrade / cancel / etc.)       |
| `feedback`      | `feedback`         | Bug reports, feature requests, questions             |
| `cron`          | `ops`              | Cron job results with optional table                 |
| `infra`         | `ops`              | Infrastructure / homelab alerts                      |
| `booking`       | `bookings`         | Booking confirmations with calendar link             |
| `contact`       | `bookings`         | Contact form submissions                             |
| `seo_report`    | `seo`              | Search metrics digest                                |
| `generic`       | (required)         | Escape hatch: title / body / fields / table          |
| `raw`           | (required)         | Pre-built Block Kit passthrough                      |

Every event also accepts: `severity`, `category` (override routing), `links: {label,url}[]` (rendered as URL buttons), `footerNote`, `digest`, and `idempotencyKey`.

## Self-hosting

See the [Loop server README](https://github.com/mattdecrevel/loop) for how to deploy your own Loop instance. Point this client at it with `baseUrl`.

## Fail-open guarantee

Every method swallows errors, logs to `console.error`, and resolves. Notifications are best-effort — they will never block or break the calling application.
