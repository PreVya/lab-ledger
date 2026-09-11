import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength,
} from 'class-validator';
import { Role, Sex } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { PatientsService } from './patients.service';

class UpsertPatientDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() mobile!: string;
  // Legacy single age (years) — still accepted for back-compat; ignored if ageValue is given.
  @IsOptional() @IsInt() @Min(0) age?: number;
  @IsOptional() @IsInt() @Min(0) ageValue?: number;
  @IsOptional() @IsIn(['days', 'months', 'years']) ageUnit?: 'days' | 'months' | 'years';
  @IsEnum(Sex) sex!: Sex;
  @IsOptional() @IsString() referredDoctor?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) testIds!: string[];
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsNumber() @Min(0) advanceCash?: number;
  @IsOptional() @IsNumber() @Min(0) advanceUpi?: number;
  @IsOptional() @IsString() advancePaidOn?: string;
  @IsOptional() @IsNumber() @Min(0) balanceCash?: number;
  @IsOptional() @IsNumber() @Min(0) balanceUpi?: number;
  @IsOptional() @IsString() balancePaidOn?: string;
  @IsOptional() @IsString() entryDate?: string;
  /** Manual tracking flags — stored only, no automation attached. */
  @IsOptional() @IsBoolean() whatsappReportRequired?: boolean;
  @IsOptional() @IsBoolean() outsourcedReportReady?: boolean;
  /**
   * Explicit payment transactions from the Payment Transactions UI (create only).
   * When present, Payment rows come ONLY from here — never combined with the
   * legacy advance/balance bucket fields above.
   */
  @IsOptional() @IsArray() payments?: Array<{
    kind: 'advance' | 'balance';
    mode: 'cash' | 'upi' | 'card' | 'other';
    amount: number;
    date: string;
    notes?: string | null;
  }>;
}


@UseGuards(JwtAuthGuard)
@Controller('patients')
export class PatientsController {
  constructor(private patients: PatientsService) {}

  @Post()
  create(@Body() dto: UpsertPatientDto, @CurrentUser() user: JwtUser) {
    if (!user?.sub) throw new BadRequestException('Auth context missing');
    return this.patients.create({ ...dto, createdById: user.sub });
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpsertPatientDto) {
    return this.patients.update(id, dto);
  }

  @Get('search')
  search(@Query('q') q: string, @Query('fy') fy?: string) { return this.patients.search(q ?? '', fy); }

  /** Highest register number in a financial year — drives the delete-latest-only rule in the UI. */
  @Get('latest-register')
  latestRegister(@Query('fy') fy: string) {
    if (!fy) throw new BadRequestException('fy is required');
    return this.patients.latestRegister(fy);
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.patients.get(id); }

  /** Hard delete — rejected unless this is the latest register entry of its FY. */
  @Delete(':id')
  remove(@Param('id') id: string) { return this.patients.remove(id); }
}
