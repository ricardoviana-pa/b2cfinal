# Owner enquiries → Pipedrive

Production-only reconciliation of the owner intake stores introduced on 3 November
2026. It does not reactivate ActiveCampaign or Make, send email, alter advertising
conversions, or export customer data to development.

Configuration (Render production service only):

- `OWNER_CRM_ENABLED=true`
- `PIPEDRIVE_API_TOKEN` (secret, header authentication; never logged)
- `PIPEDRIVE_OWNER_ID=22976488`
- `PIPEDRIVE_STAGE_ID=1`
- `OWNER_AUTOMATION_FROM=2026-11-03T00:00:00Z` (inclusive default)
- `OWNER_AUTOMATION_TEST_IDS` optional comma-separated explicitly authorized QA UUIDs

The company host, pipeline 1, owner and Inbound stage are deliberately fixed to the
verified Portugal Active account. The API token does not authorize another host.
Disabling `OWNER_CRM_ENABLED` stops CRM writes without affecting form capture or
email delivery. Database changes are additive tables only.

`startOwnerCrmSweep()` runs every minute after intake schema initialization.
Both `owner_enquiries` (v3/legacy) and `owner_v4_enquiries` are reconciled, oldest
first, with up to 20 candidates per source per sweep. Production records stay in
production. A database lease and durable operation keys coordinate processes and
restarts. Snapshots are current and the full note is overwritten only on the one
integration-owned note; sales notes and deal owner/stage/value/status stay intact.
All fields from the form, attribution, and current attachments are represented.
Removed attachments are not deleted from the CRM's historical file record.

Person identity uses an exact email search. Multiple exact matches require review.
An enquiry retains its person mapping even if its contact email is corrected later;
the note shows the latest details without changing sales-owned contact fields.
Each enquiry has a full UUID marker in its initial deal title and managed note.
An existing open opportunity in any pipeline or an active Leads Inbox item for that
person without an already-bound deal is held for review. A reviewer can bind a verified existing deal by setting the corresponding
`enquiry:v4:<uuid>:deal` (or `v3`) operation to `done` with the verified remote ID;
alternatively create a distinct reviewed deal with the exact marker. This is an
administrative production action, never a public endpoint or an automated guess.

Every non-idempotent create is recorded as `attempting` **before** calling Pipedrive.
A lost/ambiguous response is resolved by searching the exact email, UUID marker,
note marker, or SHA-256 attachment filename. If the remote item cannot be found,
the item is held rather than posted again. An explicit rejection such as HTTP429
can safely retry. A restart cannot turn an uncertain create into a fresh one.
File content is rehashed immediately before upload and identical bytes share a
single per-enquiry operation even if the owner uploaded another local file UUID.

`ownerCrmStatus()` provides aggregate ledger counts; the ledger's `lastError` is
a short code without customer fields or provider bodies. `review` is actionable,
not a successful import. Review items reconcile hourly, transient failures every
five minutes, and newer form updates are picked up on the next sweep.
`ownerCrmHealth()` also detects source enquiries left without a CRM link for more
than fifteen minutes, not only failures already present in the ledger. It is read-only
and returns booleans without personal data. Explicitly allowlisted QA UUIDs can
re-enter reconciliation even if they were previously excluded.

`ownerCrmAllowsPhotoReminder()` consults the linked deal immediately before a
reminder. Closed, deleted or archived deals suppress the reminder. An unavailable
CRM status throws a sanitized error so the caller defers instead of sending.
The same preflight also checks the existing "Fotos do Imóvel estão adequadas"
field (SIM=51), active non-inline image files, and photo-labelled links or albums
and listings explicitly described as photographs in notes. PDF documents,
signature images, generic hyperlinks and the private upload CTA are not photo
evidence. An inability to check files/notes defers the reminder.

Dedicated property fields were added on 4 November: Morada, Código Postal,
Concelho, Tipo de Propriedade, Tipologia and the existing Bedrooms text field.
The declaration `6+` stays `6+` in Bedrooms and never becomes the enum's exactly
six. A stale integration-owned numeric typology can be cleared for that range;
a sales-owned value is preserved. Net annual income expectations are not written
to deal revenue/value fields.

`owner_crm_field_state` is an additive ledger for each enquiry's last-written
values, protected commercial fields, and pending write intent. New deals retain
their initial field ownership before CREATE. Later synchronization fills empty
fields or updates fields still equal to the recorded integration-written value.
A differing commercial value, including a deliberate deletion, is protected and
not reclaimed merely because a later form happens to match it. A pre-existing
value equal to the form does not establish integration ownership.

The intent is durable before PATCH; lost responses reconcile against current
fields before another write. Pipedrive exposes no conditional custom-field PATCH,
so the worker re-reads immediately before mutation and excludes any detected
concurrent edits. An edit in the unavoidable interval between that read and the
provider applying PATCH cannot be atomically prevented by this API.

The `property-fields:v1` completed-operation marker makes earlier synchronized
enquiries eligible for one mapping pass without resending email or recreating
CRM records. Health detects a mapping pass left unfinished. Historical photo-only
follow-ups use their CRM provenance instead of claiming a new privacy checkbox;
imports originating from v3 preserve its full original marker in the managed note.
Historical provenance comes from the private import journal and immutable server
privacy version, never from public attribution alone. Once a v3 enquiry has a
verified v4 continuation, future v3 passes are skipped so they cannot overwrite the
newer managed note. Field ownership can carry forward only when the original
durable deal binding matches the continuation's deal ID.
Read-only duplicate checks and attachment validation run before reserving a remote
create; transient preflight failures therefore remain retryable without an ambiguous
create hold. Uncertainty after the actual provider POST remains held for reconciliation.

Official API references checked 4 November 2026:
https://developers.pipedrive.com/docs/api/v1/Persons
https://developers.pipedrive.com/docs/api/v1/Deals
https://developers.pipedrive.com/docs/api/v1/Notes
https://developers.pipedrive.com/docs/api/v1/Files
https://developers.pipedrive.com/docs/api/v1/Leads

Tests use injected synthetic clients and in-memory durable operation state. They
cover replay, concurrent create reservation, email reuse/correction, existing-deal
holds, ambiguous creates, delayed reconciliation, explicit quota rejection, file
integrity and deduplication, HTML escaping, and production isolation.
