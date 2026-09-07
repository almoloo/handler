import { Injectable } from '@nestjs/common';
import type { Address, Hex } from 'viem';
import { parseAgentsEnv, type AgentsEnv } from './agents.config.js';

/** 1inch's pseudo-address for native ETH as a swap side. */
const NATIVE_ETH_PSEUDO_ADDRESS: Address =
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export interface OneInchSwapQuote {
  to: Address;
  data: Hex;
  value: bigint;
  raw: unknown;
}

/**
 * Real 1inch Swap API client for Riley's fixed rebalance pair (native ETH -> the
 * configured token). No mock/fallback quote — a failed 1inch call throws.
 */
@Injectable()
export class OneInchService {
  private readonly env: AgentsEnv;

  constructor() {
    this.env = parseAgentsEnv();
  }

  /**
   * `walletAddress` must be the `HandlerWallet` that will spend the funds — inside
   * `tryExecute()`, the swap's low-level call runs with the wallet contract as
   * `msg.sender`, never Riley's own session-key EOA. The quote's calldata is only
   * valid for the `from` address it was built for.
   */
  async getSwapQuote(walletAddress: Address): Promise<OneInchSwapQuote> {
    const url = new URL(
      `https://api.1inch.dev/swap/v6.0/${this.env.ONEINCH_CHAIN_ID}/swap`,
    );
    url.searchParams.set('src', NATIVE_ETH_PSEUDO_ADDRESS);
    url.searchParams.set('dst', this.env.RILEY_SWAP_TOKEN_OUT);
    url.searchParams.set('amount', this.env.RILEY_SWAP_AMOUNT_WEI);
    url.searchParams.set('from', walletAddress);
    url.searchParams.set('slippage', '1');
    url.searchParams.set('disableEstimate', 'true');

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.env.ONEINCH_API_KEY}` },
    });
    if (!response.ok) {
      throw new Error(
        `1inch swap quote failed: ${response.status} ${await response.text()}`,
      );
    }

    const body = (await response.json()) as {
      tx: { to: Address; data: Hex; value: string };
    };
    return {
      to: body.tx.to,
      data: body.tx.data,
      value: BigInt(body.tx.value),
      raw: body,
    };
  }
}
