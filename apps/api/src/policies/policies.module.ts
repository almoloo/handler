import { Module } from '@nestjs/common';
import { PoliciesService } from './policies.service.js';

/** Read-only mirror of on-chain policy state. Depends on Prisma only — never
 * `ChainModule` (`PrismaService` is global, so no explicit import is needed
 * here) — per coding-standards.md's module dependency rule. */
@Module({
  providers: [PoliciesService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
