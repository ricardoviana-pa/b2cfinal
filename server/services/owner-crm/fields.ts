import { CrmError, type CrmEnquiry, type CrmFieldState, type CrmFields, type CrmFieldValue, type CrmGateway, type CrmLedger } from "./types";

/** Existing Pipedrive fields/options verified 4 November 2026. */
export const PROPERTY_FIELDS = {
  address: "b025d0a83f3ef8adcafb2d26bc102f5042ad82be",
  postalCode: "75ab43e792a94224f308878c884d631ebb831015",
  locality: "2c10ff14f44288ca9f891a7abb4e52a0efe667a7",
  propertyType: "bbcf4de8b2feb36dc3041087ae7e114918450d4e",
  typology: "139821bc9a86182f682faed981ae4f58102059dd",
  bedrooms: "a8f2882d10c8f22b04ce9bb863f805780ae644c7",
} as const;
export const PROPERTY_FIELDS_VERSION = "property-fields:v1";
const propertyTypes: Record<string, number> = { villa: 151, apartment: 152, farmhouse: 153, hostel: 154, guesthouse: 155, boutiqueHotel: 156, other: 157 };
const bedroomOptions: Record<string, number> = { "1": 137, "2": 138, "3": 139, "4": 140, "5": 141, "6": 142, "7": 168, "8": 169, "9": 170, "10": 171, "11": 172, "12": 173, "13": 174, "14": 175, "15": 176 };
const enumKeys = new Set<string>([PROPERTY_FIELDS.propertyType, PROPERTY_FIELDS.typology]);
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function desiredPropertyFields(e: CrmEnquiry): CrmFields {
  const fields: CrmFields = {}; const address = text(e.details.address); const postalCode = text(e.details.postalCode); const bedrooms = text(e.details.bedrooms);
  if (address) fields[PROPERTY_FIELDS.address] = address;
  if (postalCode) fields[PROPERTY_FIELDS.postalCode] = postalCode;
  if (e.source === "v4" && text(e.locality)) fields[PROPERTY_FIELDS.locality] = text(e.locality);
  if (propertyTypes[e.type]) fields[PROPERTY_FIELDS.propertyType] = propertyTypes[e.type];
  if (bedroomOptions[bedrooms]) fields[PROPERTY_FIELDS.typology] = bedroomOptions[bedrooms];
  else if (bedrooms === "6+") fields[PROPERTY_FIELDS.typology] = null;
  // 6+ is an honest range. The numeric enum's "6" cannot represent that range.
  if (bedroomOptions[bedrooms] || bedrooms === "6+") fields[PROPERTY_FIELDS.bedrooms] = bedrooms;
  return fields;
}
export const emptyFieldState = (): CrmFieldState => ({ lastWritten: {}, protected: [], pending: null });
const equal = (a: CrmFieldValue | undefined, b: CrmFieldValue | undefined) => (a == null && b == null) || a === b;
const empty = (value: CrmFieldValue | undefined) => value == null || value === "";
/** Normalize enum representations only. Unknown objects must never become empty. */
export function currentPropertyFields(raw: Record<string, unknown>): CrmFields {
  const current: CrmFields = {};
  for (const key of Object.values(PROPERTY_FIELDS)) {
    let value = raw[key];
    if (enumKeys.has(key) && value && typeof value === "object" && "id" in value) value = (value as { id: unknown }).id;
    if (enumKeys.has(key) && typeof value === "string" && /^\d+$/.test(value)) value = Number(value);
    current[key] = value === undefined || value === null ? null : typeof value === "string" || typeof value === "number" ? value : "[unrecognised CRM value]";
  }
  return current;
}
export function reconcileFieldState(current: CrmFields, previous: CrmFieldState): CrmFieldState {
  const next: CrmFieldState = { lastWritten: { ...previous.lastWritten }, protected: [...previous.protected], pending: null };
  const protectedKeys = new Set(next.protected);
  if (previous.pending) {
    for (const [key, intended] of Object.entries(previous.pending.desired)) {
      if (equal(current[key], intended)) next.lastWritten[key] = intended;
      else if (!equal(current[key], previous.pending.before[key])) { delete next.lastWritten[key]; protectedKeys.add(key); }
    }
  }
  for (const [key, written] of Object.entries(next.lastWritten)) {
    if (!equal(current[key], written)) { delete next.lastWritten[key]; protectedKeys.add(key); }
  }
  next.protected = [...protectedKeys]; return next;
}
export function planPropertyFields(current: CrmFields, desired: CrmFields, state: CrmFieldState) {
  const patch: CrmFields = {}; const protectedKeys = new Set(state.protected);
  for (const [key, wanted] of Object.entries(desired)) {
    if (protectedKeys.has(key)) continue;
    const owned = Object.prototype.hasOwnProperty.call(state.lastWritten, key) && equal(current[key], state.lastWritten[key]);
    if (!owned && !empty(current[key])) { protectedKeys.add(key); continue; }
    if (!equal(current[key], wanted)) patch[key] = wanted;
  }
  return { patch, state: { ...state, protected: [...protectedKeys] } };
}
export async function syncPropertyFields(e: CrmEnquiry, dealId: number, ledger: CrmLedger, gateway: CrmGateway) {
  const key = `enquiry:${e.sourceKey}:property-values`; const desired = desiredPropertyFields(e);
  await ledger.checkpoint();
  const first = currentPropertyFields(await gateway.readDealFields(dealId));
  let previous = await ledger.fieldState(key);
  if (e.privacyNoticeVersion === "owner-crm-photo-followup" && e.originalSourceKey && /^v3:[0-9a-f-]{36}$/i.test(e.originalSourceKey)
    && !previous.pending && !Object.keys(previous.lastWritten).length && !previous.protected.length) {
    const original = await ledger.operation(`enquiry:${e.originalSourceKey}:deal`);
    if (original.remoteId === dealId) previous = await ledger.fieldState(`enquiry:${e.originalSourceKey}:property-values`);
  }
  const recovered = reconcileFieldState(first, previous);
  const initial = planPropertyFields(first, desired, recovered);
  if (!Object.keys(initial.patch).length) { await ledger.saveFieldState(key, initial.state); return; }
  // Pipedrive has no conditional PATCH for custom fields. Re-read immediately
  // before the write and abandon any field edited since our initial observation.
  await ledger.checkpoint();
  const fresh = currentPropertyFields(await gateway.readDealFields(dealId));
  const protectedKeys = new Set(initial.state.protected);
  for (const name of Object.keys(initial.patch)) if (!equal(first[name], fresh[name])) protectedKeys.add(name);
  const reconciled = reconcileFieldState(fresh, { ...initial.state, protected: [...protectedKeys] });
  const plan = planPropertyFields(fresh, desired, reconciled);
  const before = Object.fromEntries(Object.keys(plan.patch).map(name => [name, fresh[name] ?? null]));
  const pending: CrmFieldState = { ...plan.state, pending: Object.keys(plan.patch).length ? { before, desired: plan.patch } : null };
  await ledger.saveFieldState(key, pending);
  if (!pending.pending) return;
  await ledger.checkpoint();
  try { await gateway.updateDealFields(dealId, plan.patch); }
  catch (error) {
    if (error instanceof CrmError && error.confirmedRejected) await ledger.saveFieldState(key, { ...plan.state, pending: null });
    throw error;
  }
  await ledger.saveFieldState(key, { ...plan.state, lastWritten: { ...plan.state.lastWritten, ...plan.patch }, pending: null });
}
