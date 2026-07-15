import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TestsModule } from './modules/tests/tests.module';
import { PatientsModule } from './modules/patients/patients.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CashHandoverModule } from './modules/cash-handover/cash-handover.module';
import { CashAddedModule } from './modules/cash-added/cash-added.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { SalaryModule } from './modules/salary/salary.module';
import { StorageModule } from './modules/storage/storage.module';
import { HolidaysModule } from './modules/holidays/holidays.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    TestsModule,
    PatientsModule,
    LedgerModule,
    ExpensesModule,
    PaymentsModule,
    CashHandoverModule,
    CashAddedModule,
    AppointmentsModule,
    EmployeesModule,
    AttendanceModule,
    SalaryModule,
    StorageModule,
    HolidaysModule,
  ],
})
export class AppModule {}
