import { Module } from '@nestjs/common';
import { CashAddedService } from './cash-added.service';
import { CashAddedController } from './cash-added.controller';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  controllers: [CashAddedController],
  providers: [CashAddedService],
})
export class CashAddedModule {}
