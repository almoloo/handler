import { Module } from '@nestjs/common';
import { ChainModule } from '../chain/chain.module.js';
import { TrustService } from './trust.service.js';

@Module({
  imports: [ChainModule],
  providers: [TrustService],
  exports: [TrustService],
})
export class TrustModule {}
