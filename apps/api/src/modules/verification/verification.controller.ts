import { Controller, Get, Post } from '@nestjs/common';
import { AppError } from '../../common/app-error';
import { AuthUser } from '../../common/auth.guard';
import { CurrentUser } from '../../common/decorators';
import { IdentityVerificationService } from './identity-verification.service';

@Controller('verification')
export class VerificationController {
  constructor(private readonly identity: IdentityVerificationService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.identity.status(user);
  }

  @Post()
  submit() {
    throw new AppError(410, 'VERIFICATION_MOVED', 'Identity documents are not uploaded to Cyrelle. Start verification to continue with the identity provider.');
  }
}
