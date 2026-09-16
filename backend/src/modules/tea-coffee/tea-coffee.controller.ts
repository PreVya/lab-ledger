import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TeaCoffeeItem } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { TeaCoffeeService } from './tea-coffee.service';

class CreateEntryDto {
  @IsOptional() @IsString() date?: string;
  @IsString() employeeId!: string;
  @IsEnum(TeaCoffeeItem) item!: TeaCoffeeItem;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) rate?: number;
}

class UpdateEntryDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsEnum(TeaCoffeeItem) item?: TeaCoffeeItem;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) rate?: number;
}

class UpdateRateDto {
  @IsEnum(TeaCoffeeItem) item!: TeaCoffeeItem;
  @IsNumber() @Min(0) rate!: number;
  @IsOptional() @IsString() effectiveFrom?: string;
}

class MarkPaidDto {
  @IsString() billMonth!: string;
  @IsString() paidDate!: string;
  @IsOptional() @IsNumber() @Min(0) paidAmount?: number;
  @IsOptional() @IsString() notes?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('tea-coffee')
export class TeaCoffeeController {
  constructor(private svc: TeaCoffeeService) {}

  @Get('rates') rates() { return this.svc.rates(); }
  @Put('rates') updateRate(@Body() dto: UpdateRateDto) {
    return this.svc.updateRate(dto.item, dto.rate, dto.effectiveFrom);
  }

  @Get('entries') entries(@Query('date') date?: string) { return this.svc.listEntries(date); }

  @Post('entries')
  createEntry(@Body() dto: CreateEntryDto, @CurrentUser() user: JwtUser) {
    return this.svc.createEntry({ ...dto, createdById: user?.sub ?? null });
  }

  @Put('entries/:id')
  updateEntry(@Param('id') id: string, @Body() dto: UpdateEntryDto) {
    return this.svc.updateEntry(id, dto);
  }

  @Delete('entries/:id')
  removeEntry(@Param('id') id: string) { return this.svc.removeEntry(id); }

  @Get('monthly-bill')
  monthlyBill(@Query('month') month: string) { return this.svc.monthlyBill(month); }

  @Post('monthly-bill/mark-paid')
  markPaid(@Body() dto: MarkPaidDto) { return this.svc.markPaid(dto); }
}
