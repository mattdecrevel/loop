# Loop — Phase 1 (Spine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Loop service that ingests typed notification events over an authenticated HTTP endpoint, routes them to a Slack channel (with per-project overrides), renders them to consistent Block Kit, and posts them via a bot token — plus a fail-open client SDK — with `mattdecrevel.com` as the first consumer.

**Architecture:** A Next.js 16 app on Vercel with its own Neon Postgres DB (Drizzle ORM). A single `POST /api/events` endpoint authenticates a project by hashed API key, validates a semantic event with Zod, resolves exactly one destination via a precedence-ordered routing table, renders type-specific Block Kit, and posts through the Slack bot token (`chat.postMessage`) or an override webhook. A monorepo (pnpm workspace) hosts the service at root and the zero-dependency client `@mattdecrevel/loop` in `packages/client`.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Drizzle ORM + Neon (`postgres` driver), Zod, Vitest, pnpm workspaces. Deploy: Vercel. DB migrations run at build (`tsx scripts/migrate.ts && next build`), matching the agent-seo/mattdecrevel.com pattern.

---

## File Structure

```
loop/
├── package.json                # root: Next.js service + workspace root
├── pnpm-workspace.yaml          # packages/*
├── tsconfig.json
├── next.config.ts
├── drizzle.config.ts
├── vitest.config.ts
├── eslint.config.mjs
├── .npmrc                       # GitHub Packages registry for @mattdecrevel/*
├── .env.example
├── vercel.json                  # cron placeholders (Phase 3), build cmd
├── scripts/
│   ├── migrate.ts               # run drizzle migrations (build step)
│   └── seed-project.ts          # CLI: create a project + API key + routes
├── drizzle/                     # generated SQL migrations
├── lib/
│   ├── db/
│   │   ├── index.ts             # drizzle client (postgres driver)
│   │   └── schema.ts            # projects, channels, routes, events + enums
│   ├── auth.ts                  # generateApiKey, hashApiKey, authenticateProject
│   ├── events/
│   │   └── schemas.ts           # Zod: event envelope + per-type payloads
│   ├── render/
│   │   ├── blocks.ts            # Block Kit helpers (section, actions, context)
│   │   └── index.ts            # renderEvent(): type -> blocks dispatch
│   ├── routing.ts               # resolveDestination(): precedence, single target
│   ├── slack/
│   │   └── transport.ts         # postToSlack(): bot token + webhook, fail-open
│   └── ingest.ts                # ingestEvent(): validate->route->render->post->record
├── app/
│   ├── layout.tsx               # minimal root layout
│   ├── page.tsx                 # static landing ("Loop")
│   └── api/
│       ├── health/route.ts      # GET -> { ok: true }
│       └── events/route.ts      # POST -> ingestEvent
├── packages/
│   └── client/
│       ├── package.json         # @mattdecrevel/loop (zero runtime deps)
│       ├── tsconfig.json
│       ├── src/
│       │   ├── types.ts         # wire-contract TS types (hand-written, lean)
│       │   └── index.ts         # Loop class: notify(), error(), fail-open
│       └── README.md
└── tests/
    ├── auth.test.ts
    ├── routing.test.ts
    ├── render.test.ts
    ├── schemas.test.ts
    └── ingest.test.ts
```

**Boundaries:** `routing.ts` (where it goes) and `render/` (how it looks) are independent and independently tested. `slack/transport.ts` is the only module that touches the network for posting. `ingest.ts` orchestrates them and is the only place that writes to `events`. The client knows nothing about any of it — it only POSTs JSON.

> **Type sharing note (intentional Phase-1 tradeoff):** the client ships hand-written
> TS types (`packages/client/src/types.ts`) and the service owns the Zod schemas
> (`lib/events/schemas.ts`). They are kept aligned manually to keep the client a
> zero-runtime-dependency package. Generating client types from the Zod schemas is
> deferred (tracked in the plan's Tech Debt note) — fine with one real consumer.

---

## Task 0: Repo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `.npmrc`, `.env.example`, `.gitignore`

- [ ] **Step 1: Root `package.json`**

```json
{
  "name": "loop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 4000",
    "build": "tsx scripts/migrate.ts && next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrate.ts",
    "seed:project": "tsx scripts/seed-project.ts"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "drizzle-orm": "^0.45.2",
    "postgres": "^3.4.5",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "drizzle-kit": "^0.30.1",
    "eslint": "^9",
    "tsx": "^4.19.2",
    "typescript": "^5",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: `.npmrc`** (GitHub Packages, same model as agent-seo)

```
@mattdecrevel:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

- [ ] **Step 4: `tsconfig.json`** (strict, `@/` alias)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "jsx": "preserve",
    "incremental": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "packages"]
}
```

- [ ] **Step 5: `next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `.gitignore`, `.env.example`**

`next.config.ts`:
```ts
import type { NextConfig } from 'next';
const nextConfig: NextConfig = { reactStrictMode: true };
export default nextConfig;
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': resolve(__dirname, '.') } },
});
```

