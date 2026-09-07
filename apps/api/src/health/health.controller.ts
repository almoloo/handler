import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    // A plain liveness probe, not a table-specific one — must keep working if the
    // hackathon-only demo tables are ever dropped (see context/ai-interaction.md
    // "Product Integrity").
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
