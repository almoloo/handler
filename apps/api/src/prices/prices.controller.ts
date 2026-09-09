import { Controller, Get } from '@nestjs/common';
import { PricesService } from './prices.service.js';

/**
 * Public — one of the three routes with no `SessionAuthGuard`
 * (backend-roadmap §5: `/health`, `/prices`, `/auth/*`). USD-8 fixed-point
 * conversions for ETH and USDC, cached 30s; see `PricesService` for the
 * staleness/fallback rules.
 */
@Controller('prices')
export class PricesController {
  constructor(private readonly prices: PricesService) {}

  @Get()
  getPrices() {
    return this.prices.getPrices();
  }
}
