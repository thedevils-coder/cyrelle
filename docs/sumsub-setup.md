# Sumsub setup

Cyrelle uses the current Sumsub API at `https://api.sumsub.com`. Sandbox and production are selected by the app token you create in that environment. There is not a separate sandbox host. Do not put tokens in source code. Leave the variables empty to run Cyrelle without calling Sumsub.

Official references used by this integration:

- Authentication: https://docs.sumsub.com/reference/authentication
- Create applicant: https://docs.sumsub.com/reference/create-applicant
- Get applicant by external user id: https://docs.sumsub.com/reference/get-applicant-data-via-externaluserid
- Generate access token: https://docs.sumsub.com/reference/generate-access-token
- Review status: https://docs.sumsub.com/reference/get-applicant-review-status
- Applicant statuses: https://docs.sumsub.com/docs/applicant-statuses
- User verification webhooks: https://docs.sumsub.com/docs/user-verification-webhooks
- Webhook manager: https://docs.sumsub.com/docs/webhook-manager
- WebSDK: https://docs.sumsub.com/docs/get-started-with-web-sdk
- React Native module: https://docs.sumsub.com/docs/react-native-module
- Deactivate applicant: https://docs.sumsub.com/reference/deactivate-applicant-profile

## 1. Create a Sumsub account

Create a Sumsub account and open the sandbox environment in the dashboard before creating production credentials.

## 2. Obtain sandbox credentials

In the sandbox dashboard, generate an app token. Sumsub shows the app token and secret key once. Store them outside the repository.

The token needs permission to create applicants, view applicants, generate access tokens, and reset applicants if you later use reset from the dashboard. Deactivation on account deletion needs permission to change applicant presence.

## 3. Configure the verification level

Create an individual verification level in the same sandbox environment. The level name is case-sensitive. Sumsub's own examples use `basic-kyc-level`. Set `SUMSUB_LEVEL_NAME` to the exact name.

Add the steps you want on that level: government ID, selfie, and liveness. Cyrelle does not choose document types in code. Sumsub shows the documents that level allows for the applicant's country.

## 4. Configure the webhook

In Dev space, open Webhooks and the Webhook manager, then create a webhook.

- Receiver type: HTTP address
- Target: `https://<your-public-https-host>/v1/identity-verification/sumsub/webhook`
- Applicant type: Individual
- Types: `applicantCreated`, `applicantPending`, `applicantReviewed`, `applicantOnHold`, `applicantReset`, `applicantWorkflowCompleted`, `applicantWorkflowFailed`
- Secret key: the value you will put in `SUMSUB_WEBHOOK_SECRET`
- Signature algorithm: SHA256, which Sumsub sends as `HMAC_SHA256_HEX`

Sumsub only delivers webhooks to HTTPS. For local development, expose the API with an HTTPS tunnel and use that URL as the target. The endpoint must respond within Sumsub's timeout. It does not require a Cyrelle user token. Invalid signatures return 401, which Sumsub treats as a permanent delivery failure.

A dashboard test webhook includes `"testMode": true`. Cyrelle still verifies the signature and will apply the event when it matches a Cyrelle user.

## 5. Add environment variables

Copy `.env.example` to `apps/api/.env` if you have not already. Set:

```text
SUMSUB_ENVIRONMENT=sandbox
SUMSUB_APP_TOKEN=
SUMSUB_SECRET_KEY=
SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_WEBHOOK_SECRET=
SUMSUB_LEVEL_NAME=basic-kyc-level
SUMSUB_TOKEN_TTL_SECS=600
IDENTITY_VERIFICATION_MAX_RETRIES=3
```

`SUMSUB_ENVIRONMENT=sandbox` is the local and CI setting. The token itself selects the Sumsub sandbox or production dashboard, and both dashboards use `https://api.sumsub.com`. Cyrelle still refuses `SUMSUB_ENVIRONMENT=production` unless `NODE_ENV=production` or `ALLOW_SUMSUB_PRODUCTION=true`. That stop is there so a production token pasted into a laptop or a test run does not call production. Tests set `SUMSUB_BASE_URL` to `http://127.0.0.1:9` and also refuse `api.sumsub.com` while `NODE_ENV=test`.

