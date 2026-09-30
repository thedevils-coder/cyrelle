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

Manual review is an admin decision on records whose provider is `manual`. Admins cannot set a Sumsub record to `VERIFIED` or `FAILED`. Those results arrive only from a signed Sumsub webhook. Admins can still move a record to manual review or restricted, and that action is audited.

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

A later completed webhook can replace an earlier result. Sumsub documents that an approved applicant can later receive `RED`, including `FINAL` or `RETRY`. Cyrelle accepts that, and it accepts `FAILED` becoming `VERIFIED` after a real resubmission. It does not let `applicantCreated` or `applicantPending` move `VERIFIED`, `RESTRICTED`, or `MANUAL_REVIEW` backward. `applicantReset` can return a live check to `IN_PROGRESS`. `applicantDeleted` and `applicantDeactivated` set `CANCELLED`. A cancelled check is not reopened by a later webhook.

An event is stale when `createdAtMs` is missing or older than `lastProviderEventAt`. A stale event is stored and not applied. The same `correlationId` is stored once and does not create a second notification or change entitlements. Sumsub does not publish an expired review status, so this provider does not write `EXPIRED`.

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

Sumsub's webhook manager signs the raw HTTP body bytes with the webhook secret from the webhook configuration. That secret is separate from the app token secret used for `X-App-Access-Sig`. The headers are `X-Payload-Digest` and `X-Payload-Digest-Alg`. New webhooks default to `HMAC_SHA256_HEX`. `HMAC_SHA512_HEX` is optional. `HMAC_SHA1_HEX` is legacy: webhooks created before the SHA256 default, with no algorithm chosen, still send SHA1 until edited. Cyrelle follows the algorithm header. Sumsub's published `testDigest` sample response is labeled `HMAC_SHA256_HEX` but the digest of `someText` is the SHA-1 value; the verifier does not treat that sample as SHA-256.

The Nest app is created with `rawBody: true`. The digest is computed on those bytes, not on `JSON.stringify` of the parsed body. Comparison uses `timingSafeEqual` on lowercase hex and rejects a missing algorithm, an unknown algorithm, or a different length. Invalid signatures return 401. Sumsub treats 401, 403, and 404 as permanent delivery failures. A missing webhook secret returns 503 and does not crash the API.

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

Sumsub's recommended device integration is `@sumsub/react-native-mobilesdk-module` (current docs: 1.46.1). It is a native module. Importing it breaks Expo Go, so it is not a dependency of this app.

The shipping app uses the official WebSDK (`https://static.sumsub.com/idensic/static/sns-websdk-builder.js`) in an iframe on web. On native it loads that same WebSDK in `react-native-webview`. Sumsub documents this WebView path as a fallback and requires local storage, camera access, inline HTML5 video, and fullscreen autoplay disabled. Older iOS builds may only expose the camera through Safari or `SFSafariViewController`. The WebView stays on `https://*.sumsub.com`, enables DOM storage, grants media capture, and disables fullscreen video. The page receives only a short-lived SDK access token. SDK events do not set `VERIFIED`; the screen polls Cyrelle, and the webhook is the decision.

See `docs/sumsub-setup.md` for the development-build steps if you later install the native module.

## Account deletion

Cyrelle calls Sumsub `PATCH /resources/applicants/{applicantId}/presence/deactivated` when an applicant id exists and credentials are configured. Sumsub's current deactivate method hides the profile from operators and ignores it in duplicate checks. The record remains in Sumsub's database and can be reactivated with `activated`. Sumsub also refuses deactivation while review status is `pending`, `queued`, or `prechecked`. This call does not permanently delete Sumsub data. Permanent deletion, when an account has it, is a separate Sumsub dashboard owner action and is often limited and archived first. Cyrelle then clears its own provider ids, reasons, and any legacy document ciphertext, and sets the local status to `CANCELLED`. Financial records can remain where the law requires them. If the Sumsub call fails, Cyrelle still completes local deletion and writes an audit row with `deactivated: false` and `permanentDeletion: false`.

## Country coverage

The member's ISO country code is converted to alpha-3 and sent as `fixedInfo.country` when the code is known. Document types, selfie, and liveness come from the Sumsub verification level named by `SUMSUB_LEVEL_NAME`. Cyrelle does not hard-code an India-only document list. Unknown country codes are omitted so Sumsub can collect the country inside the level.