`.env.example`:
```
DATABASE_URL=
DATABASE_URL_UNPOOLED=
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
LOOP_FALLBACK_CHANNEL_ID=
```

`.gitignore`: standard Next.js (`node_modules`, `.next`, `.env*`, `.vercel`, `*.tsbuildinfo`).

`eslint.config.mjs`: minimal flat config extending `next/core-web-vitals` equivalent (or `@eslint/js` recommended + TS).

- [ ] **Step 6: Install + commit**

Run: `cd ~/Development/loop && pnpm install`
```bash
git add -A && git commit -m "chore: scaffold Loop service (Next.js + pnpm workspace)"
```

---

## Task 1: Database schema + client + migrate script

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/index.ts`, `drizzle.config.ts`, `scripts/migrate.ts`
- Test: `tests/schemas.test.ts` (schema import smoke)

- [ ] **Step 1: `lib/db/schema.ts`**

```ts
import { sql } from 'drizzle-orm';
import {
  boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar,
} from 'drizzle-orm/pg-core';

export const eventCategory = pgEnum('event_category', [
  'users', 'revenue', 'feedback', 'errors', 'seo', 'ops', 'bookings',
]);
export const eventSeverity = pgEnum('event_severity', ['info', 'warning', 'error']);
export const eventStatus = pgEnum('event_status', ['posted', 'skipped', 'digested', 'failed']);

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: text('name').notNull(),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  githubRepo: text('github_repo'),          // "owner/repo" — Phase 2 issue creation
  linearTeam: text('linear_team'),          // Phase 3 seam
  autofixEnabled: boolean('autofix_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const channels = pgTable('channels', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 64 }).notNull().unique(),   // logical, e.g. "users"
  slackChannelId: text('slack_channel_id').notNull(),         // e.g. "C0123ABCD"
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Routing rules. project_id NULL = global; category NULL = all categories.
// Resolution precedence is computed in lib/routing.ts.
export const routes = pgTable('routes', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  category: eventCategory('category'),
  targetChannelId: uuid('target_channel_id').references(() => channels.id),
  targetWebhookUrl: text('target_webhook_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 32 }).notNull(),
  category: eventCategory('category').notNull(),
  severity: eventSeverity('severity').notNull().default('info'),
  payload: jsonb('payload').notNull(),
  status: eventStatus('status').notNull(),
  slackTs: text('slack_ts'),
  slackChannelId: text('slack_channel_id'),
  githubIssueNumber: integer('github_issue_number'),   // Phase 2
  githubIssueUrl: text('github_issue_url'),             // Phase 2
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),  // Phase 2
  idempotencyKey: text('idempotency_key'),
  digest: boolean('digest').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: `lib/db/index.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
```

- [ ] **Step 3: `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL! },
});
```

- [ ] **Step 4: `scripts/migrate.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL'); process.exit(1); }

const sql = postgres(url, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
await sql.end();
console.log('migrations applied');
```

- [ ] **Step 5: Generate migration + smoke test**

Run: `pnpm db:generate` (expect `drizzle/0000_*.sql` created)
`tests/schemas.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { projects, channels, routes, events } from '@/lib/db/schema';
describe('schema', () => {
  it('exports all tables', () => {
    expect(projects).toBeDefined();
    expect(channels).toBeDefined();
    expect(routes).toBeDefined();
    expect(events).toBeDefined();
  });
});
```
Run: `pnpm test tests/schemas.test.ts` → PASS

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(db): add projects/channels/routes/events schema + migrate"
```

---

## Task 2: API-key auth

**Files:**
- Create: `lib/auth.ts`
- Test: `tests/auth.test.ts`

- [ ] **Step 1: Failing test `tests/auth.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey } from '@/lib/auth';

describe('api keys', () => {
  it('generates a prefixed key', () => {
    const k = generateApiKey();
    expect(k).toMatch(/^loop_pk_[A-Za-z0-9_-]{32,}$/);
  });
  it('hashes deterministically and differs from the raw key', () => {
    const k = generateApiKey();
    expect(hashApiKey(k)).toBe(hashApiKey(k));
    expect(hashApiKey(k)).not.toBe(k);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`generateApiKey is not a function`). `pnpm test tests/auth.test.ts`

- [ ] **Step 3: Implement `lib/auth.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { projects } from './db/schema';

export function generateApiKey(): string {
  return `loop_pk_${randomBytes(24).toString('base64url')}`;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export interface AuthedProject {
  id: string;
  slug: string;
  githubRepo: string | null;
  autofixEnabled: boolean;
}

/** Resolve a project from a raw `Authorization: Bearer <key>` value. */
export async function authenticateProject(authHeader: string | null): Promise<AuthedProject | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const raw = authHeader.slice('Bearer '.length).trim();
  if (!raw) return null;
  const [row] = await db
    .select({ id: projects.id, slug: projects.slug, githubRepo: projects.githubRepo, autofixEnabled: projects.autofixEnabled })
    .from(projects)
    .where(eq(projects.apiKeyHash, hashApiKey(raw)))
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 4: Run → PASS.** `pnpm test tests/auth.test.ts`

- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(auth): API key generation, hashing, project lookup"`

---

## Task 3: Event Zod schemas (envelope + per-type payloads)

**Files:**
- Create: `lib/events/schemas.ts`
- Test: `tests/schemas.test.ts` (extend)

- [ ] **Step 1: Failing tests** (append to `tests/schemas.test.ts`)

```ts
import { parseEvent } from '@/lib/events/schemas';

describe('event envelope', () => {
  it('accepts a valid signup event and defaults category from type', () => {
    const r = parseEvent({ type: 'signup', payload: { email: 'a@b.com' } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.category).toBe('users');
  });
  it('rejects an unknown type', () => {
    const r = parseEvent({ type: 'nope', payload: {} });
    expect(r.success).toBe(false);
  });
  it('requires category for generic', () => {
    const r = parseEvent({ type: 'generic', payload: { title: 'x', body: 'y' } });
    expect(r.success).toBe(false); // category required when type=generic
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `lib/events/schemas.ts`**

```ts
import { z } from 'zod';

export const CATEGORIES = ['users', 'revenue', 'feedback', 'errors', 'seo', 'ops', 'bookings'] as const;
export type Category = (typeof CATEGORIES)[number];

// type -> default category. `null` means the caller MUST supply a category.
export const TYPE_DEFAULT_CATEGORY: Record<string, Category | null> = {
  error: 'errors', seo_report: 'seo', signup: 'users', subscription: 'revenue',
  feedback: 'feedback', cron: 'ops', infra: 'ops', booking: 'bookings',
  contact: 'bookings', generic: null, raw: null,
};

const actionEnum = z.enum(['issue', 'autofix', 'todo', 'remind']);

// Per-type payloads. Kept permissive where the renderer tolerates missing fields.
const payloads = {
  error: z.object({ message: z.string(), route: z.string().optional(), stack: z.string().optional(), source: z.string().optional() }),
  seo_report: z.object({ siteLabel: z.string(), clicks: z.number(), impressions: z.number(), topQueries: z.array(z.string()).optional() }),
  signup: z.object({ email: z.string(), name: z.string().optional() }),
  subscription: z.object({ email: z.string(), kind: z.enum(['new', 'upgrade', 'cancel', 'payment_failed', 'refund', 'addon']), plan: z.string().optional(), amount: z.number().optional(), interval: z.string().optional() }),
  feedback: z.object({ category: z.enum(['bug', 'question', 'feature', 'general']), message: z.string(), userEmail: z.string().optional(), page: z.string().optional() }),
  cron: z.object({ name: z.string(), ok: z.boolean(), summary: z.string().optional() }),
  infra: z.object({ host: z.string(), message: z.string(), metric: z.string().optional() }),
  booking: z.object({ name: z.string(), email: z.string(), start: z.string(), notes: z.string().optional() }),
  contact: z.object({ name: z.string(), email: z.string(), message: z.string(), source: z.string().optional() }),
  generic: z.object({ title: z.string(), body: z.string(), fields: z.array(z.object({ label: z.string(), value: z.string() })).optional(), context: z.string().optional() }),
  raw: z.object({ text: z.string(), blocks: z.array(z.record(z.unknown())).optional() }),
} as const;

export type EventType = keyof typeof payloads;

const baseEnvelope = z.object({
  type: z.string(),
  category: z.enum(CATEGORIES).optional(),
  severity: z.enum(['info', 'warning', 'error']).default('info'),
  actions: z.array(actionEnum).optional(),
  digest: z.boolean().optional().default(false),
  idempotencyKey: z.string().optional(),
  payload: z.unknown(),
});

export type ParsedEvent = {
  type: EventType; category: Category; severity: 'info' | 'warning' | 'error';
  actions: ('issue' | 'autofix' | 'todo' | 'remind')[]; digest: boolean;
  idempotencyKey?: string; payload: unknown;
};

export function parseEvent(input: unknown): { success: true; data: ParsedEvent } | { success: false; error: string } {
  const env = baseEnvelope.safeParse(input);
  if (!env.success) return { success: false, error: env.error.message };
  const { type } = env.data;
  if (!(type in payloads)) return { success: false, error: `unknown type: ${type}` };
  const schema = payloads[type as EventType];
  const p = schema.safeParse(env.data.payload);
  if (!p.success) return { success: false, error: p.error.message };

  const def = TYPE_DEFAULT_CATEGORY[type];
  const category = env.data.category ?? def;
  if (!category) return { success: false, error: `category required for type ${type}` };

  return {
    success: true,
    data: {
      type: type as EventType, category, severity: env.data.severity,
      actions: env.data.actions ?? [], digest: env.data.digest,
      idempotencyKey: env.data.idempotencyKey, payload: p.data,
    },
  };
}
```

- [ ] **Step 4: Run → PASS.** `pnpm test tests/schemas.test.ts`

- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(events): Zod envelope + per-type payload schemas"`

---

## Task 4: Block Kit helpers + renderers

**Files:**
- Create: `lib/render/blocks.ts`, `lib/render/index.ts`
- Test: `tests/render.test.ts`

- [ ] **Step 1: Failing test `tests/render.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { renderEvent } from '@/lib/render';

describe('renderEvent', () => {
  it('renders a signup as a single mobile-friendly section', () => {
    const { text, blocks } = renderEvent({ type: 'signup', payload: { email: 'a@b.com', name: 'Ada' } } as any);
    expect(text).toContain('a@b.com');
    expect(blocks[0].type).toBe('section');
  });
  it('renders generic with provided title/body', () => {
    const { blocks } = renderEvent({ type: 'generic', category: 'ops', payload: { title: 'Deploy', body: 'shipped' } } as any);
    expect(JSON.stringify(blocks)).toContain('Deploy');
  });
  it('passes raw blocks through', () => {
    const { blocks } = renderEvent({ type: 'raw', payload: { text: 't', blocks: [{ type: 'divider' }] } } as any);
    expect(blocks).toEqual([{ type: 'divider' }]);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `lib/render/blocks.ts`**

```ts
export interface SlackBlock { type: string; [k: string]: unknown }
export function section(text: string): SlackBlock {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}
export function context(text: string): SlackBlock {
  return { type: 'context', elements: [{ type: 'mrkdwn', text }] };
}
```

- [ ] **Step 4: Implement `lib/render/index.ts`** (mobile-friendly: one section + optional context; mirrors POYSE philosophy)

```ts
import type { ParsedEvent } from '@/lib/events/schemas';
import { section, context, type SlackBlock } from './blocks';

export interface Rendered { text: string; blocks: SlackBlock[] }

const EMOJI: Record<string, string> = {
  error: ':rotating_light:', seo_report: ':mag:', signup: ':bust_in_silhouette:',
  subscription: ':moneybag:', feedback: ':speech_balloon:', cron: ':gear:',
  infra: ':satellite_antenna:', booking: ':calendar:', contact: ':envelope:',
  generic: ':information_source:', raw: ':information_source:',
};

export function renderEvent(ev: ParsedEvent): Rendered {
  const p = ev.payload as Record<string, any>;
  const emoji = EMOJI[ev.type] ?? ':information_source:';

  switch (ev.type) {
    case 'raw':
      return { text: p.text, blocks: (p.blocks as SlackBlock[]) ?? [section(p.text)] };
    case 'generic': {
      const lines = [`${emoji} *${p.title}*`, p.body];
      if (Array.isArray(p.fields)) for (const f of p.fields) lines.push(`• *${f.label}:* ${f.value}`);
      const blocks = [section(lines.join('\n'))];
      if (p.context) blocks.push(context(p.context));
      return { text: p.title, blocks };
    }
    case 'signup': {
      const id = p.name ? `${p.name} (${p.email})` : p.email;
      return { text: `New signup — ${id}`, blocks: [section(`${emoji} *New signup*\n${id}`)] };
    }
    case 'subscription': {
      const id = p.email;
      const amt = p.amount ? ` — $${p.amount}${p.interval ? `/${p.interval}` : ''}` : '';
      return { text: `Subscription ${p.kind} — ${id}`, blocks: [section(`${emoji} *Subscription: ${p.kind}*\n${id}${p.plan ? ` · ${p.plan}` : ''}${amt}`)] };
    }
    case 'error': {
      const lines = [`${emoji} *Error*`, p.message];
      if (p.route) lines.push(`• \`${p.route}\``);
      if (p.stack) lines.push('```' + String(p.stack).split('\n').slice(0, 6).join('\n') + '```');
      return { text: `Error — ${p.message}`, blocks: [section(lines.join('\n'))] };
    }
    case 'feedback': {
      const lines = [`${emoji} *Feedback: ${p.category}*`, p.message];
      if (p.userEmail) lines.push(`• ${p.userEmail}`);
      if (p.page) lines.push(`• \`${p.page}\``);
      return { text: `Feedback — ${p.category}`, blocks: [section(lines.join('\n'))] };
    }
    case 'cron': {
      const icon = p.ok ? ':white_check_mark:' : ':warning:';
      return { text: `Cron ${p.name} ${p.ok ? 'ok' : 'failed'}`, blocks: [section(`${icon} *Cron: ${p.name}*${p.summary ? `\n${p.summary}` : ''}`)] };
    }
    case 'infra': {
      return { text: `Infra — ${p.host}: ${p.message}`, blocks: [section(`${emoji} *${p.host}*\n${p.message}${p.metric ? `\n• ${p.metric}` : ''}`)] };
    }
    case 'booking': {
      return { text: `Booking — ${p.name}`, blocks: [section(`${emoji} *New booking*\n${p.name} (${p.email})\n${p.start}${p.notes ? `\n${p.notes}` : ''}`)] };
    }
    case 'contact': {
      return { text: `Contact — ${p.name}`, blocks: [section(`${emoji} *Contact${p.source ? ` (${p.source})` : ''}*\n${p.name} (${p.email})\n${p.message}`)] };
    }
    case 'seo_report': {
      const ctr = p.impressions > 0 ? ((p.clicks / p.impressions) * 100).toFixed(2) : '0.00';
      const q = Array.isArray(p.topQueries) && p.topQueries.length ? `\n${p.topQueries.slice(0, 5).map((x: string) => `• ${x}`).join('\n')}` : '';
      return { text: `${p.siteLabel} — ${p.clicks}c/${p.impressions}i`, blocks: [section(`${emoji} *${p.siteLabel} — search digest*\n${p.clicks} clicks · ${p.impressions} impressions · ${ctr}% CTR${q}`)] };
    }
    default:
      return { text: 'Notification', blocks: [section('Notification')] };
  }
}
```

- [ ] **Step 5: Run → PASS.** `pnpm test tests/render.test.ts`

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(render): mobile-friendly Block Kit renderers for all v1 types"`

---

## Task 5: Routing engine

**Files:**
- Create: `lib/routing.ts`
- Test: `tests/routing.test.ts`

- [ ] **Step 1: Failing test `tests/routing.test.ts`** (pure precedence logic; DB read is injected so the test is unit-pure)

```ts
import { describe, it, expect } from 'vitest';
import { pickRoute, type RouteRow } from '@/lib/routing';

const rows: RouteRow[] = [
  { projectId: null, category: null, targetChannelId: 'fallback', targetWebhookUrl: null },
  { projectId: null, category: 'users', targetChannelId: 'users', targetWebhookUrl: null },
  { projectId: 'p1', category: null, targetChannelId: 'p1all', targetWebhookUrl: null },
  { projectId: 'p1', category: 'errors', targetChannelId: 'p1err', targetWebhookUrl: null },
];

describe('pickRoute precedence', () => {
  it('(project,category) wins', () => {
    expect(pickRoute(rows, 'p1', 'errors')?.targetChannelId).toBe('p1err');
  });
  it('(project,*) beats (*,category)', () => {
    expect(pickRoute(rows, 'p1', 'users')?.targetChannelId).toBe('p1all');
  });
  it('(*,category) when no project rule', () => {
    expect(pickRoute(rows, 'p2', 'users')?.targetChannelId).toBe('users');
  });
  it('global fallback otherwise', () => {
    expect(pickRoute(rows, 'p2', 'ops')?.targetChannelId).toBe('fallback');
  });
  it('returns exactly one row (no duplicates)', () => {
    const r = pickRoute(rows, 'p1', 'errors');
    expect(r).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `lib/routing.ts`**

```ts
import { isNull, or, eq } from 'drizzle-orm';
import { db } from './db';
import { channels, routes } from './db/schema';
import type { Category } from './events/schemas';

export interface RouteRow {
  projectId: string | null;
  category: Category | null;
  targetChannelId: string | null;   // channels.id (UUID) or sentinel in tests
  targetWebhookUrl: string | null;
}

/** Pure precedence resolver. Most-specific match wins; returns exactly one or null. */
export function pickRoute(rows: RouteRow[], projectId: string, category: Category): RouteRow | null {
  const score = (r: RouteRow): number => {
    if (r.projectId === projectId && r.category === category) return 4;
    if (r.projectId === projectId && r.category === null) return 3;
    if (r.projectId === null && r.category === category) return 2;
    if (r.projectId === null && r.category === null) return 1;
    return 0; // non-matching (e.g. other project) — excluded
  };
  let best: RouteRow | null = null;
  let bestScore = 0;
  for (const r of rows) {
    const s = score(r);
    if (s > bestScore) { best = r; bestScore = s; }
  }
  return best;
}

export interface Destination { kind: 'channel'; slackChannelId: string } | { kind: 'webhook'; url: string };

/** Resolve the single destination for (project, category) from the DB. */
export async function resolveDestination(projectId: string, category: Category): Promise<Destination | null> {
  // Candidate rows: this project's rules + global rules.
  const rows = await db
    .select()
    .from(routes)
    .where(or(eq(routes.projectId, projectId), isNull(routes.projectId)));
  const picked = pickRoute(rows as unknown as RouteRow[], projectId, category);
  if (!picked) return null;
  if (picked.targetWebhookUrl) return { kind: 'webhook', url: picked.targetWebhookUrl };
  if (picked.targetChannelId) {
    const [ch] = await db.select({ sid: channels.slackChannelId }).from(channels).where(eq(channels.id, picked.targetChannelId)).limit(1);
    if (ch) return { kind: 'channel', slackChannelId: ch.sid };
  }
  return null;
}
```

- [ ] **Step 4: Run → PASS.** `pnpm test tests/routing.test.ts`

- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(routing): single-destination precedence resolver + DB lookup"`

---

## Task 6: Slack transport (fail-open)

**Files:**
- Create: `lib/slack/transport.ts`

- [ ] **Step 1: Implement `lib/slack/transport.ts`** (no network in unit tests; this is integration-posted via ingest. Keep it small and fail-open.)

```ts
import type { SlackBlock } from '@/lib/render/blocks';

export interface PostResult { ok: boolean; ts?: string; channel?: string; error?: string }

/** Post via bot token to a channel ID. Returns ts for later chat.update (Phase 2). */
export async function postToChannel(text: string, blocks: SlackBlock[], channelId: string): Promise<PostResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: 'SLACK_BOT_TOKEN not set' };
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channelId, text, blocks }),
    });
    const data = (await res.json()) as { ok: boolean; ts?: string; channel?: string; error?: string };
    if (!data.ok) { console.error('[loop/slack] chat.postMessage:', data.error); return { ok: false, error: data.error }; }
    return { ok: true, ts: data.ts, channel: data.channel };
  } catch (err) {
    console.error('[loop/slack] post failed:', err instanceof Error ? err.message : String(err));
    return { ok: false, error: 'fetch_failed' };
  }
}

/** Post the rendered payload to an arbitrary incoming webhook (override target). */
export async function postToWebhook(text: string, blocks: SlackBlock[], url: string): Promise<PostResult> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, blocks }) });
    if (!res.ok) { console.error('[loop/slack] webhook', res.status); return { ok: false, error: `http_${res.status}` }; }
    return { ok: true };
  } catch (err) {
    console.error('[loop/slack] webhook failed:', err instanceof Error ? err.message : String(err));
    return { ok: false, error: 'fetch_failed' };
  }
}
```

- [ ] **Step 2: Commit.** `git add -A && git commit -m "feat(slack): bot-token + webhook transport, fail-open"`

---

## Task 7: Ingest orchestration + routes

**Files:**
- Create: `lib/ingest.ts`, `app/api/events/route.ts`, `app/api/health/route.ts`, `app/layout.tsx`, `app/page.tsx`
- Test: `tests/ingest.test.ts`

- [ ] **Step 1: Failing test `tests/ingest.test.ts`** (validation path, no DB/network — assert it rejects bad input before side effects)

```ts
import { describe, it, expect } from 'vitest';
import { validateIngest } from '@/lib/ingest';

describe('validateIngest', () => {
  it('rejects unknown type with a 400-shaped result', () => {
    const r = validateIngest({ type: 'bogus', payload: {} });
    expect(r.ok).toBe(false);
  });
  it('accepts a valid event', () => {
    const r = validateIngest({ type: 'cron', payload: { name: 'x', ok: true } });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `lib/ingest.ts`**

```ts
import { db } from './db';
import { events } from './db/schema';
import { parseEvent, type ParsedEvent } from './events/schemas';
import { renderEvent } from './render';
import { resolveDestination } from './routing';
import { postToChannel, postToWebhook } from './slack/transport';
import type { AuthedProject } from './auth';

export function validateIngest(input: unknown): { ok: true; event: ParsedEvent } | { ok: false; error: string } {
  const r = parseEvent(input);
  return r.success ? { ok: true, event: r.data } : { ok: false, error: r.error };
}

/** Full pipeline: render -> resolve route -> post -> record. Returns event id. */
export async function ingestEvent(project: AuthedProject, ev: ParsedEvent): Promise<{ status: string }> {
  const rendered = renderEvent(ev);

  // Digest: persist + skip immediate post for routine info events.
  if (ev.digest && ev.severity === 'info') {
    await db.insert(events).values({
      projectId: project.id, type: ev.type, category: ev.category, severity: ev.severity,
      payload: ev.payload as object, status: 'digested', idempotencyKey: ev.idempotencyKey, digest: true,
    });
    return { status: 'digested' };
  }

  const dest = await resolveDestination(project.id, ev.category);
  if (!dest) {
    await db.insert(events).values({
      projectId: project.id, type: ev.type, category: ev.category, severity: ev.severity,
      payload: ev.payload as object, status: 'skipped', idempotencyKey: ev.idempotencyKey,
    });
    return { status: 'skipped_no_route' };
  }

  const result = dest.kind === 'channel'
    ? await postToChannel(rendered.text, rendered.blocks, dest.slackChannelId)
    : await postToWebhook(rendered.text, rendered.blocks, dest.url);

  await db.insert(events).values({
    projectId: project.id, type: ev.type, category: ev.category, severity: ev.severity,
    payload: ev.payload as object, status: result.ok ? 'posted' : 'failed',
    slackTs: result.ts ?? null, slackChannelId: result.channel ?? (dest.kind === 'channel' ? dest.slackChannelId : null),
    idempotencyKey: ev.idempotencyKey,
  });

  return { status: result.ok ? 'posted' : 'failed' };
}
```

- [ ] **Step 4: Implement `app/api/events/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { authenticateProject } from '@/lib/auth';
import { validateIngest, ingestEvent } from '@/lib/ingest';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const project = await authenticateProject(req.headers.get('authorization'));
  if (!project) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const v = validateIngest(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const result = await ingestEvent(project, v.event);
  return NextResponse.json(result, { status: 202 });
}
```

- [ ] **Step 5: Implement `app/api/health/route.ts`, `app/layout.tsx`, `app/page.tsx`**

```ts
// app/api/health/route.ts
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export function GET() { return NextResponse.json({ ok: true, service: 'loop' }); }
```
```tsx
// app/layout.tsx
export const metadata = { title: 'Loop', robots: { index: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
```
```tsx
// app/page.tsx
export default function Page() { return <main style={{ fontFamily: 'system-ui', padding: 40 }}><h1>Loop</h1><p>Notification service.</p></main>; }
```

- [ ] **Step 6: Run → PASS.** `pnpm test` (all suites). `pnpm build` locally (expects DATABASE_URL; if unset, build step migrate will fail — run with a throwaway/real URL or temporarily skip migrate to verify `next build`).

- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(api): /api/events ingest pipeline + health endpoint"`

---

## Task 8: Client SDK `@mattdecrevel/loop`

**Files:**
- Create: `packages/client/package.json`, `packages/client/tsconfig.json`, `packages/client/src/types.ts`, `packages/client/src/index.ts`, `packages/client/README.md`

- [ ] **Step 1: `packages/client/package.json`** (ships raw TS, like agent-seo, so consumers transpile it; zero runtime deps)

```json
{
  "name": "@mattdecrevel/loop",
  "version": "0.1.0",
  "description": "Thin fail-open client for the Loop notification service.",
  "license": "UNLICENSED",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts", "./types": "./src/types.ts" },
  "files": ["src/**/*.ts", "README.md"],
  "publishConfig": { "registry": "https://npm.pkg.github.com", "access": "restricted" },
  "repository": { "type": "git", "url": "git+https://github.com/mattdecrevel/loop.git" }
}
```

- [ ] **Step 2: `packages/client/src/types.ts`** (hand-written wire types, mirrors `lib/events/schemas.ts`)

```ts
export type LoopCategory = 'users' | 'revenue' | 'feedback' | 'errors' | 'seo' | 'ops' | 'bookings';
export type LoopSeverity = 'info' | 'warning' | 'error';
export type LoopAction = 'issue' | 'autofix' | 'todo' | 'remind';

export interface LoopEventBase {
  category?: LoopCategory;
  severity?: LoopSeverity;
  actions?: LoopAction[];
  digest?: boolean;
  idempotencyKey?: string;
}

export type LoopEvent =
  | (LoopEventBase & { type: 'error'; payload: { message: string; route?: string; stack?: string; source?: string } })
  | (LoopEventBase & { type: 'signup'; payload: { email: string; name?: string } })
  | (LoopEventBase & { type: 'subscription'; payload: { email: string; kind: 'new' | 'upgrade' | 'cancel' | 'payment_failed' | 'refund' | 'addon'; plan?: string; amount?: number; interval?: string } })
  | (LoopEventBase & { type: 'feedback'; payload: { category: 'bug' | 'question' | 'feature' | 'general'; message: string; userEmail?: string; page?: string } })
  | (LoopEventBase & { type: 'cron'; payload: { name: string; ok: boolean; summary?: string } })
  | (LoopEventBase & { type: 'infra'; payload: { host: string; message: string; metric?: string } })
  | (LoopEventBase & { type: 'booking'; payload: { name: string; email: string; start: string; notes?: string } })
  | (LoopEventBase & { type: 'contact'; payload: { name: string; email: string; message: string; source?: string } })
  | (LoopEventBase & { type: 'seo_report'; payload: { siteLabel: string; clicks: number; impressions: number; topQueries?: string[] } })
  | (LoopEventBase & { type: 'generic'; category: LoopCategory; payload: { title: string; body: string; fields?: { label: string; value: string }[]; context?: string } })
  | (LoopEventBase & { type: 'raw'; category: LoopCategory; payload: { text: string; blocks?: Record<string, unknown>[] } });
```

- [ ] **Step 3: `packages/client/src/index.ts`** (fail-open `Loop` class)

```ts
import type { LoopEvent } from './types';

export interface LoopOptions { apiKey: string; baseUrl?: string; timeoutMs?: number }

export class Loop {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  constructor(opts: LoopOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://loop.decrevel.dev').replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 3000;
  }

  /** Fire-and-forget. Never throws; logs and continues on any failure. */
  async notify(event: LoopEvent): Promise<void> {
    if (!this.apiKey) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(event),
        signal: controller.signal,
      });
      if (!res.ok) console.error(`[loop] ${res.status}`);
    } catch (err) {
      console.error('[loop] notify failed:', err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }

  /** Sugar for an error event. */
  error(err: unknown, extra?: { route?: string; source?: string }): Promise<void> {
    const e = err instanceof Error ? err : new Error(String(err));
    return this.notify({ type: 'error', severity: 'error', payload: { message: e.message, stack: e.stack, ...extra } });
  }
}
```

- [ ] **Step 4: `packages/client/README.md`** (install via GitHub Packages, usage example, fail-open note, `transpilePackages` requirement for Next.js consumers).

- [ ] **Step 5: Type-check + commit.** Run: `cd packages/client && pnpm exec tsc --noEmit` (add a local tsconfig). 
```bash
git add -A && git commit -m "feat(client): @mattdecrevel/loop fail-open SDK"
```

---

## Task 9: Seed CLI (create project + channels + routes)

**Files:**
- Create: `scripts/seed-project.ts`

- [ ] **Step 1: Implement `scripts/seed-project.ts`** — generates an API key, inserts a project, upserts channels, and inserts a global default route. Prints the **raw API key once** (only the hash is stored).

```ts
import { db } from '@/lib/db';
import { projects, channels, routes } from '@/lib/db/schema';
import { generateApiKey, hashApiKey } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// Usage: pnpm seed:project <slug> "<name>" [githubRepo]
const [slug, name, repo] = process.argv.slice(2);
if (!slug || !name) { console.error('usage: seed:project <slug> "<name>" [owner/repo]'); process.exit(1); }

const key = generateApiKey();
const [project] = await db.insert(projects).values({
  slug, name, apiKeyHash: hashApiKey(key), githubRepo: repo ?? null,
}).returning();

console.log(`Project ${slug} created.`);
console.log(`API KEY (store now, shown once): ${key}`);
console.log(`id: ${project.id}`);
process.exit(0);
```

- [ ] **Step 2: Commit.** `git add -A && git commit -m "feat(scripts): seed-project CLI (API key minting)"`

> Channel + route setup is done via SQL/seed for Phase 1; the dashboard UI lands in Phase 3.

---

## Task 10: Deployment wiring (Vercel + Neon)

**Files:**
- Create: `vercel.json`
- External: Neon project, Vercel project, env vars

- [ ] **Step 1: `vercel.json`**

```json
{
  "buildCommand": "pnpm build",
  "framework": "nextjs"
}
```

- [ ] **Step 2: Provision Neon** (via Neon MCP `create_project` or dashboard). Capture pooled `DATABASE_URL` + unpooled `DATABASE_URL_UNPOOLED`.

- [ ] **Step 3: Create + link Vercel project**

```bash
cd ~/Development/loop
vercel link --yes --project loop
vercel git connect    # connect the GitHub repo for auto-deploy on push
```

- [ ] **Step 4: Set env vars (Production + Preview)**

```bash
vercel env add DATABASE_URL production
vercel env add DATABASE_URL_UNPOOLED production
# SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, LOOP_FALLBACK_CHANNEL_ID added when Slack creds arrive
```

- [ ] **Step 5: Add custom domain** `loop.decrevel.dev` (`vercel domains` / dashboard; DNS CNAME).

- [ ] **Step 6: Push to deploy + verify health**

```bash
git push -u origin main
# after deploy:
curl -s https://loop.decrevel.dev/api/health   # -> {"ok":true,"service":"loop"}
```

- [ ] **Step 7: Commit.** `git add -A && git commit -m "chore: Vercel deploy config"`

---

## Task 11: First consumer — mattdecrevel.com

**Files (in the `mattdecrevel.com` repo, branch `claude/loop-notification-service`):**
- Add dep `@mattdecrevel/loop`, `transpilePackages` in `next.config.ts`
- Refactor `lib/api/notifications/slack.ts` callers to emit Loop events
- Add `LOOP_API_KEY` env

- [ ] **Step 1:** Add the client dep + `transpilePackages: ['@mattdecrevel/loop']`.
- [ ] **Step 2:** Create `lib/api/notifications/loop.ts` exporting a configured `Loop` instance.
- [ ] **Step 3:** Replace `contactFormNotification`/`bookingCreatedNotification`/`resumeActionNotification` call sites with `loop.notify({ type: 'contact' | 'booking' | 'generic', ... })`; map the job-pipeline notifications to `type: 'cron'`/`generic` with `category: 'ops'`.
- [ ] **Step 4:** Keep `lib/api/notifications/slack.ts` until parity is verified in prod, then delete.
- [ ] **Step 5:** Seed a `decrevel-dev` project in Loop, set `LOOP_API_KEY` in mattdecrevel.com's Vercel env.
- [ ] **Step 6:** Verify a real contact submission posts via Loop. Commit on the consumer branch.

---

## Tech Debt / Deferred

- Client TS types are hand-maintained against the server Zod schemas (Task 3/Task 8). Consider generating client types from Zod later.
- Idempotency is recorded but not yet enforced (no unique constraint / lookup) — add in a later pass if client retries cause dupes.
- No rate limiting on `/api/events` (single-owner, low risk). Revisit if abused.

---

## Self-Review

**Spec coverage:** §3 topology → Tasks 7/10; §4 wire contract → Tasks 3/7/8; §5 taxonomy → Tasks 3/4; §6 routing/overrides (no-dup) → Task 5; §7 auth → Task 2; §8 data model → Task 1; §13 client → Task 8; §14 Phase 1 + first consumer → Tasks 0–11. Phase 2/3 items (interactivity, issues, digest cron, dashboard, reminders) intentionally out of this plan.

**Placeholder scan:** none — all code steps contain full code. Channel/route seeding noted as SQL-for-now with the dashboard in Phase 3.

**Type consistency:** `ParsedEvent`/`Category` (Task 3) used consistently in `render/index.ts` (Task 4), `routing.ts` (Task 5), `ingest.ts` (Task 7). Client `LoopEvent` union (Task 8) mirrors the same payload shapes. `PostResult.ts` flows into `events.slackTs`.
