import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE, SessionAuthGuard } from './session-auth.guard.js';

const nonceBodySchema = z.object({ address: z.string() });
const verifyBodySchema = z.object({
  message: z.string(),
  signature: z.string(),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('nonce')
  async nonce(@Body() body: unknown): Promise<{ nonce: string }> {
    const parsed = nonceBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid request body');
    }
    const nonce = await this.authService.issueNonce(parsed.data.address);
    return { nonce };
  }

  @Post('verify')
  async verify(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ address: string }> {
    const parsed = verifyBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid request body');
    }
    const session = await this.authService.verify(
      parsed.data.message,
      parsed.data.signature,
    );
    res.cookie(SESSION_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: true,
      maxAge: this.authService.sessionTtlMs,
    });
    return { address: session.address };
  }

  @Get('session')
  @UseGuards(SessionAuthGuard)
  session(@Req() req: Request): { address: string } {
    return { address: req.address! };
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    await this.authService.revoke(req.sessionId!);
    res.clearCookie(SESSION_COOKIE);
    return { ok: true };
  }
}
