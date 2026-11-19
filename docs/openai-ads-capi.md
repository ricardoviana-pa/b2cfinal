# OpenAI Ads – CAPI (B2C)
 
The GTM Pixel already sends page_viewed, contents_viewed, items_added, checkout_started,
order_created and lead_created. This server integration adds only checkout_started
and order_created for the current booking-intent checkout. It is independent of Meta.

- checkout_started: server trusted quote total, same begin_checkout.event_id as GTM.
- order_created: paid hook, stay-only value (same canonical amount and Guesty confirmation code as GTM).
- Values in EUR cents; invalid values are omitted, not replaced with zero.
- Same Pixel ID and event ID on browser/server; OpenAI deduplicates.
- OpenAI click/browser references are read only after live measurement consent and
  stored in the existing short-lived ad signals record. Revocation deletes the record.
  Meta cookies, IP, contact details and capability URLs are not sent to OpenAI.
- No retrospective sends, B2B, legacy checkout, or server-side lead tracking in this PR.

## Enable in Render

Do not enable until the privacy notice, cookie information and consent scope cover this
provider and its CAPI data; confirm any required renewed consent. Configure server-only
environment variables:
 
- OPENAI_ADS_PIXEL_ID: the existing PA - Pixel Conv ID in Ads Manager.
- OPENAI_CONVERSIONS_API_KEY: private conversion key (never in GTM or Git).
- OPENAI_CAPI_ENABLED=true: explicit server enablement, off by default.
- VITE_OPENAI_CAPI_ENABLED=true: build-time public feature flag (not a secret); enables OpenAI reference collection only after measurement consent. Existing Meta-only consent records do not qualify for OpenAI delivery.
- OPENAI_CAPI_VALIDATE_ONLY=true: first validate request format without recording events.

Deploy, confirm database migrations, check non-consented and consented checkout with
validation enabled, then remove validate-only for live measurement. Test a genuine
booking with the same event ID in both channels. Confirm value, currency and
deduplication in Ads Manager. Disable by setting OPENAI_CAPI_ENABLED=false.
 
Official reference: https://developers.openai.com/ads/conversions-api
