import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ApprovalsController } from './approvals.controller.js';
import { ApprovalsService } from './approvals.service.js';

/** Read-only serve module for the approval sheet (backend-roadmap.md §5).
 * Depends on Prisma (global) and Auth (for `SessionAuthGuard`) only — never
 * `ChainModule`/`AgentsModule` — per coding-standards.md's module
 * dependency rule, same class as `activity`/`policies`. */
@Module({
  imports: [AuthModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
