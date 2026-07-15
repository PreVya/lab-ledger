import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { EmployeesService } from './employees.service';

/**
 * Employee create/update accept multipart/form-data with an optional `aadhaar`
 * file part. Text fields come as strings and are parsed here.
 */
function parseForm(body: Record<string, unknown>) {
  const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
  const bool = (v: unknown) => (v === undefined ? undefined : String(v) === 'true' || v === true);
  return {
    name: body.name as string | undefined,
    mobile: (body.mobile as string) || null,
    designation: (body.designation as string) || null,
    monthlySalary: num(body.monthlySalary),
    active: bool(body.active),
    alwaysPresent: bool(body.alwaysPresent),
    linkedUserId: (body.linkedUserId as string) || null,
  };
}

@UseGuards(JwtAuthGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private svc: EmployeesService) {}

  @Get() list(@Query('active') active?: string) {
    return this.svc.list(active === 'true' ? true : active === 'false' ? false : undefined);
  }

  @Get(':id') get(@Param('id') id: string) { return this.svc.get(id); }

  @Post()
  @UseInterceptors(FileInterceptor('aadhaar'))
  async create(
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    if (!user?.sub) throw new BadRequestException('Auth context missing');
    const parsed = parseForm(body);
    if (!parsed.name) throw new BadRequestException('Name required');
    return this.svc.createWithAadhaar(
      { name: parsed.name, mobile: parsed.mobile, designation: parsed.designation, monthlySalary: parsed.monthlySalary, active: parsed.active, alwaysPresent: parsed.alwaysPresent, linkedUserId: parsed.linkedUserId },
      file,
      user.sub,
    );
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('aadhaar'))
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    return this.svc.update(id, parseForm(body), file, user?.sub);
  }

  @Patch(':id/deactivate') deactivate(@Param('id') id: string) { return this.svc.deactivate(id); }

  @Delete(':id') hardDelete(@Param('id') id: string) { return this.svc.deactivate(id); }

  @Get(':id/aadhaar')
  async getAadhaar(@Param('id') id: string) {
    return this.svc.aadhaarSignedUrl(id);
  }
}
