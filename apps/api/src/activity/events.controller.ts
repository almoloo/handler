import {
  Controller,
  Req,
  Sse,
  UseGuards,
  type MessageEvent,
} from '@nestjs/common';
import type { Request } from 'express';
import { defer, from, EMPTY, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ActivityService } from './activity.service.js';

/** `GET /events/stream` lives under its own `/events` prefix per
 * backend-roadmap.md §5's API surface — a sibling of `/activity`, not
 * nested under it. */
@Controller('events')
export class EventsController {
  constructor(private readonly activity: ActivityService) {}

  @Sse('stream')
  @UseGuards(SessionAuthGuard)
  stream(@Req() req: Request): Observable<MessageEvent> {
    const header = req.headers['last-event-id'];
    const lastEventId = Array.isArray(header) ? header[0] : header;

    return defer(() =>
      from(this.activity.walletAddressForOwner(req.address!)),
    ).pipe(
      switchMap((walletAddress) => {
        // No wallet yet: stay connected but never emit, rather than erroring —
        // mirrors GET /agents's empty-not-error treatment for a fresh sign-in.
        if (!walletAddress) return EMPTY;
        return defer(() =>
          from(
            this.activity.resolveStartingCursor(walletAddress, lastEventId),
          ),
        ).pipe(
          switchMap((cursor) =>
            this.activity.streamForWallet(walletAddress, cursor),
          ),
        );
      }),
    );
  }
}
