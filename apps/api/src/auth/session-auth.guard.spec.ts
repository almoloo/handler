import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthService } from './auth.service.js';
import { SESSION_COOKIE, SessionAuthGuard } from './session-auth.guard.js';

function makeContext(signedCookies: Record<string, string> = {}) {
  const request: {
    signedCookies: Record<string, string>;
    address?: string;
    sessionId?: string;
  } = { signedCookies };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('SessionAuthGuard', () => {
  it('rejects a request with no session cookie', async () => {
    const authService = { getSession: vi.fn() };
    const guard = new SessionAuthGuard(authService as unknown as AuthService);
    const { context } = makeContext();
    await expect(guard.canActivate(context)).rejects.toThrow();
    expect(authService.getSession).not.toHaveBeenCalled();
  });

  it('rejects an expired/unknown session', async () => {
    const authService = { getSession: vi.fn().mockResolvedValue(null) };
    const guard = new SessionAuthGuard(authService as unknown as AuthService);
    const { context } = makeContext({ [SESSION_COOKIE]: 'sess-1' });
    await expect(guard.canActivate(context)).rejects.toThrow();
  });

  it('allows a live session and attaches the address + session id to the request', async () => {
    const session = {
      id: 'sess-1',
      address: '0xabc',
      expiresAt: new Date(Date.now() + 60_000),
    };
    const authService = { getSession: vi.fn().mockResolvedValue(session) };
    const guard = new SessionAuthGuard(authService as unknown as AuthService);
    const { context, request } = makeContext({ [SESSION_COOKIE]: 'sess-1' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.address).toBe('0xabc');
    expect(request.sessionId).toBe('sess-1');
    expect(authService.getSession).toHaveBeenCalledWith('sess-1');
  });
});