Leave any of `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, or `SUMSUB_WEBHOOK_SECRET` empty and the API still boots. Start, retry, and token refresh return 503. A webhook with no secret returns 503. Never commit the filled `.env` file. `.env` is gitignored. `.env.example` has empty secret fields.

## 6. Run Cyrelle locally

Follow the root README: migrate, seed, and start the API, web, and admin apps. Start the mobile app with `npm run dev:mobile`. The API base for the phone must be reachable from the device (`EXPO_PUBLIC_API_URL`).

## 7. Test verification

1. Register with email. Do not add a phone number.
2. Open Profile, then Verify identity.
3. Read the explanation and continue.
4. Complete the Sumsub flow with sandbox documents described in Sumsub's sandbox documentation.
5. Return to Cyrelle and use Check result, or wait for the webhook.

The screen can say the check was submitted before Cyrelle shows verified. The profile badge waits for the webhook.

## 8. Verify webhook delivery

In the Webhook manager, confirm the delivery succeeded. In admin, open Identity verifications, filter if needed, and open History. You should see `SUMSUB_WEBHOOK_RECEIVED` in the audit log and the mapped status. You should not see document images or document numbers.

## 9. Test success

Use a sandbox applicant that Sumsub approves. Cyrelle status becomes `VERIFIED`. The member notification says: "Your identity verification is complete."

Premium Blue Tick still requires Premium. Subscribe the test member, then confirm the tick. A verified Basic member does not get the tick.

## 10. Test failure

Use a sandbox path that Sumsub rejects with resubmission (`reviewRejectType` `RETRY`). Status becomes `FAILED`. The member can retry until `IDENTITY_VERIFICATION_MAX_RETRIES`. The notification does not include document numbers.

## 11. Test manual review

Use a level or sandbox signal that puts the applicant `onHold`. Status becomes `MANUAL_REVIEW`. The member sees: "Your verification is being reviewed. We'll notify you when it's complete."

Admins can set manual review or restricted on a record. They cannot mark a Sumsub record verified or failed from Cyrelle. Final `RED` results become `RESTRICTED` and remove Premium Blue Tick. A `RETRY` rejection becomes `FAILED` and also removes the tick, even while Premium is active.

## 12. Move to production

- Create a production app token and webhook secret. Do not reuse sandbox tokens.
- Create the production verification level with the same steps you intend to run, and set `SUMSUB_LEVEL_NAME` to that exact name.
- Set `SUMSUB_ENVIRONMENT=production`.
- Point the production webhook at the public API over HTTPS with SHA256.
- Confirm the API process has the secrets injected by the host, not by a committed file.
- Run a single sandbox-to-production checklist applicant before inviting members.
- Confirm account deletion deactivates the Sumsub applicant and that an owner requests permanent deletion in the Sumsub dashboard when your Sumsub contract provides that action.
- Confirm logs and admin screens still show no document images, access tokens, or secrets.

## Mobile integration

Current Sumsub docs describe two mobile paths.

The recommended device SDK is `@sumsub/react-native-mobilesdk-module` (docs currently list 1.46.1):

https://docs.sumsub.com/docs/react-native-module

It is not installed here. A static import breaks Expo Go because Metro resolves the native module. The existing app keeps working in Expo Go and Expo web without it.

The path this repository ships is Sumsub's documented WebView fallback for WebSDK: https://docs.sumsub.com/docs/get-started-with-web-sdk. Web uses an iframe. Native uses `react-native-webview` with DOM storage, inline playback, camera and microphone capture, fullscreen autoplay disabled, and navigation limited to `https://*.sumsub.com`. Older iOS versions may only allow the camera in Safari or `SFSafariViewController`. The screen does not treat an SDK callback as `VERIFIED`.

### Run the current app

```text
npm run dev:mobile
```

That starts Expo. Use Expo Go or a web browser. Point `EXPO_PUBLIC_API_URL` at an API the device can reach.

### Add the native module later

Do this in a development build, not by adding the package to the Expo Go app.

1. `npx expo install expo-dev-client`
2. `npm install @sumsub/react-native-mobilesdk-module --workspace @cyrelle/mobile`
3. Android: Kotlin 1.9.25, `minSdkVersion` 23, and this Maven repository in `android/build.gradle`:

```groovy
maven { url "https://maven.sumsub.com/repository/maven-public/" }
```

4. iOS: platform `13.0`, bitcode off, and these sources at the top of `ios/Podfile`:

```ruby
source 'https://cdn.cocoapods.org/'
source 'https://github.com/sumsub/Specs.git'
```

5. Keep the camera, microphone, photo, and location purpose strings already in `apps/mobile/app.json`.
6. `npx expo prebuild` from `apps/mobile`, then `npx expo run:ios` or `npx expo run:android`.
7. Initialize with `SNSMobileSDK.init(accessToken, expirationHandler)`. Keep requesting tokens from `POST /v1/identity-verification/start` and `POST /v1/identity-verification/token`. Do not put the Sumsub secret in the app. Keep the webhook as the decision. SDK statuses such as Approved are not authoritative.
