# ChauffeursHub secure driver authentication (staged)

This feature is intentionally isolated on `feature/secure-driver-auth`. It does not alter the live ChauffeursHub page, Taxi Planner, or existing address-request endpoints.

## API

`POST /api/chauffeur-auth`

- `{ "action": "provision", "adminSecret": "...", "driverNumber": "1001", "name": "Driver name", "pin": "6-12 digits" }`
  - Requires the server-side `HUB_ADMIN_SECRET`.
  - Stores only a salted scrypt PIN hash in private Vercel Blob storage.
  - Re-provisioning a driver number replaces that driver's credential record.
- `{ "action": "login", "driverNumber": "1001", "pin": "..." }`
  - Returns a signed, eight-hour bearer token.
- `{ "action": "verify" }` with `Authorization: Bearer <token>`
  - Verifies the token and returns the authenticated driver's number/name.

## Required Vercel environment variables

Set these as **Sensitive** for Production, Preview, and Development:

- `HUB_AUTH_SECRET`: a newly generated random secret of at least 32 bytes.
- `HUB_ADMIN_SECRET`: a separate newly generated random secret of at least 32 bytes.

Do not reuse any secrets previously pasted into a chat or exposed in logs. After adding variables, redeploy the API.

## Important rollout gates

- This API is not yet wired into the ChauffeursHub frontend.
- Do not send child names, addresses, or real trip data to the frontend until authenticated, driver-scoped trip endpoints are implemented and tested.
- The current address-request API remains separate and is not made secure by this feature.
- Origin checks are browser controls, not authentication.
- Before production rollout, add durable login throttling/lockout and audit logging, then test on a separate demo dataset.
- Keep this branch isolated until those gates and a full end-to-end test are complete.
