import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@UseGuards(JwtAuthGuard)
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
}
