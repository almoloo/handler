import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ActivityController } from './activity.controller.js';
import { EventsController } from './events.controller.js';
import { ActivityService } from './activity.service.js';

/** REST + SSE serving the feed (backend-roadmap.md §2 module map). Depends on
 * Prisma (global) and Auth (for `SessionAuthGuard`) only — never
 * `ChainModule`/`AgentsModule` — per coding-standards.md's module
 * dependency rule. */
@Module({
  imports: [AuthModule],
  controllers: [ActivityController, EventsController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
