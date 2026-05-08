import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LedgerService } from './ledger.service';

@UseGuards(JwtAuthGuard)
@Controller('ledger')
export class LedgerController {
  constructor(private ledger: LedgerService) {}

  @Get('today')
  today() { return this.ledger.todaySummary(); }
}
