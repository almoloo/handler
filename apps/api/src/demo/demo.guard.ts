import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Request } from 'express';
import { parseDemoEnv, type DemoEnv } from './demo.config.js';

/** The header the `/demo` director sends its shared secret in. */
export const DEMO_TOKEN_HEADER = 'x-demo-token';

/**
 * Gates the demo director's routes (backend-roadmap §4.6). Three checks, in
 * order:
 *
 * 1. `DEMO_ENABLED` off → `404`, not `403`. The operator tooling must not
 *    exist for anyone else; a `403` would confirm the route is there.
 * 2. The session's address (attached upstream by `SessionAuthGuard`, which
 *    must run first) is the showcase wallet's owner → else `403`.
 * 3. The `x-demo-token` header matches `DEMO_TOKEN` → else `403`.
 *
 * Neither the expected token nor the owner address ever appears in a message:
 * a rejected caller learns only that it was rejected.
 */
@Injectable()
export class DemoGuard implements CanActivate {
  private readonly env: DemoEnv;

  // Not a Nest provider: `@Optional()` makes Nest pass `undefined` so the
  // default runs, while tests hand in an env object directly.
  constructor(@Optional() env: DemoEnv = parseDemoEnv()) {
    this.env = env;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.env.enabled) {
      throw new NotFoundException();
    }

    const request = context.switchToHttp().getRequest<Request>();

    const address = request.address;
    if (
      !address ||
      address.toLowerCase() !== this.env.DEMO_OWNER_ADDRESS.toLowerCase()
    ) {
      throw new ForbiddenException();
    }

    const header = request.headers[DEMO_TOKEN_HEADER];
    if (typeof header !== 'string' || !matches(header, this.env.DEMO_TOKEN)) {
      throw new ForbiddenException();
    }

    return true;
  }
}

/** Constant-time string compare. `timingSafeEqual` throws on a length
 * mismatch, so the lengths are compared first — that leaks the token's
 * length and nothing else. */
function matches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
