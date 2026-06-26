import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsNumber, IsString, Min } from 'class-validator';
import { PaymentMode, Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ExpensesService } from './expenses.service';

class CreateExpenseDto {
  @IsString() description!: string;
  @IsNumber() @Min(0) amount!: number;
  @IsEnum(PaymentMode) mode!: PaymentMode;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin, Role.receptionist)
@Controller('expenses')
export class ExpensesController {
  constructor(private expenses: ExpensesService) {}

  @Post() create(@Body() dto: CreateExpenseDto) { return this.expenses.create(dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.expenses.remove(id); }
}
