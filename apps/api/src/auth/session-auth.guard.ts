import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';

export const SESSION_COOKIE = 'handler_session';

declare global {
  namespace Express {
    interface Request {
      /** Set by SessionAuthGuard once a live session cookie has been resolved. */
      address?: string;
      /** Set by SessionAuthGuard; the raw session id, for logout/revocation. */
      sessionId?: string;
    }
  }
}

/**
 * Gates a write route behind a live session cookie. On success, attaches the
 * authenticated address and session id to the request for the route handler
 * to use (`request.address`, `request.sessionId`).
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionId = request.signedCookies?.[SESSION_COOKIE] as
      | string
      | undefined;
    if (!sessionId) {
      throw new UnauthorizedException();
    }
    const session = await this.authService.getSession(sessionId);
    if (!session) {
      throw new UnauthorizedException();
    }
    request.address = session.address;
    request.sessionId = sessionId;
    return true;
  }
}
