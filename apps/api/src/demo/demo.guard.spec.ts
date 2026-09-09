import { describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { DemoEnv } from './demo.config.js';
import { DEMO_TOKEN_HEADER, DemoGuard } from './demo.guard.js';

const OWNER = '0xAAaAaAAAAaaaAaAAaAaaAAAAAaAAaAAaAaAAAAAa';
const TOKEN = 'a-long-enough-demo-token';

const ENABLED_ENV: DemoEnv = {
  enabled: true,
  DEMO_TOKEN: TOKEN,
  DEMO_OWNER_ADDRESS: OWNER,
  DEMO_COSIGN_PAYMENT_WEI: 20000000000000000n,
};

function makeContext(
  address: string | undefined,
  headers: Record<string, string> = {},
) {
  const request = { address, headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('DemoGuard', () => {
  it('404s when the director is disabled, before looking at the request', () => {
    const guard = new DemoGuard({ enabled: false });
    expect(() =>
      guard.canActivate(
        makeContext(OWNER, { [DEMO_TOKEN_HEADER]: TOKEN }),
      ),
    ).toThrow(NotFoundException);
  });

  it('403s a session that is not the showcase owner', () => {
    const guard = new DemoGuard(ENABLED_ENV);
    expect(() =>
      guard.canActivate(
        makeContext('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', {
          [DEMO_TOKEN_HEADER]: TOKEN,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('403s when no session address was attached upstream', () => {
    const guard = new DemoGuard(ENABLED_ENV);
    expect(() =>
      guard.canActivate(makeContext(undefined, { [DEMO_TOKEN_HEADER]: TOKEN })),
    ).toThrow(ForbiddenException);
  });

  it('403s when the token header is missing', () => {
    const guard = new DemoGuard(ENABLED_ENV);
    expect(() => guard.canActivate(makeContext(OWNER))).toThrow(
      ForbiddenException,
    );
  });

  it('403s a wrong token of the same length', () => {
    const guard = new DemoGuard(ENABLED_ENV);
    const wrong = 'b'.repeat(TOKEN.length);
    expect(() =>
      guard.canActivate(makeContext(OWNER, { [DEMO_TOKEN_HEADER]: wrong })),
    ).toThrow(ForbiddenException);
  });

  it('403s a token that is a prefix of the real one', () => {
    const guard = new DemoGuard(ENABLED_ENV);
    expect(() =>
      guard.canActivate(
        makeContext(OWNER, { [DEMO_TOKEN_HEADER]: TOKEN.slice(0, -1) }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows the showcase owner with the right token', () => {
    const guard = new DemoGuard(ENABLED_ENV);
    expect(
      guard.canActivate(makeContext(OWNER, { [DEMO_TOKEN_HEADER]: TOKEN })),
    ).toBe(true);
  });

  it('matches the owner address case-insensitively', () => {
    const guard = new DemoGuard(ENABLED_ENV);
    expect(
      guard.canActivate(
        makeContext(OWNER.toLowerCase(), { [DEMO_TOKEN_HEADER]: TOKEN }),
      ),
    ).toBe(true);
  });

  it('never leaks the expected token or owner address in a rejection', () => {
    const guard = new DemoGuard(ENABLED_ENV);
    try {
      guard.canActivate(makeContext(OWNER, { [DEMO_TOKEN_HEADER]: 'nope' }));
      expect.unreachable('should have thrown');
    } catch (error) {
      const message = JSON.stringify(
        (error as ForbiddenException).getResponse(),
      );
      expect(message).not.toContain(TOKEN);
      expect(message.toLowerCase()).not.toContain(OWNER.toLowerCase());
    }
  });
});
