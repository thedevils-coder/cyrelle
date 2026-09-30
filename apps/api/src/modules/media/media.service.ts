import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { MediaKind } from '@prisma/client';
import { AppError } from '../../common/app-error';
import { AuthUser } from '../../common/auth.guard';
import { randomToken } from '../../common/crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class MediaService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  async signUpload(user: AuthUser, input: { kind: MediaKind; contentType: string; private?: boolean }) {
    const key = `${input.private ? 'private' : 'public'}/${user.id}/${randomToken(8)}`;
    const asset = await this.prisma.mediaAsset.create({
      data: { ownerId: user.id, kind: input.kind, storageKey: key, private: Boolean(input.private) },
    });
    const bucket = this.config.get<string>('S3_BUCKET');
    if (bucket && this.config.get('S3_ACCESS_KEY')) {
      const client = this.client();
      const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: input.contentType }), { expiresIn: 600 });
      return { assetId: asset.id, uploadUrl, method: 'PUT', headers: { 'Content-Type': input.contentType } };
    }
    return { assetId: asset.id, uploadUrl: `/v1/media/${asset.id}/upload`, method: 'POST' };
  }

  async saveLocal(user: AuthUser, assetId: string, bytes: Buffer, contentType: string) {
    const asset = await this.owned(user.id, assetId);
    const root = this.config.get<string>('UPLOAD_DIR') || join(process.cwd(), 'uploads');
    const file = join(root, asset.storageKey);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, bytes);
    const publicUrl = asset.private ? null : `/v1/media/${asset.id}/file`;
    await this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { publicUrl } });
    await this.jobs.enqueue('media.process', { assetId: asset.id, contentType });
    return { id: asset.id, url: publicUrl };
  }

  async read(user: AuthUser | undefined, assetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new AppError(404, 'NOT_FOUND', 'Media not found');
    if (asset.private && asset.ownerId !== user?.id && user?.role === 'USER') {
      throw new AppError(403, 'FORBIDDEN', 'This media is private');
    }
    const bucket = this.config.get<string>('S3_BUCKET');
    if (bucket && this.config.get('S3_ACCESS_KEY')) {
      const url = await getSignedUrl(this.client(), new GetObjectCommand({ Bucket: bucket, Key: asset.storageKey }), { expiresIn: 300 });
      return { redirect: url };
    }
    return { path: join(this.config.get<string>('UPLOAD_DIR') || join(process.cwd(), 'uploads'), asset.storageKey) };
  }

  private async owned(userId: string, assetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.ownerId !== userId) throw new AppError(404, 'NOT_FOUND', 'Media not found');
    return asset;
  }

  private client() {
    return new S3Client({
      region: this.config.get('S3_REGION') || 'auto',
      endpoint: this.config.get('S3_ENDPOINT') || undefined,
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY') || '',
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY') || '',
      },
    });
  }
}
