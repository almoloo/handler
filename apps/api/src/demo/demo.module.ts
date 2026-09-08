import { Module } from '@nestjs/common';
import { ChainModule } from '../chain/chain.module.js';
import { VillainService } from './villain.service.js';

/**
 * Operator tooling home (backend-roadmap.md §4.2/§4.6): `VillainService`
 * lives here rather than `agents/` since it's "an adversarial test actor,
 * not a product agent." No controller yet — `POST /demo/beat/:n`,
 * `POST /demo/reset`, and `DEMO_ENABLED`/`DEMO_TOKEN` gating are backend
 * day 7's own feature. `VillainService` itself is not gated: its existence
 * and cron-driven `run()` are real product code, only the (not-yet-built)
 * operator trigger endpoints are demo-gated.
 */
@Module({
  imports: [ChainModule],
  providers: [VillainService],
  exports: [VillainService],
})
export class DemoModule {}
