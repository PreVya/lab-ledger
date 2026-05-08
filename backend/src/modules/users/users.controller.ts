import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEnum, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService } from './users.service';

class CreateUserDto {
  @IsString() @MinLength(2) username!: string;
  @IsString() @MinLength(4) password!: string;
  @IsString() fullName!: string;
  @IsEnum(Role) role!: Role;
}

class SetActiveDto { @IsBoolean() active!: boolean; }
class ResetPwDto { @IsString() @MinLength(4) password!: string; }

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get() list() { return this.users.list(); }

  @Post() create(@Body() dto: CreateUserDto) { return this.users.create(dto); }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.users.setActive(id, dto.active);
  }

  @Patch(':id/password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPwDto) {
    return this.users.resetPassword(id, dto.password);
  }
}
