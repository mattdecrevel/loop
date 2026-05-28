import type {
  LoopEvent, LoopEventBase, LoopCategory,
  SignupPayload, SubscriptionPayload, FeedbackPayload, CronPayload, InfraPayload,
  BookingPayload, ContactPayload, SeoReportPayload, GenericPayload, RawPayload,
} from './types';

export interface LoopOptions { apiKey: string; baseUrl?: string; timeoutMs?: number }

/**
 * Optional extras every typed helper accepts — the `LoopEventBase` fields like
 * `severity`, `links`, `footerNote`, `digest`, `idempotencyKey`, `actions`,
 * and an override `category`. Required fields (`type`, `payload`, and the
 * category that `generic`/`raw` need) are locked by the helper itself.
 */
export type LoopExtras = Partial<LoopEventBase>;

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

  // ─── Typed helpers ───
  // Per-type sugar over notify(). Each takes the payload + optional `LoopExtras`
  // (severity, links, footerNote, digest, idempotencyKey, …). Required fields
  // are locked, so `extras` can never accidentally override `type`/`payload`.

  /** Sugar for an error event (auto severity:'error'). */
  error(err: unknown, extra?: { route?: string; source?: string; eventType?: string; userId?: string; eventId?: string } & LoopExtras): Promise<void> {
    const { route, source, ...rest } = extra ?? {};
    const e = err instanceof Error ? err : new Error(String(err));
    return this.notify({ severity: 'error', ...rest, type: 'error', payload: { message: e.message, stack: e.stack, route, source } });
  }

  signup(payload: SignupPayload, extras?: LoopExtras): Promise<void> {
    return this.notify({ ...extras, type: 'signup', payload });
  }
  subscription(payload: SubscriptionPayload, extras?: LoopExtras): Promise<void> {
    return this.notify({ ...extras, type: 'subscription', payload });
  }
  feedback(payload: FeedbackPayload, extras?: LoopExtras): Promise<void> {
    return this.notify({ ...extras, type: 'feedback', payload });
  }
  cron(payload: CronPayload, extras?: LoopExtras): Promise<void> {
    return this.notify({ ...extras, type: 'cron', payload });
  }
  infra(payload: InfraPayload, extras?: LoopExtras): Promise<void> {
    return this.notify({ ...extras, type: 'infra', payload });
  }
  booking(payload: BookingPayload, extras?: LoopExtras): Promise<void> {
    return this.notify({ ...extras, type: 'booking', payload });
  }
  contact(payload: ContactPayload, extras?: LoopExtras): Promise<void> {
    return this.notify({ ...extras, type: 'contact', payload });
  }
  seoReport(payload: SeoReportPayload, extras?: LoopExtras): Promise<void> {
    return this.notify({ ...extras, type: 'seo_report', payload });
  }

  /** `generic` requires an explicit routing category. */
  generic(payload: GenericPayload, category: LoopCategory, extras?: LoopExtras): Promise<void> {
    return this.notify({ ...extras, type: 'generic', category, payload });
  }
  /** `raw` (pre-built Block Kit) requires an explicit routing category. */
  raw(payload: RawPayload, category: LoopCategory, extras?: LoopExtras): Promise<void> {
    return this.notify({ ...extras, type: 'raw', category, payload });
  }
}
