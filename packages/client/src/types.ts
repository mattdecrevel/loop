// Canonical Loop event types — the single source consumers mirror/import.
// One named payload per event type + a small `Event<T, P>` helper so the
// union stays DRY and each payload is referenceable on its own.

// Tuples are the source of truth; the union types are derived from them.
// This lets consumers (dashboards, dropdowns, filter UIs) iterate the values
// at runtime without redeclaring them.
export const LOOP_CATEGORIES = [
  'users',
  'revenue',
  'feedback',
  'errors',
  'seo',
  'ops',
  'bookings',
] as const;
export type LoopCategory = (typeof LOOP_CATEGORIES)[number];

export const LOOP_SEVERITIES = ['info', 'warning', 'error'] as const;
export type LoopSeverity = (typeof LOOP_SEVERITIES)[number];

export const LOOP_ACTIONS = ['issue', 'autofix', 'todo', 'remind'] as const;
export type LoopAction = (typeof LOOP_ACTIONS)[number];

export const LOOP_EVENT_TYPES = [
  'error',
  'signup',
  'subscription',
  'feedback',
  'cron',
  'infra',
  'booking',
  'contact',
  'seo_report',
  'generic',
  'raw',
] as const;
export type LoopEventType = (typeof LOOP_EVENT_TYPES)[number];

// Server-side delivery status for an ingested event. Not part of the wire
// contract sent by clients — exported here so the operator dashboard can
// reuse the same vocabulary without redeclaring it.
export const LOOP_EVENT_STATUSES = [
  'posted',
  'failed',
  'skipped',
  'digested',
  'duplicate',
] as const;
export type LoopEventStatus = (typeof LOOP_EVENT_STATUSES)[number];

export interface LoopTable {
  columns: string[];
  rows: (string | number)[][];
}
export interface LoopSubSection {
  header: string;
  lines: string[];
}
export interface LoopField {
  label: string;
  value: string;
}
export interface LoopLink {
  label: string;
  url: string;
}

export interface LoopEventBase {
  category?: LoopCategory;
  severity?: LoopSeverity;
  actions?: LoopAction[];
  digest?: boolean;
  idempotencyKey?: string;
  links?: LoopLink[];
  footerNote?: string;
}

// ─── Per-type payloads ───

export interface ErrorPayload {
  message: string;
  route?: string;
  stack?: string;
  source?: string;
}
export interface SignupPayload {
  email: string;
  name?: string;
}
// Common billing sources; the `(string & {})` keeps autocomplete for these
// while still accepting any other provider without a package bump.
export type LoopSubscriptionSource = 'lemon' | 'apple_iap' | 'stripe' | (string & {});

export interface SubscriptionPayload {
  email: string;
  kind: 'new' | 'upgrade' | 'downgrade' | 'cancel' | 'expired' | 'payment_failed' | 'refund' | 'addon';
  plan?: string;
  amount?: number;
  interval?: string;
  endsAt?: string;
  source?: LoopSubscriptionSource;
  variant?: string;
  subscriptionId?: string;
}
export interface FeedbackPayload {
  category: 'bug' | 'question' | 'feature' | 'general';
  message: string;
  userEmail?: string;
  page?: string;
  name?: string;
  section?: string;
  breadcrumb?: string;
  steps?: string[];
  plan?: string;
  browser?: string;
  viewport?: string;
  screen?: string;
  locale?: string;
  timezone?: string;
  pageUrl?: string;
}
export interface CronPayload {
  name: string;
  ok: boolean;
  summary?: string;
  table?: LoopTable;
  bullets?: string[];
}
export interface InfraPayload {
  host: string;
  message: string;
  metric?: string;
}
export interface BookingPayload {
  name: string;
  email: string;
  start: string;
  notes?: string;
  startIso?: string;
  endIso?: string;
  location?: string;
  durationMin?: number;
  manageUrl?: string;
}
export interface ContactPayload {
  name: string;
  email: string;
  message: string;
  source?: string;
}
export interface SeoReportPayload {
  siteLabel: string;
  clicks: number;
  impressions: number;
  topQueries?: string[];
  subSections?: LoopSubSection[];
}
export interface GenericPayload {
  title: string;
  body: string;
  fields?: LoopField[];
  context?: string;
  subSections?: LoopSubSection[];
  table?: LoopTable;
  emoji?: string;
}
export interface RawPayload {
  text: string;
  blocks?: Record<string, unknown>[];
}

// ─── Event union ───
// `Event<T, P>` keeps the discriminated union DRY. `generic`/`raw` additionally
// require an explicit `category` (they have no default mapping on the server).

type Event<T extends string, P> = LoopEventBase & { type: T; payload: P };

export type LoopEvent =
  | Event<'error', ErrorPayload>
  | Event<'signup', SignupPayload>
  | Event<'subscription', SubscriptionPayload>
  | Event<'feedback', FeedbackPayload>
  | Event<'cron', CronPayload>
  | Event<'infra', InfraPayload>
  | Event<'booking', BookingPayload>
  | Event<'contact', ContactPayload>
  | Event<'seo_report', SeoReportPayload>
  | (Event<'generic', GenericPayload> & { category: LoopCategory })
  | (Event<'raw', RawPayload> & { category: LoopCategory });
