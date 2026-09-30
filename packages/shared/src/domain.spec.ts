import { registrationAgeDecision } from './age';
import { calculateAppointmentCommission, DEFAULT_COMMISSION_BPS } from './commission';
import { contrastRatio, accessibleAccentLabel } from './contrast';
import { evaluateShakeSos, assertSosSourceAllowed, EmergencyError, SAFETY_LIMITATIONS } from './emergency';
import {
  entitlementsAreIndependent,
  resolveBusinessEntitlements,
  resolvePersonalEntitlements,
} from './entitlements';
import { evaluateFeatureFlag, stableBucket } from './feature-flags';
import { translate, isRtl } from './i18n';
import { formatMoney } from './money';
import { selectPrice } from './pricing';
import { validateUsername } from './username';

describe('appointment commission', () => {
  it('charges 15% of ₹1,000 and leaves ₹850 for the business', () => {
    const result = calculateAppointmentCommission({
      grossMinor: 100_000,
      currency: 'inr',
    });
    expect(result.commissionBps).toBe(DEFAULT_COMMISSION_BPS);
    expect(result.currency).toBe('INR');
    expect(result.commissionMinor).toBe(15_000);
    expect(result.businessMinor).toBe(85_000);
    expect(result.feeMinor).toBe(0);
    expect(result.taxMinor).toBe(0);
    expect(formatMoney(result.commissionMinor, 'INR', 'en-IN')).toContain('150');
    expect(formatMoney(result.businessMinor, 'INR', 'en-IN')).toContain('850');
  });

  it('rounds half-up and subtracts fees and tax from the business amount', () => {
    const result = calculateAppointmentCommission({
      grossMinor: 1001,
      currency: 'USD',
      commissionBps: 1500,
      feeMinor: 30,
      taxMinor: 20,
    });
    expect(result.commissionMinor).toBe(150);
    expect(result.businessMinor).toBe(801);
  });

  it('rejects non-integer money', () => {
    expect(() => calculateAppointmentCommission({ grossMinor: 10.5, currency: 'USD' })).toThrow(/minor units/);
  });
});

describe('entitlements', () => {
  it('keeps Basic usable and withholds Premium benefits', () => {
    const result = resolvePersonalEntitlements({
      premiumActive: false,
      identityVerified: true,
      independentBlueTick: false,
    });
    expect(result.plan).toBe('BASIC');
    expect(result.entitlements).toEqual(['AI_STANDARD']);
    expect(result.premiumBlueTick).toBe(false);
    expect(result.blueTickVisible).toBe(false);
  });

  it('grants Premium Blue Tick only when Premium is active and identity is verified', () => {
    expect(
      resolvePersonalEntitlements({
        premiumActive: true,
        identityVerified: false,
        independentBlueTick: false,
      }).premiumBlueTick,
    ).toBe(false);
    const verified = resolvePersonalEntitlements({
      premiumActive: true,
      identityVerified: true,
      independentBlueTick: false,
    });
    expect(verified.premiumBlueTick).toBe(true);
    expect(verified.entitlements).toContain('AI_ADVANCED');
    expect(verified.entitlements).toContain('EARLY_ACCESS');
  });

  it('removes Premium Blue Tick when Premium expires unless an independent badge remains', () => {
    const expired = resolvePersonalEntitlements({
      premiumActive: false,
      identityVerified: true,
      independentBlueTick: false,
    });
    expect(expired.premiumBlueTick).toBe(false);
    expect(expired.entitlements).not.toContain('AI_ADVANCED');
    const independent = resolvePersonalEntitlements({
      premiumActive: false,
      identityVerified: true,
      independentBlueTick: true,
    });
    expect(independent.premiumBlueTick).toBe(false);
    expect(independent.blueTickVisible).toBe(true);
    expect(independent.entitlements).toEqual(['AI_STANDARD']);
  });

  it('does not let personal Premium grant Business Blue Tick', () => {
    const personal = resolvePersonalEntitlements({
      premiumActive: true,
      identityVerified: true,
      independentBlueTick: false,
    });
    const standardBusiness = resolveBusinessEntitlements({ blueTickActive: false, businessVerified: true });
    const blueBusiness = resolveBusinessEntitlements({ blueTickActive: true, businessVerified: false });
    const verifiedBlue = resolveBusinessEntitlements({ blueTickActive: true, businessVerified: true });
    expect(standardBusiness.tier).toBe('STANDARD');
    expect(blueBusiness.blueTickVisible).toBe(false);
    expect(verifiedBlue.entitlements).toContain('BUSINESS_BLUE_TICK');
    expect(entitlementsAreIndependent(personal, verifiedBlue)).toBe(true);
    expect(entitlementsAreIndependent(personal, standardBusiness)).toBe(true);
  });
});

