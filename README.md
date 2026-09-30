# Cyrelle

Cyrelle is a global community for women: social profiles, free business profiles, appointment booking, AI tools, messaging, live, a safety hub, Premium, Business Blue Tick, and labeled advertising.

India is one supported market. Premium’s reference price there is **₹499 per month** or **₹5,000 per year**. Other countries use regional prices an admin can change. A standard business profile is free. Business Blue Tick is a separate subscription. Eligible completed appointments pay Cyrelle a **15%** commission, calculated on the server.

## Account model

```text
Personal account          Business profile
├── Basic — free          ├── Standard — free
└── Premium — paid        └── Business Blue Tick — paid separately
```

Premium does not grant Business Blue Tick, and Business Blue Tick does not grant Premium. Premium does not remove advertisements.

People join with email or Google. A phone number is never required to register, sign in, or reset a password. Emergency contacts may optionally include a phone number. There is no universal 18+ gate. A country can set its own minimum age.

## Apps

| App | Path | Purpose |
| --- | --- | --- |
| API | `apps/api` | NestJS, Prisma, PostgreSQL, Socket.IO, BullMQ |
| Web | `apps/web` | Global landing page |
| Admin | `apps/admin` | Platform administration |
| Mobile | `apps/mobile` | Expo app |
| Shared | `packages/shared` | Money, commission, entitlements, feature flags, i18n |

## Local development

Requirements: Node.js 22, PostgreSQL 16, Redis 7.

```bash
cp .env.example apps/api/.env
# Create the database, then:
npm install
npm run build --workspace @cyrelle/shared
npm run db:migrate --workspace @cyrelle/api
npm run db:seed --workspace @cyrelle/api
npm run dev:api
npm run dev:web
npm run dev:admin
```

The worker is `npm run start:worker --workspace @cyrelle/api`. It expires stories, rolls test-provider subscriptions, and sends appointment reminders. Queues use Redis when `ENABLE_QUEUES` is not `false`.

Seeded password for every test account: `CyrelleTest!2026`

| Email | What it shows |
| --- | --- |
| `admin@cyrelle.test` | Super admin |
| `moderator@cyrelle.test` | Moderator |
| `diya@cyrelle.test` | Premium member in India, standard business Bloom Atelier |
| `aisha@cyrelle.test` | Basic member, Business Blue Tick on Glam Studio |
| `camille@cyrelle.test` | Premium member in France, standard business She Glow Studio |
| `noor@cyrelle.test` | Basic member in the UAE |

Bloom Atelier has a completed ₹1,000 facial. The stored settlement is ₹150 commission and ₹850 for the business.

API: `http://localhost:4000/v1`  
Landing: `http://localhost:5173`  
Admin: `http://localhost:5174`  
Mobile: `npm run dev:mobile` then open Expo. Web preview: `npm run web --workspace @cyrelle/mobile`.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

Compose starts PostgreSQL, Redis, the API, the worker, the landing page, and admin. Run migrations inside the API container:

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api npm run db:seed
```

## Payments

`PAYMENT_PROVIDER` selects `test`, `stripe`, or `razorpay`. The test provider completes charges immediately and never stores card numbers. Stripe and Razorpay adapters create provider objects and verify webhooks. Raw card data is not accepted.

Appointment amounts come from the service price. A client cannot submit the commission. Completion marks the commission eligible and creates a payout for the business remainder.

## Safety

SOS notifies emergency contacts and stores a timestamped event. Official numbers come from the country record (911, 112, 999, and others are data, not global constants). The API does not claim it can silently call or send SMS. Shake SOS and Auto SOS stay off until a member turns them on. Shake SOS uses a cancellable countdown, five seconds by default.

## Identity

Identity checks use Sumsub when the app token, app secret, and webhook secret are all set. Cyrelle stores the result and the Sumsub applicant reference. It does not store government ID images, selfies, or biometric templates. Web uses Sumsub WebSDK. Native uses that WebSDK inside a WebView, which Sumsub documents as a fallback; the React Native module needs a development build. A signed webhook is the only authoritative result. Premium Blue Tick requires an active Premium subscription and status `VERIFIED`. See `docs/sumsub-setup.md` and `docs/identity-verification-architecture.md`.

Without Sumsub credentials the rest of Cyrelle still runs. Starting verification returns a user-facing unavailable message. Sandbox and production both use `https://api.sumsub.com`; the app token selects the Sumsub environment.

## Tests

```bash
npm test
```

Shared tests cover the ₹1,000 / 15% / ₹850 settlement, entitlements, feature-flag early access, usernames, and SOS. API tests run against PostgreSQL and reject phone registration, skip a universal 18+ gate, ignore a client-supplied commission, and remove the Premium Blue Tick when Premium ends.

## Store disclosures

See `apps/mobile/store/listing.md` for App Store and Play listing notes: permissions, subscriptions, ads, account deletion, and emergency limits.
