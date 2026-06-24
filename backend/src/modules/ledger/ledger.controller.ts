import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LedgerService, parseDateOnly } from './ledger.service';

@UseGuards(JwtAuthGuard)
@Controller('ledger')
export class LedgerController {
  constructor(private ledger: LedgerService) {}

  @Get('today')
  today() {
    return this.ledger.summary();
  }

  // GET /api/ledger?date=YYYY-MM-DD  (omit ?date for today)
  @Get()
  byDate(@Query('date') date?: string) {
    const day = date ? parseDateOnly(date) : undefined;
    return this.ledger.summary(day);
  }
}
