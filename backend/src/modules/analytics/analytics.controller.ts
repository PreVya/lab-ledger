import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/** Analytics is ADMIN ONLY. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
@Controller('analytics')
export class AnalyticsController {
  constructor(private svc: AnalyticsService) {}

  @Get('summary')
  summary(@Query('fromDate') fromDate?: string, @Query('toDate') toDate?: string) {
    if (!fromDate || !DATE_RE.test(fromDate)) throw new BadRequestException('fromDate (YYYY-MM-DD) is required.');
    if (!toDate || !DATE_RE.test(toDate)) throw new BadRequestException('toDate (YYYY-MM-DD) is required.');
    if (toDate < fromDate) throw new BadRequestException('toDate must not be before fromDate.');
    return this.svc.summary(fromDate, toDate);
  }

  @Get('daily-report')
  daily(@Query('date') date?: string) {
    if (!date || !DATE_RE.test(date)) throw new BadRequestException('date (YYYY-MM-DD) is required.');
    return this.svc.dailyReport(date);
  }

  @Get('monthly-report')
  monthly(@Query('month') month?: string) {
    if (!month || !MONTH_RE.test(month)) throw new BadRequestException('month (YYYY-MM) is required.');
    return this.svc.monthlyReport(month);
  }
}
