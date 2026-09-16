import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { TeaCoffeeController } from './tea-coffee.controller';
import { TeaCoffeeService } from './tea-coffee.service';

@Module({
  imports: [PrismaModule, ExpensesModule],
  controllers: [TeaCoffeeController],
  providers: [TeaCoffeeService],
})
export class TeaCoffeeModule {}
