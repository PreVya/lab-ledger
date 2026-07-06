import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { AppointmentStatus, Sex } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { AppointmentsService } from './appointments.service';

class CreateAppointmentDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() mobile!: string;
  @IsOptional() @IsInt() ageValue?: number;
  @IsOptional() @IsString() ageUnit?: 'days' | 'months' | 'years';
  @IsEnum(Sex) sex!: Sex;
  @IsOptional() @IsString() referredDoctor?: string;
  @IsString() @MinLength(1) procedure!: string;
  @IsString() appointmentDate!: string;
  @IsOptional() @IsString() appointmentTime?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
}

class UpdateAppointmentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsInt() ageValue?: number;
  @IsOptional() @IsString() ageUnit?: 'days' | 'months' | 'years';
  @IsOptional() @IsEnum(Sex) sex?: Sex;
  @IsOptional() @IsString() referredDoctor?: string;
  @IsOptional() @IsString() procedure?: string;
  @IsOptional() @IsString() appointmentDate?: string;
  @IsOptional() @IsString() appointmentTime?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
}

class LinkPatientDto { @IsString() patientId!: string; }

@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private svc: AppointmentsService) {}

  @Post()
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: JwtUser) {
    if (!user?.sub) throw new BadRequestException('Auth context missing');
    return this.svc.create({ ...dto, createdById: user.sub });
  }

  @Get()
  list(
    @Query('date') date?: string,
    @Query('status') status?: AppointmentStatus,
    @Query('q') q?: string,
  ) {
    return this.svc.list({ date, status, q });
  }

  @Get(':id') get(@Param('id') id: string) { return this.svc.get(id); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id') remove(@Param('id') id: string) { return this.svc.remove(id); }

  @Post(':id/link-patient')
  link(@Param('id') id: string, @Body() dto: LinkPatientDto) {
    return this.svc.linkPatient(id, dto.patientId);
  }
}
