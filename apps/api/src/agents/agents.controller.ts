import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { PoliciesService } from '../policies/policies.service.js';
import { AgentsService } from './agents.service.js';

@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly policies: PoliciesService,
  ) {}

  /** Payroll list for the session's wallet. `[]` for a fresh sign-in with no
   * `hireAgent` tx yet — not an error. */
  @Get()
  @UseGuards(SessionAuthGuard)
  async list(@Req() req: Request) {
    const walletAddress = await this.agents.walletAddressForOwner(req.address!);
    if (!walletAddress) return [];
    return this.policies.listForWallet(walletAddress);
  }

  /** Hireable catalog agents (hire picker step 1). Declared before `:id` so
   * Express's route-registration-order matching doesn't swallow it as an id. */
  @Get('catalog')
  @UseGuards(SessionAuthGuard)
  catalog() {
    return this.policies.catalog();
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  async agentFile(@Param('id') id: string, @Req() req: Request) {
    const walletAddress = await this.agents.walletAddressForOwner(req.address!);
    return this.policies.agentFile(walletAddress, id);
  }

  @Post(':id/run')
  @UseGuards(SessionAuthGuard)
  run(@Param('id') id: string, @Req() req: Request) {
    return this.agents.run(req.address!, id);
  }
}
