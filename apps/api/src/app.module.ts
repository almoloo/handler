import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AgentsModule } from './agents/agents.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { IndexerModule } from './indexer/indexer.module.js';
import { TrustModule } from './trust/trust.module.js';
import { ActivityModule } from './activity/activity.module.js';
import { ApprovalsModule } from './approvals/approvals.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AgentsModule,
    HealthModule,
    IndexerModule,
    TrustModule,
    ActivityModule,
    ApprovalsModule,
  ],
})
export class AppModule {}
