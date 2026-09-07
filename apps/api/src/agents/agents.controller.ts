import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { AgentsService } from './agents.service.js';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post(':id/run')
  @UseGuards(SessionAuthGuard)
  run(@Param('id') id: string, @Req() req: Request) {
    return this.agents.run(req.address!, id);
  }
}
