import { vi, type MockInstance } from 'vitest';

/**
 * Install a fetch mock that records calls and returns a 200 OK response by
 * default. Returns a tuple of [spy, lastBody helper] so tests can inspect
 * exactly what the Loop client put on the wire.
 */
export function installFetchMock(opts?: {
  status?: number;
  ok?: boolean;
  reject?: unknown;
  delayMs?: number;
}): MockInstance {
  const status = opts?.status ?? 200;
  const ok = opts?.ok ?? status < 400;

  const impl = async (..._args: unknown[]): Promise<Response> => {
    if (opts?.delayMs) {
      await new Promise((resolve, reject) => {
        // Honor AbortController if the caller passes a signal as part of init
        const init = _args[1] as RequestInit | undefined;
        const signal = init?.signal;
        const timer = setTimeout(resolve, opts.delayMs);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }
    if (opts?.reject !== undefined) throw opts.reject;
    return new Response('{}', { status, statusText: ok ? 'OK' : 'ERR' });
  };

  return vi.spyOn(globalThis, 'fetch').mockImplementation(impl as typeof fetch);
}

/** Pull the parsed JSON body sent on the Nth (default last) fetch call. */
export function bodyOf(spy: MockInstance, callIndex = -1): unknown {
  const calls = spy.mock.calls;
  const call = calls.at(callIndex);
  if (!call) throw new Error('fetch was not called');
  const init = call[1] as RequestInit | undefined;
  if (!init?.body) throw new Error('fetch called without a body');
  return JSON.parse(String(init.body));
}

/** Pull the URL of the Nth (default last) fetch call. */
export function urlOf(spy: MockInstance, callIndex = -1): string {
  const calls = spy.mock.calls;
  const call = calls.at(callIndex);
  if (!call) throw new Error('fetch was not called');
  return String(call[0]);
}

/** Pull a header from the Nth (default last) fetch call. */
export function headerOf(spy: MockInstance, name: string, callIndex = -1): string | undefined {
  const calls = spy.mock.calls;
  const call = calls.at(callIndex);
  if (!call) throw new Error('fetch was not called');
  const init = call[1] as RequestInit | undefined;
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers[name];
}
