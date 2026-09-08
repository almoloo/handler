import { Injectable } from '@nestjs/common';
import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { handlerWalletAbi, handlerWalletFactoryAbi } from '@handler/contracts';
import {
  parseChainEnv,
  resolveHandlerWalletAddress,
  resolveHandlerWalletFactoryAddress,
} from './chain.config.js';

@Injectable()
export class ChainService {
  readonly publicClient: PublicClient;
  readonly chainId: number;
  readonly handlerWalletAddress: Address;
  readonly handlerWalletAbi: typeof handlerWalletAbi = handlerWalletAbi;
  /** Null on a chain where HandlerWalletFactory hasn't been deployed yet — see
   * resolveHandlerWalletFactoryAddress. */
  readonly handlerWalletFactoryAddress: Address | null;
  readonly handlerWalletFactoryAbi: typeof handlerWalletFactoryAbi =
    handlerWalletFactoryAbi;

  constructor() {
    const env = parseChainEnv();
    this.chainId = env.CHAIN_ID;
    this.handlerWalletAddress = resolveHandlerWalletAddress(env.CHAIN_ID);
    this.handlerWalletFactoryAddress = resolveHandlerWalletFactoryAddress(
      env.CHAIN_ID,
    );
    this.publicClient = createPublicClient({
      transport: http(env.CHAIN_RPC_URL),
    });
  }
}
