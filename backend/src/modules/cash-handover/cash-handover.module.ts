import { Module } from '@nestjs/common';
import { CashHandoverService } from './cash-handover.service';
import { CashHandoverController } from './cash-handover.controller';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  controllers: [CashHandoverController],
  providers: [CashHandoverService],
})
export class CashHandoverModule {}
