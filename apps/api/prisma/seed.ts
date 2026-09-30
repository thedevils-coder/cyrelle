import { PrismaClient, Role } from '@prisma/client';
import { calculateAppointmentCommission } from '@cyrelle/shared';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const password = bcrypt.hashSync('CyrelleTest!2026', 12);

const countries = [
  { code: 'US', name: 'United States', currency: 'USD', languages: ['en', 'es'], timeZones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'], emergency: [{ label: 'Emergency', number: '911', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 0 },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', languages: ['en'], timeZones: ['Europe/London'], emergency: [{ label: 'Emergency', number: '999', voice: true, sms: false }, { label: 'EU emergency', number: '112', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 2000 },
  { code: 'IN', name: 'India', currency: 'INR', languages: ['en', 'hi'], timeZones: ['Asia/Kolkata'], emergency: [{ label: 'Emergency', number: '112', voice: true, sms: false }], paymentProviders: ['razorpay', 'stripe'], taxBps: 1800 },
  { code: 'FR', name: 'France', currency: 'EUR', languages: ['fr', 'en'], timeZones: ['Europe/Paris'], emergency: [{ label: 'European emergency', number: '112', voice: true, sms: false }, { label: 'Medical', number: '15', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 2000 },
  { code: 'DE', name: 'Germany', currency: 'EUR', languages: ['de', 'en'], timeZones: ['Europe/Berlin'], emergency: [{ label: 'Fire and medical', number: '112', voice: true, sms: false }, { label: 'Police', number: '110', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 1900 },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', languages: ['ar', 'en'], timeZones: ['Asia/Dubai'], emergency: [{ label: 'Police', number: '999', voice: true, sms: false }, { label: 'Ambulance', number: '998', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 500 },
  { code: 'SG', name: 'Singapore', currency: 'SGD', languages: ['en'], timeZones: ['Asia/Singapore'], emergency: [{ label: 'Police', number: '999', voice: true, sms: false }, { label: 'Ambulance', number: '995', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 900 },
  { code: 'BR', name: 'Brazil', currency: 'BRL', languages: ['pt'], timeZones: ['America/Sao_Paulo'], emergency: [{ label: 'Police', number: '190', voice: true, sms: false }, { label: 'Ambulance', number: '192', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 0 },
  { code: 'JP', name: 'Japan', currency: 'JPY', languages: ['en'], timeZones: ['Asia/Tokyo'], emergency: [{ label: 'Police', number: '110', voice: true, sms: false }, { label: 'Ambulance and fire', number: '119', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 1000 },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', languages: ['en'], timeZones: ['Africa/Lagos'], emergency: [{ label: 'Emergency', number: '112', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 750 },
  { code: 'AU', name: 'Australia', currency: 'AUD', languages: ['en'], timeZones: ['Australia/Sydney'], emergency: [{ label: 'Emergency', number: '000', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 1000 },
  { code: 'CA', name: 'Canada', currency: 'CAD', languages: ['en', 'fr'], timeZones: ['America/Toronto', 'America/Vancouver'], emergency: [{ label: 'Emergency', number: '911', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 0 },
  { code: 'MX', name: 'Mexico', currency: 'MXN', languages: ['es'], timeZones: ['America/Mexico_City'], emergency: [{ label: 'Emergency', number: '911', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 1600 },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', languages: ['en'], timeZones: ['Africa/Johannesburg'], emergency: [{ label: 'Police', number: '10111', voice: true, sms: false }, { label: 'Ambulance', number: '10177', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 1500 },
  { code: 'SE', name: 'Sweden', currency: 'SEK', languages: ['en'], timeZones: ['Europe/Stockholm'], emergency: [{ label: 'Emergency', number: '112', voice: true, sms: false }], paymentProviders: ['stripe'], taxBps: 2500 },
];

const currencies = [
  ['USD', 'US Dollar', 2, '$'],
  ['EUR', 'Euro', 2, '€'],
  ['GBP', 'British Pound', 2, '£'],
  ['INR', 'Indian Rupee', 2, '₹'],
  ['AED', 'UAE Dirham', 2, 'د.إ'],
  ['SGD', 'Singapore Dollar', 2, 'S$'],
  ['BRL', 'Brazilian Real', 2, 'R$'],
  ['JPY', 'Japanese Yen', 0, '¥'],
  ['NGN', 'Nigerian Naira', 2, '₦'],
  ['AUD', 'Australian Dollar', 2, 'A$'],
  ['CAD', 'Canadian Dollar', 2, 'C$'],
  ['MXN', 'Mexican Peso', 2, 'MX$'],
  ['ZAR', 'South African Rand', 2, 'R'],
  ['SEK', 'Swedish Krona', 2, 'kr'],
] as const;

const languages = [
  ['en', 'English', 'English', false],
  ['es', 'Spanish', 'Español', false],
  ['fr', 'French', 'Français', false],
  ['pt', 'Portuguese', 'Português', false],
  ['de', 'German', 'Deutsch', false],
  ['hi', 'Hindi', 'हिन्दी', false],
  ['ar', 'Arabic', 'العربية', true],
] as const;

async function user(input: { email: string; name: string; username: string; role?: Role; country: string; language: string; currency: string; timezone: string; bio: string; city: string }) {
  return prisma.user.upsert({
    where: { email: input.email },
    update: {},
    create: {
      email: input.email,
      passwordHash: password,
      emailVerifiedAt: new Date(),
      role: input.role ?? 'USER',
      profile: { create: { displayName: input.name, username: input.username, bio: input.bio, countryCode: input.country, city: input.city, timezone: input.timezone, interests: ['community', 'wellness'] } },
      settings: { create: { language: input.language, currency: input.currency, theme: 'DARK' } },
      verification: { create: { status: 'VERIFIED', provider: 'manual', reviewedAt: new Date(), documentType: 'government_id', documentCountry: input.country } },
    },
    include: { profile: true },
  });
}

async function main() {
  for (const country of countries) {
    await prisma.country.upsert({
      where: { code: country.code },
      update: country,
      create: { ...country, smsSupported: false, minAccountAge: null },
    });
  }
  for (const [code, name, exponent, symbol] of currencies) {
    await prisma.currency.upsert({ where: { code }, update: { name, exponent, symbol }, create: { code, name, exponent, symbol } });
  }
  for (const [code, name, native, rtl] of languages) {
    await prisma.language.upsert({ where: { code }, update: { name, native, rtl }, create: { code, name, native, rtl } });
  }

  const prices = [
    ['PERSONAL_PREMIUM', 'MONTH', 'IN', 'INR', 49900],
    ['PERSONAL_PREMIUM', 'YEAR', 'IN', 'INR', 500000],
    ['PERSONAL_PREMIUM', 'MONTH', '', 'USD', 699],
    ['PERSONAL_PREMIUM', 'YEAR', '', 'USD', 5900],
    ['PERSONAL_PREMIUM', 'MONTH', 'FR', 'EUR', 699],
    ['PERSONAL_PREMIUM', 'YEAR', 'FR', 'EUR', 5900],
    ['PERSONAL_PREMIUM', 'MONTH', 'GB', 'GBP', 599],
    ['PERSONAL_PREMIUM', 'YEAR', 'GB', 'GBP', 4900],
    ['BUSINESS_BLUE_TICK', 'MONTH', 'IN', 'INR', 99900],
    ['BUSINESS_BLUE_TICK', 'YEAR', 'IN', 'INR', 999000],
    ['BUSINESS_BLUE_TICK', 'MONTH', '', 'USD', 1299],
    ['BUSINESS_BLUE_TICK', 'YEAR', '', 'USD', 12900],
  ] as const;
  for (const [product, interval, countryCode, currency, amountMinor] of prices) {
    await prisma.pricePlan.upsert({
      where: { product_interval_countryCode: { product, interval, countryCode } },
      update: { currency, amountMinor, active: true },
      create: { product, interval, countryCode, currency, amountMinor },
    });
  }

  await prisma.platformSetting.upsert({ where: { key: 'appointment_commission_bps' }, update: { value: { bps: 1500 } }, create: { key: 'appointment_commission_bps', value: { bps: 1500 } } });
  await prisma.platformSetting.upsert({ where: { key: 'story_ttl_hours' }, update: { value: { hours: 24 } }, create: { key: 'story_ttl_hours', value: { hours: 24 } } });
  await prisma.platformSetting.upsert({ where: { key: 'report_autohide_threshold' }, update: { value: { count: 5 } }, create: { key: 'report_autohide_threshold', value: { count: 5 } } });

  await prisma.featureFlag.upsert({
    where: { key: 'AdvancedLiveTools' },
    update: {},
    create: {
      key: 'AdvancedLiveTools',
      name: 'Advanced live tools',
      description: 'Pin comments, slow mode, and extra live moderation.',
      enabled: true,
      premiumLaunchAt: new Date('2024-01-01T00:00:00Z'),
      basicLaunchAt: new Date('2027-06-01T00:00:00Z'),
      countries: [],
      platforms: [],
      rolloutPercent: 100,
    },
  });

  const legal = [
    ['privacy', 'Privacy Policy', 'Cyrelle collects the account data you give us, content you publish, and appointment records needed to run bookings. We do not sell private messages. Identity documents are encrypted, minimized, and never shown on public profiles. Advertising uses only coarse signals such as country, language, and interests you choose. You can delete your account; some payment records are retained where the law requires it.'],
    ['terms', 'Terms of Service', 'Cyrelle is a global community for women. Basic is free. Premium is optional. Creating a business profile is free. There is no product marketplace. You must follow the community guidelines. Phone numbers are not used to sign in.'],
    ['community-guidelines', 'Community Guidelines', 'Be respectful. Do not harass, impersonate, or share someone else’s private information. Report content that breaks these guidelines. Businesses may offer services and appointments, not shipped products.'],
    ['safety-policy', 'Safety Policy', 'The Safety Hub can notify emergency contacts you add and record an event. Calling an official number or sending SMS depends on your phone and country. Cyrelle does not silently place calls or send SMS. Auto SOS runs only if you turn it on and cannot detect every emergency. Shake SOS waits five seconds unless you change that countdown, and you can cancel it.'],
    ['premium-terms', 'Premium Terms', 'Premium is ₹499 per month or ₹5,000 per year in India. Other countries use the regional price configured by Cyrelle. Premium adds a Blue Tick after identity verification, enhanced AI, advanced analytics, customization, and early access. Premium does not remove advertisements. It does not include Business Blue Tick. If Premium ends, Premium benefits and the Premium Blue Tick end unless a separate verification badge applies.'],
    ['business-terms', 'Business Terms', 'A standard business profile is free and does not require Premium or Business Blue Tick. Business Blue Tick is a separate optional subscription. Businesses list services and take appointments. Cyrelle is not a product marketplace.'],
    ['appointment-terms', 'Appointment Terms', 'Appointment prices are set by the business. Cyrelle calculates a 15% platform commission on eligible completed bookings on the server. Example: a ₹1,000 service yields ₹150 to Cyrelle and ₹850 to the business before other applicable fees or taxes. Refunds follow the service cancellation policy.'],
    ['advertising-policy', 'Advertising Policy', 'Cyrelle contains advertisements for Basic and Premium members. Ads are labeled Sponsored, Advertisement, or Promoted. Advertisers do not receive private messages or identity documents.'],
    ['verification-policy', 'Verification Policy', 'Cyrelle uses an identity provider, currently Sumsub, to check a government ID and, when that provider flow is configured, a selfie or liveness check. Cyrelle stores the verification result, provider reference, country context, and safe status details. It does not store government ID images, selfie images, or biometric templates. Documents stay with the provider. Premium does not skip verification. Premium Blue Tick requires both an active Premium subscription and a verified identity. Business Blue Tick is a separate business verification and subscription.'],
  ];
  for (const [slug, title, body] of legal) {
    const existing = await prisma.legalDocument.findFirst({ where: { slug, locale: 'en', countryCode: null } });
    if (!existing) await prisma.legalDocument.create({ data: { slug, title, body, locale: 'en' } });
  }

  await user({ email: 'admin@cyrelle.test', name: 'Cyrelle Admin', username: 'cyrelle_admin', role: 'SUPER_ADMIN', country: 'US', language: 'en', currency: 'USD', timezone: 'America/New_York', bio: 'Test super admin. Not a public member.', city: 'New York' });
  await user({ email: 'moderator@cyrelle.test', name: 'Cyrelle Moderator', username: 'cyrelle_mod', role: 'MODERATOR', country: 'GB', language: 'en', currency: 'GBP', timezone: 'Europe/London', bio: 'Test moderator.', city: 'London' });
  const diya = await user({ email: 'diya@cyrelle.test', name: 'Diya Verma', username: 'diyaverma', country: 'IN', language: 'hi', currency: 'INR', timezone: 'Asia/Kolkata', bio: 'Building a quieter kind of confidence.', city: 'Mumbai' });
  const aisha = await user({ email: 'aisha@cyrelle.test', name: 'Aisha Khan', username: 'aishakhan', country: 'US', language: 'en', currency: 'USD', timezone: 'America/New_York', bio: 'Basic member. Studio owner. Blue tick is the business, not me.', city: 'New York' });
  const camille = await user({ email: 'camille@cyrelle.test', name: 'Camille Laurent', username: 'camillelaurent', country: 'FR', language: 'fr', currency: 'EUR', timezone: 'Europe/Paris', bio: 'Lumière, peau, et un rendez-vous à la fois.', city: 'Paris' });
  const noor = await user({ email: 'noor@cyrelle.test', name: 'Noor Alami', username: 'nooralami', country: 'AE', language: 'ar', currency: 'AED', timezone: 'Asia/Dubai', bio: 'هنا لألتقي بنساء يصنعن أشياء جميلة.', city: 'Dubai' });

  await prisma.personalSubscription.upsert({
    where: { id: 'seed_premium_diya' },
    update: {},
    create: { id: 'seed_premium_diya', userId: diya.id, status: 'ACTIVE', interval: 'MONTH', amountMinor: 49900, currency: 'INR', countryCode: 'IN', provider: 'test', providerRef: 'test_seed_diya', currentPeriodEnd: new Date('2027-01-01T00:00:00Z') },
  });
  await prisma.personalSubscription.upsert({
    where: { id: 'seed_premium_camille' },
    update: {},
    create: { id: 'seed_premium_camille', userId: camille.id, status: 'ACTIVE', interval: 'YEAR', amountMinor: 5900, currency: 'EUR', countryCode: 'FR', provider: 'test', providerRef: 'test_seed_camille', currentPeriodEnd: new Date('2027-01-01T00:00:00Z') },
  });

  const bloom = await prisma.businessProfile.upsert({
    where: { username: 'bloomatelier' },
    update: {},
    create: {
      name: 'Bloom Atelier',
      username: 'bloomatelier',
      description: 'A Mumbai studio for skin, calm, and unhurried appointments.',
      category: 'Wellness',
      subcategory: 'Skin',
      countryCode: 'IN',
      city: 'Mumbai',
      timezone: 'Asia/Kolkata',
      email: 'hello@bloomatelier.test',
      members: { create: { userId: diya.id, role: 'OWNER' } },
      verification: { create: { status: 'VERIFIED', reviewedAt: new Date() } },
      hours: { create: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 10 * 60, endMinute: 18 * 60 })) },
    },
  });
  const glam = await prisma.businessProfile.upsert({
    where: { username: 'glamstudio' },
    update: {},
    create: {
      name: 'Glam Studio',
      username: 'glamstudio',
      description: 'New York appointments for hair, color, and camera-ready days.',
      category: 'Beauty',
      subcategory: 'Hair',
      countryCode: 'US',
      city: 'New York',
      timezone: 'America/New_York',
      email: 'hello@glamstudio.test',
      members: { create: { userId: aisha.id, role: 'OWNER' } },
      verification: { create: { status: 'VERIFIED', reviewedAt: new Date() } },
      hours: { create: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 19 * 60 })) },
    },
  });
  await prisma.businessSubscription.upsert({
    where: { businessId: glam.id },
    update: {},
    create: { businessId: glam.id, status: 'ACTIVE', interval: 'MONTH', amountMinor: 1299, currency: 'USD', countryCode: 'US', provider: 'test', providerRef: 'test_seed_glam', currentPeriodEnd: new Date('2027-01-01T00:00:00Z') },
  });
  const sheglow = await prisma.businessProfile.upsert({
    where: { username: 'sheglow' },
    update: {},
    create: {
      name: 'She Glow Studio',
      username: 'sheglow',
      description: 'Paris skin studio. Standard profile, no Blue Tick required.',
      category: 'Beauty',
      subcategory: 'Skin',
      countryCode: 'FR',
      city: 'Paris',
      timezone: 'Europe/Paris',
      members: { create: { userId: camille.id, role: 'OWNER' } },
      verification: { create: { status: 'VERIFIED', reviewedAt: new Date() } },
      hours: { create: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 11 * 60, endMinute: 19 * 60 })) },
    },
  });

  const facial = await prisma.service.upsert({
    where: { id: 'seed_service_facial' },
    update: {},
    create: { id: 'seed_service_facial', businessId: bloom.id, name: 'Signature facial', description: 'Sixty quiet minutes.', category: 'Skin', durationMinutes: 60, priceMinor: 100000, currency: 'INR' },
  });
  await prisma.service.upsert({
    where: { id: 'seed_service_color' },
    update: {},
    create: { id: 'seed_service_color', businessId: glam.id, name: 'Gloss color', description: 'Color and finish.', category: 'Hair', durationMinutes: 90, priceMinor: 18000, currency: 'USD' },
  });

  const settlement = calculateAppointmentCommission({ grossMinor: 100000, currency: 'INR', commissionBps: 1500 });
  const appointment = await prisma.appointment.upsert({
    where: { id: 'seed_appointment_1000' },
    update: {},
    create: {
      id: 'seed_appointment_1000',
      customerId: noor.id,
      businessId: bloom.id,
      serviceId: facial.id,
      startsAt: new Date('2026-09-01T05:30:00Z'),
      endsAt: new Date('2026-09-01T06:30:00Z'),
      timezone: 'Asia/Kolkata',
      status: 'COMPLETED',
    },
  });
  await prisma.appointmentPayment.upsert({
    where: { appointmentId: appointment.id },
    update: {},
    create: {
      appointmentId: appointment.id,
      ...settlement,
      commissionStatus: 'ELIGIBLE',
      paymentStatus: 'SUCCEEDED',
      payoutStatus: 'PENDING',
      provider: 'test',
      providerRef: 'test_seed_appointment',
      receiptNo: 'CYR-SEED1000',
      payout: { create: { businessId: bloom.id, amountMinor: settlement.businessMinor, currency: 'INR', status: 'PENDING', provider: 'test' } },
    },
  });
  await prisma.review.upsert({
    where: { appointmentId: appointment.id },
    update: {},
    create: { appointmentId: appointment.id, businessId: bloom.id, authorId: noor.id, rating: 5, body: 'Unhurried, precise, and kind.' },
  });

  await prisma.follow.upsert({ where: { followerId_followeeId: { followerId: aisha.id, followeeId: diya.id } }, update: {}, create: { followerId: aisha.id, followeeId: diya.id } });
  await prisma.follow.upsert({ where: { followerId_followeeId: { followerId: camille.id, followeeId: diya.id } }, update: {}, create: { followerId: camille.id, followeeId: diya.id } });
  await prisma.follow.upsert({ where: { followerId_followeeId: { followerId: noor.id, followeeId: aisha.id } }, update: {}, create: { followerId: noor.id, followeeId: aisha.id } });

  const post = await prisma.post.upsert({
    where: { id: 'seed_post_diya' },
    update: {},
    create: { id: 'seed_post_diya', authorId: diya.id, body: 'A room of our own, in every time zone. Connect. Create. Grow.', hashtags: ['cyrelle', 'beauty', 'strength'], location: 'Mumbai' },
  });
  await prisma.like.upsert({ where: { userId_postId: { userId: aisha.id, postId: post.id } }, update: {}, create: { userId: aisha.id, postId: post.id } });
  await prisma.comment.upsert({
    where: { id: 'seed_comment_aisha' },
    update: {},
    create: { id: 'seed_comment_aisha', postId: post.id, authorId: aisha.id, body: 'This is the feed I wanted.' },
  });
  await prisma.hashtag.upsert({ where: { tag: 'cyrelle' }, update: { uses: { increment: 1 } }, create: { tag: 'cyrelle', uses: 3 } });

  await prisma.story.upsert({
    where: { id: 'seed_story_diya' },
    update: {},
    create: { id: 'seed_story_diya', authorId: diya.id, kind: 'TEXT', text: 'Good morning. Have a beautiful day.', expiresAt: new Date(Date.now() + 20 * 60 * 60 * 1000) },
  });
  await prisma.reel.upsert({
    where: { id: 'seed_reel_camille' },
    update: {},
    create: { id: 'seed_reel_camille', authorId: camille.id, businessId: sheglow.id, caption: 'A Paris morning, slowed down.', videoUrl: 'https://example.com/cyrelle/reel-seed.mp4', hashtags: ['paris', 'cyrelle'], edit: { filter: 'silver', brightness: 0.05 } },
  });

  await prisma.emergencyContact.upsert({
    where: { id: 'seed_contact_diya' },
    update: {},
    create: { id: 'seed_contact_diya', userId: diya.id, name: 'Meera Verma', relationship: 'Sister', email: 'meera@cyrelle.test', phone: '+919800000000' },
  });

  const conversation = await prisma.conversation.upsert({
    where: { id: 'seed_conversation' },
    update: {},
    create: {
      id: 'seed_conversation',
      kind: 'DIRECT',
      createdBy: aisha.id,
      members: { create: [{ userId: aisha.id }, { userId: diya.id }] },
      messages: { create: [{ senderId: aisha.id, body: 'Your atelier page looks ready.' }, { senderId: diya.id, body: 'Thank you. The profile is free. The tick on yours is the business one.' }] },
    },
  });
  void conversation;

  const advertiser = await prisma.advertiser.upsert({
    where: { id: 'seed_advertiser' },
    update: {},
    create: { id: 'seed_advertiser', name: 'Glam Studio', ownerId: aisha.id, businessId: glam.id, countryCode: 'US' },
  });
  const campaign = await prisma.adCampaign.upsert({
    where: { id: 'seed_campaign' },
    update: {},
    create: { id: 'seed_campaign', advertiserId: advertiser.id, name: 'Autumn gloss', status: 'ACTIVE', budgetMinor: 50000, currency: 'USD', countries: [], languages: [] },
  });
  await prisma.advertisement.upsert({
    where: { id: 'seed_ad' },
    update: {},
    create: { id: 'seed_ad', campaignId: campaign.id, placement: 'FEED', label: 'SPONSORED', title: 'Glam Studio — gloss color', body: 'Book a chair in New York. This is a sponsored placement.', destination: '/business/glamstudio', status: 'ACTIVE' },
  });

  console.log('Seeded Cyrelle test data. Password for every seeded account: CyrelleTest!2026');
  console.log('admin@cyrelle.test diya@cyrelle.test aisha@cyrelle.test camille@cyrelle.test noor@cyrelle.test');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
