import { Injectable, UnauthorizedException } from '@nestjs/common';
import { isAddress } from 'viem';
import { generateNonce, SiweMessage } from 'siwe';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseAuthEnv, type AuthEnv } from './auth.config.js';

export interface AuthSession {
  id: string;
  address: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly env: AuthEnv;

  constructor(private readonly prisma: PrismaService) {
    this.env = parseAuthEnv();
  }

  /** Session cookie lifetime in ms, for callers that need to set `maxAge`. */
  get sessionTtlMs(): number {
    return this.env.SESSION_TTL_SECONDS * 1000;
  }

  /** Issues a fresh SIWE nonce for `address`, persisted for later verification. */
  async issueNonce(address: string): Promise<string> {
    if (!isAddress(address)) {
      throw new UnauthorizedException('Invalid address');
    }
    const nonce = generateNonce();
    await this.prisma.siweNonce.create({
      data: {
        nonce,
        address: address.toLowerCase(),
        expiresAt: new Date(Date.now() + this.env.SIWE_NONCE_TTL_SECONDS * 1000),
      },
    });
    return nonce;
  }

  /** Verifies a signed SIWE message against its stored nonce and starts a session. */
  async verify(message: string, signature: string): Promise<AuthSession> {
    let siwe: SiweMessage;
    try {
      siwe = new SiweMessage(message);
    } catch {
      throw new UnauthorizedException('Malformed SIWE message');
    }

    const address = siwe.address.toLowerCase();
    // Atomically claim the nonce (single UPDATE guarded by consumedAt/expiresAt) so two
    // concurrent verify() calls for the same nonce can't both pass and each start a session.
    const claim = await this.prisma.siweNonce.updateMany({
      where: {
        nonce: siwe.nonce,
        address,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (claim.count !== 1) {
      throw new UnauthorizedException('Invalid or expired nonce');
    }

    const result = await siwe.verify(
      { signature, nonce: siwe.nonce },
      { suppressExceptions: true },
    );
    if (!result.success) {
      throw new UnauthorizedException('Invalid SIWE signature');
    }

    return this.prisma.session.create({
      data: {
        address,
        expiresAt: new Date(Date.now() + this.env.SESSION_TTL_SECONDS * 1000),
      },
    });
  }

  /** Resolves a session id to its live session, or null if missing/expired. */
  async getSession(sessionId: string): Promise<AuthSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.expiresAt < new Date()) {
      return null;
    }
    return session;
  }

  /** Revokes a session (logout). No-op if it doesn't exist. */
  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }
}
