// Canonical Loop event types — the single source consumers mirror/import.
// One named payload per event type + a small `Event<T, P>` helper so the
// union stays DRY and each payload is referenceable on its own.

export type LoopCategory = 'users' | 'revenue' | 'feedback' | 'errors' | 'seo' | 'ops' | 'bookings';
export type LoopSeverity = 'info' | 'warning' | 'error';
export type LoopAction = 'issue' | 'autofix' | 'todo' | 'remind';

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

export interface LoopEventBase {
  category?: LoopCategory;
  severity?: LoopSeverity;
  actions?: LoopAction[];
  digest?: boolean;
  idempotencyKey?: string;
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
export interface SubscriptionPayload {
  email: string;
  kind: 'new' | 'upgrade' | 'cancel' | 'payment_failed' | 'refund' | 'addon';
  plan?: string;
  amount?: number;
  interval?: string;
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
  footerNote?: string;
}
export interface GenericPayload {
  title: string;
  body: string;
  fields?: LoopField[];
  context?: string;
  subSections?: LoopSubSection[];
  table?: LoopTable;
  emoji?: string;
  footerNote?: string;
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
