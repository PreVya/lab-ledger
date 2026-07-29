import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { BillsService } from './bills.service';

class GenerateBillDto {
  @IsOptional() @IsString() patientId?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('bills')
export class BillsController {
  constructor(private svc: BillsService) {}

  @Get()
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('billNumber') billNumber?: string,
  ) {
    return this.svc.list({ from, to, q, billNumber: billNumber ? Number(billNumber) : undefined });
  }

  @Get('by-patient/:patientId')
  byPatient(@Param('patientId') patientId: string) {
    return this.svc.byPatient(patientId);
  }

  @Post('generate/:patientId')
  generate(@Param('patientId') patientId: string, @CurrentUser() user: JwtUser) {
    return this.svc.generate(patientId, user?.sub);
  }

  /** Alternative body form: POST /bills/generate { patientId } */
  @Post('generate')
  generateBody(@Body() dto: GenerateBillDto, @CurrentUser() user: JwtUser) {
    return this.svc.generate(String(dto.patientId), user?.sub);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Get(':id/print')
  print(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Post(':id/mark-printed')
  markPrinted(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.svc.markPrinted(id, user?.sub);
  }
}
