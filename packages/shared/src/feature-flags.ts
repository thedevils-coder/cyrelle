export interface FeatureFlagDefinition {
  key: string;
  enabled: boolean;
  premiumLaunchAt: Date | null;
  basicLaunchAt: Date | null;
  /** Empty means every country. */
  countries: string[];
  /** Empty means every platform. ios | android | web */
  platforms: string[];
  /** 0–100 inclusive. 100 means the full cohort. */
  rolloutPercent: number;
}

export interface FeatureFlagContext {
  plan: 'BASIC' | 'PREMIUM';
  countryCode?: string | null;
  platform?: string | null;
  /** Stable 0–99 bucket for this user and flag. */
  userBucket: number;
  now: Date;
}

export type FeatureFlagState = 'enabled' | 'coming_soon' | 'disabled';

export interface FeatureFlagEvaluation {
  key: string;
  enabled: boolean;
  state: FeatureFlagState;
}

export function stableBucket(userId: string, flagKey: string): number {
  const input = `${flagKey}:${userId}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
}

export function evaluateFeatureFlag(flag: FeatureFlagDefinition, ctx: FeatureFlagContext): FeatureFlagEvaluation {
  const disabled = (state: FeatureFlagState): FeatureFlagEvaluation => ({
    key: flag.key,
    enabled: state === 'enabled',
    state,
  });

  if (!flag.enabled) return disabled('disabled');
  if (flag.rolloutPercent <= 0 || ctx.userBucket >= flag.rolloutPercent) return disabled('disabled');
  if (flag.countries.length > 0) {
    const country = ctx.countryCode?.toUpperCase();
    if (!country || !flag.countries.map((item) => item.toUpperCase()).includes(country)) {
      return disabled('disabled');
    }
  }
  if (flag.platforms.length > 0) {
    const platform = ctx.platform?.toLowerCase();
    if (!platform || !flag.platforms.map((item) => item.toLowerCase()).includes(platform)) {
      return disabled('disabled');
    }
  }

  const isPremium = ctx.plan === 'PREMIUM';
  const launchAt = isPremium ? flag.premiumLaunchAt : flag.basicLaunchAt;
  if (!launchAt) return disabled('coming_soon');
  if (ctx.now.getTime() < launchAt.getTime()) return disabled('coming_soon');
  return disabled('enabled');
}
