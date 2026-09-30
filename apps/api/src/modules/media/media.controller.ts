import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { MediaKind } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { createReadStream } from 'fs';
import { Response } from 'express';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/decorators';
import { MediaService } from './media.service';

class SignDto {
  @IsEnum(MediaKind) kind!: MediaKind;
  @IsString() contentType!: string;
  @IsOptional() @IsBoolean() private?: boolean;
}

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('sign')
  sign(@CurrentUser() user: AuthUser, @Body() body: SignDto) {
    return this.media.signUpload(user, body);
  }

  @Post(':id/upload')
  async upload(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { dataBase64: string; contentType: string }) {
    const bytes = Buffer.from(body.dataBase64, 'base64');
    if (bytes.length > 8_000_000) return { error: 'FILE_TOO_LARGE' };
    return this.media.saveLocal(user, id, bytes, body.contentType);
  }

  @Get(':id/file')
  async file(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const result = await this.media.read(user, id);
    if ('redirect' in result && result.redirect) {
      res.redirect(result.redirect);
      return;
    }
    if ('path' in result && result.path) createReadStream(result.path).pipe(res);
  }
}
