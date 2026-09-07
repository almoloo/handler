import { Injectable } from '@nestjs/common';
import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { handlerWalletAbi } from '@handler/contracts';
import { parseChainEnv, resolveHandlerWalletAddress } from './chain.config.js';

@Injectable()
export class ChainService {
  readonly publicClient: PublicClient;
  readonly chainId: number;
  readonly handlerWalletAddress: Address;
  readonly handlerWalletAbi: typeof handlerWalletAbi = handlerWalletAbi;

  constructor() {
    const env = parseChainEnv();
    this.chainId = env.CHAIN_ID;
    this.handlerWalletAddress = resolveHandlerWalletAddress(env.CHAIN_ID);
    this.publicClient = createPublicClient({
      transport: http(env.CHAIN_RPC_URL),
    });
  }
}
