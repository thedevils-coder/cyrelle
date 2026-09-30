# Identity verification architecture

Cyrelle checks eligibility with an identity provider. Sumsub is the first provider. Cyrelle does not inspect government ID images or run its own liveness model.

## Components

```text
IdentityVerificationService
├── SumsubIdentityVerificationProvider
│   └── SumsubClient  (signed HTTPS calls only)
├── ManualIdentityVerificationProvider
└── future providers (Persona, Veriff, others)
```

`IdentityVerificationService` is the only application entry point for starting a check, refreshing a session, retrying, reading status, and deactivating a provider applicant on account deletion.

`SumsubWebhookService` accepts Sumsub webhooks, checks the signature, and updates Cyrelle status. Mobile and web clients cannot set `VERIFIED`.

Manual review is an admin decision on records whose provider is `manual`. Sumsub records are not marked verified from the admin dashboard. Admins can move a record to manual review or restricted.

## What Cyrelle stores

- Status
- Provider name
- Sumsub applicant id and inspection id
- Cyrelle user id as Sumsub `externalUserId`
- Country code taken from the member profile when the check starts
- Safe reject-label codes
- Retry count, timestamps, and webhook event ids

Cyrelle does not store government ID images, selfie images, biometric templates, document numbers, or Sumsub free-text review comments. Those comments can contain document data, so they are ignored.

Legacy columns `documentCipher` and `selfieCipher` remain for old rows. New checks do not write them. The admin document endpoint does not return them.

## Status mapping

Sumsub names stay in `apps/api/src/modules/verification/sumsub/status-map.ts`.

| Sumsub signal | Cyrelle status | Member can retry |
| --- | --- | --- |
| `reviewAnswer` `GREEN` with `reviewStatus` `completed`, or `applicantReviewed` / `applicantWorkflowCompleted` with `GREEN` | `VERIFIED` | No |
| `applicantPending`, or `reviewStatus` `pending`, `queued`, `prechecked` | `SUBMITTED` | No |
| `applicantOnHold` or `reviewStatus` `onHold` | `MANUAL_REVIEW` | No |
| `RED` with `reviewRejectType` `RETRY` | `FAILED` | Yes, within the limit |
| `RED` with `reviewRejectType` `FINAL` | `RESTRICTED` | No |
| `init`, `applicantCreated`, `applicantReset` | `IN_PROGRESS` | Resume, not a counted retry |
| `applicantDeleted` | `CANCELLED` | No |

`reviewAnswer` is applied only when the review is completed, matching Sumsub's rule. Personal-info webhooks do not change status.

A later webhook can replace an earlier result. Sumsub documents that an approved applicant can later receive `RED`. An older `createdAtMs` does not overwrite a newer result. The same `correlationId` is stored once and does not create a second notification.

## Retries

`IDENTITY_VERIFICATION_MAX_RETRIES` defaults to 3. It counts retries after the first session, not the first session itself. A `FINAL` rejection sets `canRetry` to false. A `RETRY` rejection can open another Sumsub WebSDK token without resetting the applicant. Sumsub asks the member to repeat the failed step. Full applicant reset is intentionally not called, because Sumsub warns against resetting final rejections and against resetting checks that are still pending.

## Premium Blue Tick

Blue Tick is calculated on the server by `resolvePersonalEntitlements`:

```text
premiumBlueTick = active Premium subscription AND verification status VERIFIED
```

Basic plus verified does not show it. Premium plus failed, restricted, or expired verification does not show it. An independent badge, if an admin set one on the verification row, can remain after Premium ends and does not grant other Premium entitlements. Personal Premium never grants Business Blue Tick.

The value is derived when entitlements are read. The webhook records the derived value in the audit log inside the same database transaction as the status change. There is no second stored flag for the client to edit.

## API

Authenticated:

- `POST /v1/identity-verification/start`
- `GET /v1/identity-verification/status`
- `POST /v1/identity-verification/retry`
- `POST /v1/identity-verification/token` for WebSDK token expiry
- `GET /v1/identity-verification/history`

Webhook, public and signature-checked:

- `POST /v1/identity-verification/sumsub/webhook`

`GET /v1/verification` returns the same status. `POST /v1/verification` no longer accepts document uploads.

Status and history are always loaded for the signed-in user. There is no user id parameter.

## Webhook security

Sumsub signs the raw body with the webhook secret and sends `X-Payload-Digest` plus `X-Payload-Digest-Alg` (`HMAC_SHA256_HEX`, `HMAC_SHA512_HEX`, or legacy `HMAC_SHA1_HEX`). Cyrelle compares the digest with a timing-safe check. Missing or unknown algorithms are rejected. The endpoint uses the raw request bytes, not a re-serialized JSON body.

Rejected webhooks write `SUMSUB_WEBHOOK_REJECTED` with a reason code only. Accepted webhooks write `SUMSUB_WEBHOOK_RECEIVED` and, when the status changes, one of:

- `IDENTITY_VERIFICATION_STARTED`
- `IDENTITY_VERIFICATION_SUBMITTED`
- `IDENTITY_VERIFICATION_VERIFIED`
- `IDENTITY_VERIFICATION_FAILED`
- `IDENTITY_VERIFICATION_MANUAL_REVIEW`
- `IDENTITY_VERIFICATION_RESTRICTED`
- `IDENTITY_VERIFICATION_RETRY`

Logs include status codes and Sumsub correlation ids. They do not include access tokens, secrets, document numbers, or images.

Start and retry are limited to 30 requests a minute per client. The webhook limit is separate and higher so Sumsub retries are not blocked by member traffic.

## Mobile

Expo Go cannot load `@sumsub/react-native-mobilesdk-module` because that package needs a development build. The app therefore uses Sumsub WebSDK, which Sumsub documents for web, inside a WebView on native and an iframe on web. The page loads `https://static.sumsub.com/idensic/static/sns-websdk-builder.js` and receives only a short-lived SDK access token from the Cyrelle API. The SDK calls back to the API for a new token. The screen polls Cyrelle for the result. SDK events are not treated as the decision.

A production binary that needs the native camera flow can add the official React Native module in a development build. See `docs/sumsub-setup.md`.

## Account deletion

Cyrelle calls Sumsub `PATCH /resources/applicants/{applicantId}/presence/deactivated` when an applicant id exists and credentials are configured. That deactivates the profile. It does not permanently delete Sumsub data. Permanent deletion is a Sumsub dashboard action for accounts that have the delete permission, and some accounts archive data before removal. Cyrelle then clears its own provider ids, reasons, and any legacy document ciphertext. Financial records can remain where the law requires them. If the Sumsub call fails, Cyrelle still completes local deletion and writes an audit row with `deactivated: false`.

## Country coverage

The member's ISO country code is converted to alpha-3 and sent as `fixedInfo.country` when the code is known. Document types, selfie, and liveness come from the Sumsub verification level named by `SUMSUB_LEVEL_NAME`. Cyrelle does not hard-code an India-only document list. Unknown country codes are omitted so Sumsub can collect the country inside the level.
