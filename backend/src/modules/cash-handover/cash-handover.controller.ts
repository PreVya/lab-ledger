import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { CashHandoverService } from './cash-handover.service';

class CreateCashHandoverDto {
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() date?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('cash-handover')
export class CashHandoverController {
  constructor(private svc: CashHandoverService) {}

  @Post()
  create(@Body() dto: CreateCashHandoverDto, @CurrentUser() user: JwtUser) {
    if (!user?.sub) throw new BadRequestException('Auth context missing');
    return this.svc.create({ ...dto, createdById: user.sub });
  }

  @Get()
  list(@Query('date') date?: string) { return this.svc.list(date); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.svc.remove(id); }
}
