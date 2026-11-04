import { createHash } from "node:crypto";
import { z } from "zod";
import { OWNER_PROPERTY_TYPES } from "../../../shared/owner-intake";
import { OWNER_V4_TOKEN_DAYS, type OwnerV4Details } from "../../../shared/owner-intake-v4";
import { photoRequestMail } from "./email";
import { completeDetailsSchema, fingerprint, mutationSchema, newToken, tokenHash } from "./validation";
import type { V4OutboxPayload, V4Record } from "./types";

import { HISTORICAL_PHOTO_KIND } from "./reminder";
export { HISTORICAL_PHOTO_KIND } from "./reminder";
const clean = (max: number) => z.string().trim().max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "invalid_characters");
const sourceSchema = z.object({
  dealId: z.number().int().positive().safe(), personId: z.number().int().positive().safe(),
  name: clean(120).min(1), email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  language: z.enum(["pt", "en"]), requestedAt: z.coerce.date(),
  phone: clean(40).refine(v => !v || /^\+?[\d\s().-]{7,40}$/.test(v) && v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15, "invalid_phone").optional(), locality: clean(200).optional(), propertyType: z.enum(OWNER_PROPERTY_TYPES),
  details: mutationSchema.shape.details.optional(),
  originalEnquiry: z.object({ source: z.enum(["v3", "v4"]), id: z.string().uuid() }).strict().optional(),
}).strict();
export type HistoricalPhotoSource = z.input<typeof sourceSchema>;
export interface HistoricalPhotoExisting {
  record: V4Record; completionUrl: string; files: { mimeType: string }[];
}
export interface HistoricalPhotoPlan {
  record: V4Record; newRecord: boolean; completionUrl: string;
  outbox: { id: string; enquiryId: string; kind: typeof HISTORICAL_PHOTO_KIND; payload: V4OutboxPayload; attachmentBytes: 0 };
  provenance: { dealId: number; personId: number; requestedAt: Date; originalEnquiry?: { source: "v3" | "v4"; id: string } };
}
export class HistoricalPhotoError extends Error {
  constructor(public readonly code: string) { super(code); }
}
/** UUIDv5 of a fixed PA deal identity: a second run cannot create another continuation. */
export function historicalPhotoId(dealId: number) {
  if (!Number.isSafeInteger(dealId) || dealId < 1) throw new HistoricalPhotoError("INVALID_CRM_ID");
  const namespace = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
  const bytes = createHash("sha1").update(namespace).update(`https://portugalactive.pipedrive.com/deal/${dealId}#owner-photo-followup`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function verifiedUrl(record: V4Record, value: string, now: Date) {
  try {
    const url = new URL(value);
    if (url.origin !== "https://www.portugalactive.com" || url.username || url.password || url.pathname !== "/management/complete/"
      || !/^#token=[a-zA-Z0-9_-]{43}$/.test(url.hash) || tokenHash(url.hash.slice(7)) !== record.tokenHash)
      throw new Error("invalid");
  } catch { throw new HistoricalPhotoError("INVALID_CONTINUATION_LINK"); }
  if (record.tokenExpiresAt.getTime() <= now.getTime() + 3600_000) throw new HistoricalPhotoError("CONTINUATION_EXPIRED");
}
/** No database or provider calls. The administrator persists the plan and existing
 * CRM bindings in ONE transaction before making its single outbox item deliverable. */
export function buildHistoricalPhotoRequest(input: unknown, now = new Date(), existing?: HistoricalPhotoExisting): HistoricalPhotoPlan {
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success) throw new HistoricalPhotoError("INVALID_HISTORICAL_SOURCE");
  const source = parsed.data;
  if (!Number.isFinite(now.getTime()) || source.requestedAt > now || source.requestedAt.getTime() < now.getTime() - 7 * 86400_000)
    throw new HistoricalPhotoError("OUTSIDE_SEVEN_DAY_WINDOW");
  if (source.details?.photosLink?.trim()) throw new HistoricalPhotoError("PHOTOS_ALREADY_RECEIVED");
  if (source.originalEnquiry?.source === "v4" && !existing) throw new HistoricalPhotoError("EXISTING_CONTINUATION_REQUIRED");
  let record: V4Record, completionUrl: string;
  if (existing) {
    record = existing.record;
    if (source.originalEnquiry?.source === "v4" && source.originalEnquiry.id !== record.id) throw new HistoricalPhotoError("ENQUIRY_MATCH_REVIEW");
    if (record.contact.email.trim().toLowerCase() !== source.email) throw new HistoricalPhotoError("CONTACT_MATCH_REVIEW");
    if (record.details?.photosLink?.trim() || existing.files.some(f => f.mimeType.startsWith("image/")))
      throw new HistoricalPhotoError("PHOTOS_ALREADY_RECEIVED");
    if (!["awaiting_details", "awaiting_photos"].includes(record.status)) throw new HistoricalPhotoError("ENQUIRY_NOT_WAITING_FOR_PHOTOS");
    verifiedUrl(record, existing.completionUrl, now); completionUrl = existing.completionUrl;
  } else {
    const token = newToken(); const id = historicalPhotoId(source.dealId);
    const details = source.details || null;
    const qualified = details ? completeDetailsSchema.safeParse(details).success : false;
    record = { id, startFingerprint: fingerprint({ source: "pipedrive-owner-photo-followup", dealId: source.dealId, personId: source.personId }),
      contact: { name: source.name, email: source.email, phone: source.phone || "", locality: source.locality || "", type: source.propertyType },
      context: { language: source.language, page_path: "/management/complete/", placement: "crm-photo-request", page_id: source.originalEnquiry ? `${source.originalEnquiry.source}:${source.originalEnquiry.id}` : "owner-crm-photo-followup", page_kind: "crm-photo-followup", region: "" },
      attribution: null, details: details as Partial<OwnerV4Details> | null, status: qualified ? "awaiting_photos" : "awaiting_details",
      tokenHash: tokenHash(token), tokenExpiresAt: new Date(now.getTime() + OWNER_V4_TOKEN_DAYS * 86400_000), revision: 0,
      completedFingerprint: null, capturedAt: now, updatedAt: now, qualificationCompletedAt: qualified ? source.requestedAt : null,
      mediaReceivedAt: null, privacyAcknowledgedAt: null, privacyNoticeVersion: "owner-crm-photo-followup", awaitingPhotosAt: now, completionCount: 0, mediaFileCount: 0 };
    completionUrl = `https://www.portugalactive.com/management/complete/?lang=${source.language}#token=${token}`;
  }
  return { record, newRecord: !existing, completionUrl,
    // Same id as the normal reminder: neither path can queue a second photo request.
    outbox: { id: `${record.id}:photo-reminder`, enquiryId: record.id, kind: HISTORICAL_PHOTO_KIND,
      payload: { mail: photoRequestMail(record, completionUrl), fileIds: [], completionUrl }, attachmentBytes: 0 },
    provenance: { dealId: source.dealId, personId: source.personId, requestedAt: source.requestedAt, ...(source.originalEnquiry ? { originalEnquiry: source.originalEnquiry } : {}) } };
}
