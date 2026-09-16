# DEV is an isolated visual preview

Policy set by Ricardo on 16 September 2026: production customer data, sessions,
credentials, reservations, payments and messages must never be routed to DEV.

## Current deployment

The `b2c-dev` Render service has only `APP_ENV=preview`, its DEV `SITE_URL`,
`CHECKOUT_RECOVERY=false`, and a unique `JWT_SECRET`. It has no database or
operational provider credentials. Production settings are independent.

DEV serves repository-owned public content and the synthetic checkout at
`/pt/checkout/demo`. It cannot quote live availability, create reservations,
charge payments, capture leads, send email, sign in with production identities
or call Guesty. Those limitations are intentional. A dedicated sandbox with
synthetic data must be implemented before backend checkout testing is enabled.
Do not restore production credentials to make a test pass.

## Controls

- Bootstrap refuses operational credentials in previews before provider modules load.
- DEV is detected by deployment identity, branch, explicit mode or non-live site
  URL. Node's production build mode does not imply a production deployment.
- Database connections are blocked in preview even if environment variables change.
- Guesty authentication rejects preview calls before reading any token cache.
- Incoming writes/webhooks are rejected before parsing; tRPC mutations are also
  blocked for internal callers.
- The preview CSP blocks remote scripts, external fetches, payment frames and
  external form submissions. Public image assets remain available for design review.
- The production GTM container and Bókun booking widgets do not load outside the
  live site. DEV does not delete parent-domain production measurement cookies.
- The DEV session signing secret is independent. Existing session cookies are
  host-only, with no parent-domain session cookie configured in the application.
- Old customer recovery/opt-out email links are forwarded to production without
  reading booking data in DEV. Never follow an opt-out link merely to test it:
  the destination changes the customer's preference.

## Deployment and testing

This change targets `dev`. Production URL/payment configuration is unchanged.
The environment-aware guards remain safe to merge into `main` in a future release.
Tests cover all blocked credential keys, DB/Guesty isolation, mutation rejection,
tracking exclusion and old-link compatibility. Use only synthetic identifiers in
DEV tests. No production customer record should be opened or copied into DEV.
