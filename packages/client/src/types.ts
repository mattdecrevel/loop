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
