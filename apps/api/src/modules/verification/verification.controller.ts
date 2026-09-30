import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/decorators';
import { VerificationService } from './verification.service';

class VerificationDto {
  @IsString() documentType!: string;
  @IsString() documentCountry!: string;
  @IsString() @MaxLength(200000) document!: string;
  @IsString() @MaxLength(200000) selfie!: string;
  @IsOptional() @IsNumber() livenessScore?: number;
}

@Controller('verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.verification.status(user);
  }

  @Post()
  submit(@CurrentUser() user: AuthUser, @Body() body: VerificationDto) {
    return this.verification.submit(user, body);
  }
}
