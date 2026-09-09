import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ChainModule } from '../chain/chain.module.js';
import { DemoController } from './demo.controller.js';
import { DemoService } from './demo.service.js';
import { VillainService } from './villain.service.js';

/**
 * Operator tooling home (backend-roadmap.md §4.2/§4.6): `VillainService`
 * lives here rather than `agents/` since it's "an adversarial test actor,
 * not a product agent."
 *
 * The module registers unconditionally and the **controller** is what
 * `DEMO_ENABLED` gates (via `DemoGuard`, which 404s when off). §4.6
 * originally called for gating the whole module, but `VillainService`'s
 * existence and cron-driven `run()` are real product code — module-gating
 * would silently remove the villain from any deployment without the flag.
 * Only the operator trigger routes are demo-gated.
 */
@Module({
  imports: [AuthModule, ChainModule, AgentsModule],
  controllers: [DemoController],
  providers: [DemoService, VillainService],
  exports: [VillainService],
})
export class DemoModule {}
