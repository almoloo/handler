import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createWalletClient, http, type Address } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { parseChainEnv } from '../chain/chain.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgentKind } from '../generated/prisma/enums.js';
import { parseAgentsEnv, type AgentsEnv } from './agents.config.js';

const RILEY_NAME = 'Riley';
const RILEY_DESCRIPTION = 'A catalog agent with no live actions yet.';
const RILEY_KEY_ENV_VAR = 'RILEY_SESSION_KEY';

/**
 * Holds Riley's own session-key signer (never the owner's key) and self-registers
 * Riley's real catalog identity. Frozen session interface (backend-roadmap day 3):
 * every catalog agent owns its own signer and calls `tryExecute` directly against
 * `HandlerWallet` — see agents.module.ts. Riley has no run action yet — a real
 * payment target (the subcontractor agent) isn't built — but its signer and
 * catalog registration stay live: it's the key the Ledger Key Ring secret-custody
 * story (backend-roadmap §4.2) is built around.
 */
@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly logger = new Logger(AgentsService.name);
  private readonly env: AgentsEnv;
  private readonly rileyAccount: PrivateKeyAccount;
  readonly rileyWalletClient: ReturnType<typeof createWalletClient>;

  constructor(private readonly prisma: PrismaService) {
    this.env = parseAgentsEnv();
    this.rileyAccount = privateKeyToAccount(
      this.env.RILEY_SESSION_KEY as `0x${string}`,
    );
    this.rileyWalletClient = createWalletClient({
      account: this.rileyAccount,
      transport: http(parseChainEnv().CHAIN_RPC_URL),
    });
  }

  get rileyAddress(): Address {
    return this.rileyAccount.address;
  }

  /** Resolves the session's `HandlerWallet` address from the owner's SIWE
   * address, or `null` if this owner hasn't hired anyone yet (no `Wallet` row).
   * One `HandlerWallet` per owner (backend-roadmap.md §3). */
  async walletAddressForOwner(ownerAddress: string): Promise<string | null> {
    const wallet = await this.prisma.wallet.findFirst({
      where: { owner: ownerAddress },
    });
    return wallet?.address ?? null;
  }

  async onModuleInit() {
    const address = this.rileyAddress.toLowerCase();
    await this.prisma.agent.upsert({
      where: { address },
      update: {
        name: RILEY_NAME,
        description: RILEY_DESCRIPTION,
        kind: AgentKind.HIRED,
        keyEnvVar: RILEY_KEY_ENV_VAR,
      },
      create: {
        address,
        name: RILEY_NAME,
        description: RILEY_DESCRIPTION,
        kind: AgentKind.HIRED,
        keyEnvVar: RILEY_KEY_ENV_VAR,
      },
    });
    this.logger.log(`Riley session key: ${this.rileyAddress}`);
  }
}
