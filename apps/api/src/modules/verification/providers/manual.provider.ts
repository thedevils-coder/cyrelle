import { EnsureApplicantInput, EnsureApplicantResult, IdentityVerificationProvider, SdkTokenInput } from './identity-verification.provider';

/**
 * Manual review is an admin decision on a Cyrelle record.
 * It does not collect government ID images and does not call an external API.
 */
export class ManualIdentityVerificationProvider implements IdentityVerificationProvider {
  readonly name = 'manual';

  configured(): boolean {
    return false;
  }

  async ensureApplicant(_input: EnsureApplicantInput): Promise<EnsureApplicantResult> {
    throw new Error('Manual review does not create provider applicants');
  }

  async createSdkToken(_input: SdkTokenInput): Promise<{ token: string }> {
    throw new Error('Manual review does not issue provider tokens');
  }

  async deactivateApplicant(_applicantId: string): Promise<void> {
    return undefined;
  }
}
