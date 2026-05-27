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

const tableSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number()]))),
});
const subSectionSchema = z.object({ header: z.string(), lines: z.array(z.string()) });

// Per-type payloads. Kept permissive where the renderer tolerates missing fields.
const payloads = {
  error: z.object({ message: z.string(), route: z.string().optional(), stack: z.string().optional(), source: z.string().optional() }),
  seo_report: z.object({ siteLabel: z.string(), clicks: z.number(), impressions: z.number(), topQueries: z.array(z.string()).optional(), subSections: z.array(subSectionSchema).optional(), footerNote: z.string().optional() }),
  signup: z.object({ email: z.string(), name: z.string().optional() }),
  subscription: z.object({ email: z.string(), kind: z.enum(['new', 'upgrade', 'cancel', 'payment_failed', 'refund', 'addon']), plan: z.string().optional(), amount: z.number().optional(), interval: z.string().optional() }),
  feedback: z.object({
    category: z.enum(['bug', 'question', 'feature', 'general']),
    message: z.string(),
    userEmail: z.string().optional(),
    page: z.string().optional(),
    name: z.string().optional(),
    section: z.string().optional(),
    breadcrumb: z.string().optional(),
    steps: z.array(z.string()).optional(),
    plan: z.string().optional(),
    browser: z.string().optional(),
    viewport: z.string().optional(),
    screen: z.string().optional(),
    locale: z.string().optional(),
    timezone: z.string().optional(),
    pageUrl: z.string().optional(),
  }),
  cron: z.object({ name: z.string(), ok: z.boolean(), summary: z.string().optional(), table: tableSchema.optional(), bullets: z.array(z.string()).optional() }),
  infra: z.object({ host: z.string(), message: z.string(), metric: z.string().optional() }),
  booking: z.object({ name: z.string(), email: z.string(), start: z.string(), notes: z.string().optional(), startIso: z.string().optional(), endIso: z.string().optional(), location: z.string().optional(), durationMin: z.number().optional(), manageUrl: z.string().optional() }),
  contact: z.object({ name: z.string(), email: z.string(), message: z.string(), source: z.string().optional() }),
  generic: z.object({ title: z.string(), body: z.string(), fields: z.array(z.object({ label: z.string(), value: z.string() })).optional(), context: z.string().optional(), subSections: z.array(subSectionSchema).optional(), table: tableSchema.optional(), emoji: z.string().optional(), footerNote: z.string().optional() }),
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
