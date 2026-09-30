export const PLANS = {
  BASIC: 'BASIC',
  PREMIUM: 'PREMIUM',
} as const;

export type PlanCode = (typeof PLANS)[keyof typeof PLANS];

export const BUSINESS_TIERS = {
  STANDARD: 'STANDARD',
  BLUE_TICK: 'BLUE_TICK',
} as const;

export type BusinessTier = (typeof BUSINESS_TIERS)[keyof typeof BUSINESS_TIERS];

export const PERSONAL_ENTITLEMENTS = [
  'AI_STANDARD',
  'AI_ADVANCED',
  'PREMIUM_BLUE_TICK',
  'ADVANCED_ANALYTICS',
  'PROFILE_CUSTOMIZATION',
  'ADVANCED_LIVE_TOOLS',
  'EARLY_ACCESS',
  'PREMIUM_CREATOR_TOOLS',
] as const;

export type PersonalEntitlement = (typeof PERSONAL_ENTITLEMENTS)[number];

export const BUSINESS_ENTITLEMENTS = [
  'BUSINESS_BLUE_TICK',
  'ADVANCED_BUSINESS_ANALYTICS',
  'ENHANCED_DISCOVERY',
  'PREMIUM_BUSINESS_CUSTOMIZATION',
] as const;

export type BusinessEntitlement = (typeof BUSINESS_ENTITLEMENTS)[number];

const BASIC_ENTITLEMENTS: PersonalEntitlement[] = ['AI_STANDARD'];

const PREMIUM_ENTITLEMENTS: PersonalEntitlement[] = [
  'AI_STANDARD',
  'AI_ADVANCED',
  'PREMIUM_BLUE_TICK',
  'ADVANCED_ANALYTICS',
  'PROFILE_CUSTOMIZATION',
  'ADVANCED_LIVE_TOOLS',
  'EARLY_ACCESS',
  'PREMIUM_CREATOR_TOOLS',
];

export interface PersonalEntitlementInput {
  /** Active paid Premium subscription. Expired, canceled, or past grace is not active. */
  premiumActive: boolean;
  /** Identity verification status is VERIFIED. Premium never bypasses this. */
  identityVerified: boolean;
  /**
   * Separately configured verification badge that is not the Premium subscription.
   * Survives Premium expiry. Does not grant other Premium entitlements.
   */
  independentBlueTick: boolean;
}

export interface PersonalEntitlementResult {
  plan: PlanCode;
  entitlements: PersonalEntitlement[];
  premiumBlueTick: boolean;
  blueTickVisible: boolean;
}

export function resolvePersonalEntitlements(input: PersonalEntitlementInput): PersonalEntitlementResult {
  const plan: PlanCode = input.premiumActive ? 'PREMIUM' : 'BASIC';
  const entitlements = new Set<PersonalEntitlement>(plan === 'PREMIUM' ? PREMIUM_ENTITLEMENTS : BASIC_ENTITLEMENTS);
  const premiumBlueTick = plan === 'PREMIUM' && input.identityVerified;
  if (!premiumBlueTick) entitlements.delete('PREMIUM_BLUE_TICK');
  return {
    plan,
    entitlements: PERSONAL_ENTITLEMENTS.filter((item) => entitlements.has(item)),
    premiumBlueTick,
    blueTickVisible: premiumBlueTick || input.independentBlueTick,
  };
}

export interface BusinessEntitlementInput {
  blueTickActive: boolean;
  businessVerified: boolean;
}

export interface BusinessEntitlementResult {
  tier: BusinessTier;
  entitlements: BusinessEntitlement[];
  blueTickVisible: boolean;
}

export function resolveBusinessEntitlements(input: BusinessEntitlementInput): BusinessEntitlementResult {
  const active = input.blueTickActive && input.businessVerified;
  if (!active) {
    return { tier: 'STANDARD', entitlements: [], blueTickVisible: false };
  }
  return {
    tier: 'BLUE_TICK',
    entitlements: [...BUSINESS_ENTITLEMENTS],
    blueTickVisible: true,
  };
}

/** Personal Premium must never grant Business Blue Tick, or the reverse. */
export function entitlementsAreIndependent(
  personal: PersonalEntitlementResult,
  business: BusinessEntitlementResult,
): boolean {
  const personalGrantsBusiness = personal.entitlements.some((item) =>
    (BUSINESS_ENTITLEMENTS as readonly string[]).includes(item),
  );
  const businessGrantsPersonal = business.entitlements.some((item) =>
    (PERSONAL_ENTITLEMENTS as readonly string[]).includes(item),
  );
  return !personalGrantsBusiness && !businessGrantsPersonal;
}
