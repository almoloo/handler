import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { DemoGuard } from './demo.guard.js';
import { DemoService, isBeatNumber } from './demo.service.js';

/**
 * The demo director's operator routes (backend-roadmap §4.6). Never linked
 * from the app, and 404 unless `DEMO_ENABLED=true`.
 *
 * Guard order matters: `SessionAuthGuard` runs first so `DemoGuard` has the
 * session's address to check against `DEMO_OWNER_ADDRESS`.
 */
@Controller('demo')
@UseGuards(SessionAuthGuard, DemoGuard)
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  /**
   * Triggers one beat against the showcase wallet and returns its finished
   * `DemoRun`. A beat that failed on-chain or in flight still comes back
   * `200` with `status: FAILED` and the reason — the operator needs to read
   * it mid-take. `409` while another beat is running, `422` when the
   * showcase owner has no wallet yet.
   */
  @Post('beat/:n')
  runBeat(@Param('n') n: string) {
    // Matched as a literal digit rather than via Number(), which also accepts
    // '0x1', '1e0' and ' 1 '.
    if (!/^[0-9]+$/.test(n)) {
      throw new BadRequestException('Beat must be 1, 2 or 3.');
    }
    const beat = Number(n);
    if (!isBeatNumber(beat)) {
      throw new BadRequestException('Beat must be 1, 2 or 3.');
    }
    return this.demo.runBeat(beat);
  }
}
