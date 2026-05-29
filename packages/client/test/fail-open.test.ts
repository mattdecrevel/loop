import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Loop } from '../src/index';
import { installFetchMock } from './helpers';

describe('Loop fail-open behavior', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves (does not throw) when fetch rejects with a network error', async () => {
    installFetchMock({ reject: new Error('ECONNREFUSED') });
    const loop = new Loop({ apiKey: 'k', baseUrl: 'https://loop.example.com' });
    await expect(loop.signup({ email: 'a@b.com' })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    const args = errorSpy.mock.calls[0] as unknown[];
    expect(String(args[0])).toContain('[loop]');
  });

  it('resolves and logs when fetch returns a 500', async () => {
    installFetchMock({ status: 500 });
    const loop = new Loop({ apiKey: 'k', baseUrl: 'https://loop.example.com' });
    await expect(loop.signup({ email: 'a@b.com' })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('500');
  });

  it('resolves and logs when fetch returns a 4xx', async () => {
    installFetchMock({ status: 401 });
    const loop = new Loop({ apiKey: 'k', baseUrl: 'https://loop.example.com' });
    await expect(loop.error(new Error('x'))).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('401');
  });

  it('aborts and resolves when fetch hangs past timeoutMs', async () => {
    // Delay the fetch response beyond the 50ms client timeout. The
    // AbortController inside notify() should fire and the helper should
    // resolve without throwing.
    installFetchMock({ delayMs: 500 });
    const loop = new Loop({ apiKey: 'k', baseUrl: 'https://loop.example.com', timeoutMs: 50 });
    const start = Date.now();
    await expect(loop.signup({ email: 'a@b.com' })).resolves.toBeUndefined();
    const elapsed = Date.now() - start;
    // Allow generous CI slack but confirm we did NOT wait the full 500ms.
    expect(elapsed).toBeLessThan(400);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('error helper itself never throws even on transport failure', async () => {
    installFetchMock({ reject: new Error('boom') });
    const loop = new Loop({ apiKey: 'k', baseUrl: 'https://loop.example.com' });
    await expect(loop.error(new Error('caller error'))).resolves.toBeUndefined();
  });
});
