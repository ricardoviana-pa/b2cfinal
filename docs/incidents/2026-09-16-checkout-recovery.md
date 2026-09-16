# Checkout recovery domain incident — 16 September 2026

DEV and production shared `booking_intents`. Both ran the recovery scheduler by
 default. The atomic stage claim prevented duplicate emails but allowed DEV to
win the claim and construct customer links with its own `SITE_URL`. DEV uses
test payments, so these links sent real customers to the wrong checkout.

## Fix

- Recovery requires `CHECKOUT_RECOVERY=true` and an explicit HTTPS production
  site URL. Non-main Render branches and development runtimes are rejected
  before querying or claiming any shared intents. Unset means disabled.
- All recovery, opt-out and guest confirmation links use the canonical live
  website. Their destination is independent of preview URL configuration.
- Existing DEV email links with the exact recovery campaign parameters redirect
  to the same production checkout with an uncached 302. Normal DEV checkouts,
  APIs and payment callbacks are unaffected.

## Deployment

Production (`main`): `SITE_URL=https://www.portugalactive.com`,
`CHECKOUT_RECOVERY=true`. DEV (`dev`): keep its existing DEV `SITE_URL`, set
`CHECKOUT_RECOVERY=false`. Configuration changes need a Render deployment.

The hotfix must reach both branches: DEV needs the old-link redirect and guard;
production needs the explicit guard and canonical email URLs. No database
migration, reservation, payment, quote or recovery-stage reset is required.

## Verification

Tests cover production opt-in, DEV rejection, no database access or scheduler
in DEV, both email stages, claim idempotency, canonical links, old-link redirects
and exclusions. Payment tests use mocks; no customer payment is executed.

## Remaining environment work

The underlying shared database and operational provider access are still shared
in parts. Separate DEV storage and outbound integrations in a dedicated change;
this hotfix contains the recovery-email incident, not full environment isolation.
