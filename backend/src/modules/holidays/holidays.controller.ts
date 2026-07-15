import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { HolidaysService } from './holidays.service';

class CreateHolidayDto {
  @IsString() date!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() notes?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('holidays')
export class HolidaysController {
  constructor(private svc: HolidaysService) {}

  @Get()
  list(@Query('year') year?: string, @Query('month') month?: string) {
    return this.svc.list(year ? Number(year) : undefined, month ? Number(month) : undefined);
  }

  @Post()
  create(@Body() dto: CreateHolidayDto, @CurrentUser() user: JwtUser) {
    return this.svc.create({ ...dto, createdById: user?.sub });
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.svc.remove(id); }
}
