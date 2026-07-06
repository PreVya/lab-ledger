import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { SalaryService } from './salary.service';

class AdvanceDto {
  @IsString() employeeId!: string;
  @IsString() date!: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsString() notes?: string;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class SalaryController {
  constructor(private svc: SalaryService) {}

  @Get('salary/summary')
  summary(@Query('year') year: string, @Query('month') month: string) {
    if (!year || !month) throw new BadRequestException('year and month required');
    return this.svc.monthlySummary(Number(year), Number(month));
  }

  @Get('salary-advances')
  listAdvances(
    @Query('employeeId') employeeId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.svc.listAdvances({
      employeeId,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
    });
  }

  @Post('salary-advances')
  createAdvance(@Body() dto: AdvanceDto, @CurrentUser() user: JwtUser) {
    return this.svc.createAdvance({ ...dto, createdById: user?.sub });
  }

  @Delete('salary-advances/:id')
  removeAdvance(@Param('id') id: string) { return this.svc.removeAdvance(id); }
}