describe('feature flags', () => {
  const flag = {
    key: 'AdvancedLiveTools',
    enabled: true,
    premiumLaunchAt: new Date('2024-01-01T00:00:00Z'),
    basicLaunchAt: new Date('2027-01-01T00:00:00Z'),
    countries: [] as string[],
    platforms: [] as string[],
    rolloutPercent: 100,
  };

  it('enables Premium during early access and marks Basic as coming soon', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(evaluateFeatureFlag(flag, { plan: 'PREMIUM', userBucket: 0, now }).state).toBe('enabled');
    expect(evaluateFeatureFlag(flag, { plan: 'BASIC', userBucket: 0, now }).state).toBe('coming_soon');
  });

  it('enables Basic after the configured launch date', () => {
    const now = new Date('2027-02-01T00:00:00Z');
    expect(evaluateFeatureFlag(flag, { plan: 'BASIC', userBucket: 10, now }).state).toBe('enabled');
  });

  it('respects country, platform, and rollout', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(
      evaluateFeatureFlag(
        { ...flag, countries: ['FR'] },
        { plan: 'PREMIUM', countryCode: 'US', userBucket: 0, now },
      ).state,
    ).toBe('disabled');
    expect(
      evaluateFeatureFlag(
        { ...flag, platforms: ['ios'] },
        { plan: 'PREMIUM', platform: 'android', userBucket: 0, now },
      ).state,
    ).toBe('disabled');
    expect(
      evaluateFeatureFlag({ ...flag, rolloutPercent: 10 }, { plan: 'PREMIUM', userBucket: 10, now }).state,
    ).toBe('disabled');
    expect(stableBucket('user_1', 'AdvancedLiveTools')).toBeGreaterThanOrEqual(0);
    expect(stableBucket('user_1', 'AdvancedLiveTools')).toBeLessThan(100);
  });
});

describe('registration rules', () => {
  it('does not impose a universal 18+ gate', () => {
    expect(registrationAgeDecision({ dateOfBirth: '2012-01-01', minAccountAge: null })).toBe('ok');
    expect(registrationAgeDecision({ minAccountAge: null })).toBe('ok');
  });

  it('applies only a configured country minimum', () => {
    expect(
      registrationAgeDecision({
        dateOfBirth: '2015-01-01',
        minAccountAge: 16,
        now: new Date('2026-01-01T00:00:00Z'),
      }),
    ).toBe('under_minimum');
    expect(registrationAgeDecision({ minAccountAge: 16 })).toBe('dob_required');
  });

  it('validates usernames and blocks reserved names', () => {
    expect(validateUsername('Diya_Verma')).toEqual({ ok: true, username: 'diya_verma' });
    expect(validateUsername('cyrelle').ok).toBe(false);
    expect(validateUsername('ab').ok).toBe(false);
    expect(validateUsername('1diya').ok).toBe(false);
  });
});

describe('safety', () => {
  it('runs a five-second shake countdown that can be cancelled', () => {
    expect(evaluateShakeSos({ enabled: false, cancelled: false, startedAtMs: 0, nowMs: 6000 })).toBe('disabled');
    expect(evaluateShakeSos({ enabled: true, cancelled: false, startedAtMs: null, nowMs: 0 })).toBe('idle');
    expect(evaluateShakeSos({ enabled: true, cancelled: false, startedAtMs: 1000, nowMs: 4000 })).toBe('countdown');
    expect(evaluateShakeSos({ enabled: true, cancelled: true, startedAtMs: 1000, nowMs: 7000 })).toBe('cancelled');
    expect(evaluateShakeSos({ enabled: true, cancelled: false, startedAtMs: 1000, nowMs: 6000 })).toBe('activate');
  });

  it('requires explicit opt-in for shake and auto SOS', () => {
    expect(() => assertSosSourceAllowed({ shakeSosEnabled: false, autoSosEnabled: false, countdownMs: 5000 }, 'AUTO')).toThrow(
      EmergencyError,
    );
    expect(() => assertSosSourceAllowed({ shakeSosEnabled: true, autoSosEnabled: false, countdownMs: 5000 }, 'SHAKE')).not.toThrow();
    expect(SAFETY_LIMITATIONS.join(' ')).toMatch(/cannot detect every emergency/i);
  });
});

describe('pricing and i18n', () => {
  it('prefers a country price and falls back to the global price', () => {
    const rows = [
      { product: 'PERSONAL_PREMIUM' as const, interval: 'MONTH' as const, countryCode: 'IN', currency: 'INR', amountMinor: 49900, active: true },
      { product: 'PERSONAL_PREMIUM' as const, interval: 'MONTH' as const, countryCode: null, currency: 'USD', amountMinor: 699, active: true },
      { product: 'BUSINESS_BLUE_TICK' as const, interval: 'MONTH' as const, countryCode: null, currency: 'USD', amountMinor: 1299, active: true },
    ];
    expect(selectPrice(rows, 'PERSONAL_PREMIUM', 'MONTH', 'IN')?.amountMinor).toBe(49900);
    expect(selectPrice(rows, 'PERSONAL_PREMIUM', 'MONTH', 'FR')?.currency).toBe('USD');
    expect(selectPrice(rows, 'BUSINESS_BLUE_TICK', 'MONTH', 'IN')?.amountMinor).toBe(1299);
  });

  it('translates and marks Arabic as RTL', () => {
    expect(translate('ar', 'safetyHub')).toBe('مركز الأمان');
    expect(translate('es', 'noPhoneAuth')).toMatch(/teléfono/);
    expect(translate('zz', 'appName')).toBe('Cyrelle');
    expect(isRtl('ar-AE')).toBe(true);
    expect(isRtl('en')).toBe(false);
  });

  it('picks black or white text so premium accents stay readable', () => {
    expect(accessibleAccentLabel('nope')).toBeNull();
    const rose = accessibleAccentLabel('#D4146A');
    expect(rose?.label).toBe('#FFFFFF');
    expect(rose?.ratio).toBeGreaterThanOrEqual(4.5);
    expect(accessibleAccentLabel('#777777')?.ratio).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', '#D4146A')).toBeGreaterThanOrEqual(4.5);
  });
});
