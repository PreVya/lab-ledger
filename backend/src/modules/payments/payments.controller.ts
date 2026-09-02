import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { PaymentKind, PaymentMode } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';

class RecordPaymentDto {
  @IsUUID() patientId!: string;
  @IsEnum(PaymentKind) kind!: PaymentKind;
  @IsEnum(PaymentMode) mode!: PaymentMode;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() notes?: string;
  /** REQUIRED — payment date is never inferred from the system clock. */
  @IsString() date!: string;
}

class UpdatePaymentDto {
  @IsOptional() @IsEnum(PaymentKind) kind?: PaymentKind;
  @IsOptional() @IsEnum(PaymentMode) mode?: PaymentMode;
  @IsOptional() @IsNumber() @Min(0.01) amount?: number;
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

  // Clean legacy [form-sync delta] correction artefacts. Declared before ':id'.
  @Post('cleanup-deltas')
  cleanup() {
    return this.payments.cleanupDeltas();
  }

  @Get()
  listByDate(@Query('date') date?: string) {
    return this.payments.listByDate(date);
  }

  @Get('patient/:patientId')
  listByPatient(@Param('patientId') patientId: string) {
    return this.payments.listByPatient(patientId);
  }

  /** Netted history + net / totalPaid / pending summary. */
  @Get('history/:patientId')
  history(@Param('patientId') patientId: string) {
    return this.payments.history(patientId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    return this.payments.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.payments.remove(id);
  }
}
