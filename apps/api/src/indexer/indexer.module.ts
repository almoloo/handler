import { Module } from '@nestjs/common';
import { ChainModule } from '../chain/chain.module.js';
import { IndexerService } from './indexer.service.js';

@Module({
  imports: [ChainModule],
  providers: [IndexerService],
})
export class IndexerModule {}
