import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ArrayNotEmpty, IsArray, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { AttendanceStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';

class BulkEntryDto {
  @IsString() employeeId!: string;
  @IsEnum(AttendanceStatus) status!: AttendanceStatus;
  @IsOptional() @IsString() notes?: string;
}

class BulkAttendanceDto {
  @IsString() date!: string;
  @IsArray() @ArrayNotEmpty() entries!: BulkEntryDto[];
}

@UseGuards(JwtAuthGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private svc: AttendanceService) {}

  @Get()
  list(@Query('date') date: string) {
    if (!date) throw new BadRequestException('date required');
    return this.svc.listForDate(date);
  }

  @Post('bulk')
  bulk(@Body() dto: BulkAttendanceDto, @CurrentUser() user: JwtUser) {
    return this.svc.bulkUpsert(dto.date, dto.entries, user?.sub);
  }

  @Get('month')
  month(
    @Query('employeeId') employeeId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    if (!employeeId || !year || !month) throw new BadRequestException('employeeId, year, month required');
    return this.svc.monthMatrix(employeeId, Number(year), Number(month));
  }
}
