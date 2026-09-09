import { Module } from '@nestjs/common';
import { ChainModule } from '../chain/chain.module.js';
import { PricesController } from './prices.controller.js';
import { PricesService } from './prices.service.js';

@Module({
  imports: [ChainModule],
  controllers: [PricesController],
  providers: [PricesService],
})
export class PricesModule {}
