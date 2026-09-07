import { Module } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [LedgerModule, PaymentsModule],
  providers: [PatientsService],
  controllers: [PatientsController],
})
export class PatientsModule {}
