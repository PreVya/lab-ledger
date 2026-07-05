import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { CashAddedService } from './cash-added.service';

class CreateCashAddedDto {
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() date?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('cash-added')
export class CashAddedController {
  constructor(private svc: CashAddedService) {}

  @Post()
  create(@Body() dto: CreateCashAddedDto, @CurrentUser() user: JwtUser) {
    if (!user?.sub) throw new BadRequestException('Auth context missing');
    return this.svc.create({ ...dto, createdById: user.sub });
  }

  @Get()
  list(@Query('date') date?: string) { return this.svc.list(date); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.svc.remove(id); }
}
