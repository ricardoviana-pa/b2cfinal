# Owner intake — 3 November 2026

## Requested outcome

Ricardo requested a complete qualification form for property owners and a clean replacement for duplicate notifications. He confirmed that income brackets mean **annual net income expected by the owner** and chose **one complete email to management@portugalactive.com**, without a private sales portal or new logins.

The form covers contact details, locality/address, Portuguese postcode, property type, bedrooms, description, previous tourism operation, licence status, occupation, sale status and interest in PA real estate, intended launch date, expected net income, photo links and attachments. Phone and email are mandatory in the new form. The owner can explicitly choose to supply photos later.

## Existing delivery diagnosis

Read-only examination of relevant notification headers confirmed a Make-origin email sent through the former marketer's account and an ActiveCampaign notification, both delivered to the management distribution group. Historical PHP source invokes both circuits after contact synchronisation and can acknowledge success before the remaining work finishes. The historical source does not by itself establish the exact current configuration on cPanel.

The replacement does not invoke either integration. Existing messages and unrelated automations remain untouched. Direct access to the historical cPanel endpoint is a separate surface; changing the main website's Worker does not remove that endpoint or revoke its credentials.

## Delivery contract

- `POST /api/owner-enquiries`: validated version 3 form, mandatory email/phone and qualification fields.
- `POST /api/owner-enquiries/legacy`: compatible old form submissions, explicitly marked incomplete; unknown information is never invented.
- `/management/assets/activecampaign-proxy.php`: retained in the B2B Worker as a compatibility route to the new legacy intake, never a fallback to AC/Make.
- Success means the request, private attachment bytes and notification intent have committed to the production database. It does not claim inbox delivery.
- UUID plus a payload fingerprint prevents retries from creating another record or silently changing an existing request. Notifications use a database lease and a stable provider idempotency key.
- One structured HTML/plain-text email goes to management, with the owner as Reply-To and actual attachment files. No portal login is required.
- Files: JPEG, PNG, WebP or PDF; up to 8 files, 5 MiB each, 15 MiB combined. The combined limit leaves room for base64 encoding within ordinary mailbox message limits. Check extension, declared media type, signature and decoded size; do not expose public file URLs.
- Preview environments cannot write to the intake or invoke live integrations. Test data is synthetic; production data and credentials are never copied to DEV.

## Release order and rollback

1. Record production source/deployment IDs. Validate types, regression tests, build, the new form and a synthetic email preview.
2. Publish the B2C backend first. Its startup migration creates only new intake tables. Existing booking, customer and lead tables are not altered. Confirm intake readiness by GET before changing the public form.
3. Publish the B2B Worker and form. Confirm visible fields and legacy route behavior without creating real test leads or sending test notifications.
4. Record deployed versions and verification results in the project release record.

Before this change, B2C production was `78a30d08edac361558c37750106abaf2cb455fd5`, Render deployment `dep-dbkof767bikc73973f8g`. The B2B Worker was `171b7823-7b21-4130-9533-a98b7b1d0532`.

Do not blindly roll back the entire old Worker: that would reactivate AC/Make delivery. A UI rollback must retain the new legacy forwarding code. Keep the backend/legacy contract and additive tables available while either form version may still be open. Do not drop saved requests or attachment tables as part of rollback.

## Operations

Readiness reports storage availability, email configuration and an aggregate delivery-attention flag without exposing lead details. Automatic retries use the same immutable message and files. Ambiguous notifications are held for manual review before the provider's deduplication window expires; they are not blindly resent afterwards. An accepted provider response is not proof of inbox delivery. Review pending/failed/needs-review states in the production administration context; never export customer records into a preview workspace.

This change does not add commercial accounts, change existing login methods, subscribe owners to marketing lists, backfill historical messages or delete ActiveCampaign/Make history.
