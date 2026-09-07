import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChainModule } from '../chain/chain.module.js';
import { PoliciesModule } from '../policies/policies.module.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import { OneInchService } from './oneinch.service.js';

/**
 * Frozen session interface (backend-roadmap day 3, coordination note): every
 * catalog agent in this module owns its own session-key `viem` signer and calls
 * `HandlerWallet.tryExecute({ target, data, value })` directly, signed by that
 * key — never `execute()` (a block must be an event, not a revert) and never
 * routed through a shared, API-held signer. Any future catalog agent
 * (subcontractor, villain) follows this same shape.
 */
@Module({
  imports: [ChainModule, AuthModule, PoliciesModule],
  controllers: [AgentsController],
  providers: [AgentsService, OneInchService],
  exports: [AgentsService],
})
export class AgentsModule {}
