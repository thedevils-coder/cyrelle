export interface EnsureApplicantInput {
  externalUserId: string;
  email?: string | null;
  countryAlpha3?: string | null;
  levelName: string;
}

export interface EnsureApplicantResult {
  applicantId: string;
  inspectionId: string | null;
  created: boolean;
}

export interface SdkTokenInput {
  externalUserId: string;
  email?: string | null;
  levelName: string;
  ttlInSecs: number;
}

export interface IdentityVerificationProvider {
  readonly name: string;
  configured(): boolean;
  ensureApplicant(input: EnsureApplicantInput): Promise<EnsureApplicantResult>;
  createSdkToken(input: SdkTokenInput): Promise<{ token: string }>;
  deactivateApplicant(applicantId: string): Promise<void>;
}
