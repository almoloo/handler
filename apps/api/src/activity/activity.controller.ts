import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ActivityService } from './activity.service.js';

const activityQuerySchema = z.object({
  filter: z.string().default('all'),
  before: z.coerce.bigint().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  /** Paginated feed for the session's wallet. `[]`/`nextCursor: null` for a
   * fresh sign-in with no `hireAgent` tx yet — not an error, same rule as
   * `GET /agents`. */
  @Get()
  @UseGuards(SessionAuthGuard)
  async list(@Query() query: unknown, @Req() req: Request) {
    const parsed = activityQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException('Invalid query parameters');
    }
    const type = this.activity.parseFilter(parsed.data.filter);

    const walletAddress = await this.activity.walletAddressForOwner(
      req.address!,
    );
    if (!walletAddress) {
      return { items: [], nextCursor: null };
    }

    return this.activity.listForWallet(walletAddress, {
      type,
      before: parsed.data.before,
      limit: parsed.data.limit,
    });
  }
}
