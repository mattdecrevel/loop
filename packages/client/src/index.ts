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
