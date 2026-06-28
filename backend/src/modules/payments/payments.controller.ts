import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaymentKind, PaymentMode, Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';

class RecordPaymentDto {
  @IsUUID() patientId!: string;
  @IsEnum(PaymentKind) kind!: PaymentKind;
  @IsEnum(PaymentMode) mode!: PaymentMode;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() date?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Post()
  record(@Body() dto: RecordPaymentDto, @CurrentUser() user: any) {
    return this.payments.record({ ...dto, createdById: user?.id ?? null });
  }

  @Get()
  listByDate(@Query('date') date?: string) {
    return this.payments.listByDate(date);
  }

  @Get('patient/:patientId')
  listByPatient(@Param('patientId') patientId: string) {
    return this.payments.listByPatient(patientId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.payments.remove(id);
  }
}
