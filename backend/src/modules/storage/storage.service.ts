import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf',
]);
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export interface UploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
  documentType: string;
  entityType: string;
  entityId: string;
  uploadedById?: string | null;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private _client: SupabaseClient | null = null;
  private readonly bucket = process.env.SUPABASE_STORAGE_EMPLOYEE_BUCKET || 'employee-documents';

  constructor(private prisma: PrismaService) {}

  private client(): SupabaseClient {
    if (this._client) return this._client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new InternalServerErrorException(
        'Supabase storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend.',
      );
    }
    this._client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return this._client;
  }

  validate(file: { mimetype: string; size: number }) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Unsupported file type. Allowed: JPG, PNG, WEBP, PDF.');
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('File too large. Max 5 MB.');
    }
  }

  async uploadEmployeeAadhaar(employeeId: string, file: Express.Multer.File, uploadedById?: string | null) {
    this.validate(file);
    const safeName = file.originalname.replace(/[^\w.\-]+/g, '_').slice(0, 120);
    const path = `employees/${employeeId}/aadhaar/${randomUUID()}-${safeName}`;
    const { error } = await this.client()
      .storage.from(this.bucket)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) {
      this.logger.error(`Supabase upload failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to upload Aadhaar file.');
    }
    return this.prisma.storedFile.create({
      data: {
        bucket: this.bucket,
        path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        documentType: 'aadhaar',
        entityType: 'employee',
        entityId: employeeId,
        uploadedById: uploadedById ?? null,
      },
    });
  }

  async getSignedUrl(storedFileId: string, expiresIn = 300): Promise<{ signedUrl: string; file: { originalName: string; mimeType: string } }> {
    const row = await this.prisma.storedFile.findUnique({ where: { id: storedFileId } });
    if (!row) throw new NotFoundException('File not found');
    const { data, error } = await this.client().storage.from(row.bucket).createSignedUrl(row.path, expiresIn);
    if (error || !data?.signedUrl) {
      this.logger.error(`Supabase signed URL failed: ${error?.message}`);
      throw new InternalServerErrorException('Failed to generate signed URL.');
    }
    return { signedUrl: data.signedUrl, file: { originalName: row.originalName, mimeType: row.mimeType } };
  }

  async deleteStoredFile(storedFileId: string) {
    const row = await this.prisma.storedFile.findUnique({ where: { id: storedFileId } });
    if (!row) return;
    const { error } = await this.client().storage.from(row.bucket).remove([row.path]);
    if (error) this.logger.warn(`Supabase delete failed (${row.path}): ${error.message}`);
    await this.prisma.storedFile.delete({ where: { id: storedFileId } }).catch(() => undefined);
  }
}
