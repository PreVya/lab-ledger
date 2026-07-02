import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TestsService } from './tests.service';

class CreateTestDto {
  @IsString() name!: string;
  @IsNumber() @Min(0) rate!: number;
  @IsBoolean() outsourced!: boolean;
  @IsOptional() @IsString() outsourcedLab?: string;
  @IsOptional() @IsString() testCode?: string;
}

class UpdateTestDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) rate?: number;
  @IsOptional() @IsBoolean() outsourced?: boolean;
  @IsOptional() @IsString() outsourcedLab?: string | null;
  @IsOptional() @IsString() testCode?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('tests')
export class TestsController {
  constructor(private tests: TestsService) {}

  @Get()
  list(@Query('all') all?: string) { return this.tests.list(all === '1'); }

  @Post()
  create(@Body() dto: CreateTestDto) { return this.tests.create(dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTestDto) { return this.tests.update(id, dto); }
}
