import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ApprovalsService } from './approvals.service.js';

@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  /** The approval sheet's data. 404s for an unknown id and for one
   * belonging to a wallet the session doesn't own — identically, so the
   * response never discloses which case it was. */
  @Get(':id')
  @UseGuards(SessionAuthGuard)
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const walletAddress = await this.approvals.walletAddressForOwner(
      req.address!,
    );
    return this.approvals.findForWallet(walletAddress, id);
  }
}
