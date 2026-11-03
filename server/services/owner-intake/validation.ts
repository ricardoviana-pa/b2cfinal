import { createHash } from "node:crypto";
import { z } from "zod";
import {
  OWNER_BEDROOMS, OWNER_FILE_COUNT_LIMIT, OWNER_FILE_LIMIT, OWNER_INCOME_EXPECTATIONS,
  OWNER_INTAKE_VERSION, OWNER_PROPERTY_TYPES, OWNER_TIMELINES, OWNER_TOTAL_FILE_LIMIT,
  type OwnerAttachmentMetadata, type OwnerStoredFields,
} from "../../../shared/owner-intake";

const clean = (min: number, max: number) => z.string().trim().min(min).max(max)
  .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "invalid_characters");
const optionalText = (max: number) => clean(0, max).optional().default("");
const photoUrl = optionalText(2000).refine(value => {
  if (!value) return true;
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password; }
  catch { return false; }
}, "invalid_photo_link");
const yesNo = z.enum(["yes", "no"]);
export const ownerIntakeSchema = z.object({
  schemaVersion: z.literal(OWNER_INTAKE_VERSION),
  requestId: z.string().uuid(),
  name: clean(1, 120),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  phone: clean(7, 40).refine(value => /^\+?[\d\s().-]{7,40}$/.test(value) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 15, "invalid_phone"),
  address: clean(2, 300),
  postalCode: z.string().trim().transform(value => /^\d{7}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4)}` : value).pipe(z.string().regex(/^\d{4}-\d{3}$/)),
  type: z.enum(OWNER_PROPERTY_TYPES), bedrooms: z.enum(OWNER_BEDROOMS),
  description: clean(20, 2000), operatedBefore: yesNo,
  licenseStatus: z.enum(["yes", "pending", "no", "unknown"]), licenseNumber: optionalText(100),
  occupied: yesNo, occupiedDetails: optionalText(500), forSale: yesNo,
  saleInterest: z.enum(["yes", "maybe", "no"]), launchTimeline: z.enum(OWNER_TIMELINES),
  incomeExpectation: z.enum(OWNER_INCOME_EXPECTATIONS), incomeBasis: z.literal("annual_net_owner"),
  photoMethod: z.enum(["link", "files", "both", "later"]), photosLink: photoUrl,
  privacyAcknowledged: z.literal(true), website: z.string().max(0).optional().default(""),
  context: z.object({
    language: z.enum(["pt", "en", "fr", "de", "nl", "es", "it", "he", "ar", "zh"]),
    page_path: clean(1, 300).refine(value => /^\/management(?:\/|$)/.test(value) && !/[?#]/.test(value)),
    placement: clean(1, 80), page_id: clean(1, 100), page_kind: clean(1, 40), region: optionalText(100),
  }).strict(),
  attachments: z.array(z.object({
    name: clean(1, 180).refine(value => !/[\\/\u0000-\u001f\u007f]/.test(value), "invalid_filename"),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
    base64: z.string().min(4).max(Math.ceil(OWNER_FILE_LIMIT / 3) * 4),
  }).strict()).max(OWNER_FILE_COUNT_LIMIT).default([]),
}).strict().superRefine((data, ctx) => {
  if (["link", "both"].includes(data.photoMethod) && !data.photosLink)
    ctx.addIssue({ code: "custom", path: ["photosLink"], message: "link_required" });
  if (["files", "both"].includes(data.photoMethod) && !data.attachments.length)
    ctx.addIssue({ code: "custom", path: ["attachments"], message: "files_required" });
  if (!["link", "both"].includes(data.photoMethod) && data.photosLink)
    ctx.addIssue({ code: "custom", path: ["photoMethod"], message: "link_mode_mismatch" });
  if (!["files", "both"].includes(data.photoMethod) && data.attachments.length)
    ctx.addIssue({ code: "custom", path: ["photoMethod"], message: "file_mode_mismatch" });
});

export class OwnerIntakeError extends Error {
  constructor(public readonly code: string, public readonly status = 503, public readonly fields: string[] = []) { super(code); }
}
export interface ValidatedOwnerAttachment extends OwnerAttachmentMetadata { bytes: Buffer; digest: string }
export interface ValidatedOwnerIntake { fields: OwnerStoredFields; attachments: ValidatedOwnerAttachment[]; fingerprint: string }

function matchingFile(bytes: Buffer, mime: string, name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (mime === "image/jpeg") return ["jpg", "jpeg"].includes(ext || "") && bytes.length >= 4 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mime === "image/png") return ext === "png" && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp") return ext === "webp" && bytes.length >= 16 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  return ext === "pdf" && bytes.length >= 12 && bytes.subarray(0, 5).toString() === "%PDF-" && bytes.subarray(-1024).includes(Buffer.from("%%EOF"));
}

export function validateOwnerIntake(input: unknown): ValidatedOwnerIntake {
  const parsed = ownerIntakeSchema.safeParse(input);
  if (!parsed.success) throw new OwnerIntakeError("VALIDATION_FAILED", 400, [...new Set(parsed.error.issues.map(issue => issue.path.join(".")))]);
  const { attachments: rawAttachments, website: _honeypot, ...fields } = parsed.data;
  let total = 0;
  const attachments = rawAttachments.map((file, i) => {
    // A quantified group over megabytes can overflow V8's regexp stack. Scan
    // characters linearly, then enforce canonical padding via decode/re-encode.
    if (file.base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(file.base64))
      throw new OwnerIntakeError("VALIDATION_FAILED", 400, [`attachments.${i}`]);
    const bytes = Buffer.from(file.base64, "base64");
    if (bytes.toString("base64") !== file.base64)
      throw new OwnerIntakeError("VALIDATION_FAILED", 400, [`attachments.${i}`]);
    total += bytes.length;
    if (!bytes.length || bytes.length > OWNER_FILE_LIMIT || total > OWNER_TOTAL_FILE_LIMIT)
      throw new OwnerIntakeError("PAYLOAD_TOO_LARGE", 413, ["attachments"]);
    if (!matchingFile(bytes, file.mimeType, file.name))
      throw new OwnerIntakeError("VALIDATION_FAILED", 400, [`attachments.${i}`]);
    const digest = createHash("sha256").update(bytes).digest("hex");
    return { id: `${fields.requestId}-${i + 1}`, name: file.name, mimeType: file.mimeType, size: bytes.length, bytes, digest };
  });
  // Parsed object has a fixed key order; attachment bytes are represented by a digest.
  const fingerprint = createHash("sha256").update(JSON.stringify({ fields, attachments: attachments.map(({ bytes: _bytes, ...meta }) => meta) })).digest("hex");
  return { fields, attachments, fingerprint };
}

const legacySchema = z.object({
  name: clean(1, 120), email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  phone: optionalText(40), address: clean(2, 300), type: clean(1, 80), bedrooms: clean(1, 20),
  license: optionalText(100), photosLink: photoUrl, notes: optionalText(6000), language: optionalText(10),
  submittedAt: optionalText(80),
  website: z.string().max(0).optional(),
}).strip();

/** Cached old forms are accepted, explicitly labelled incomplete, without AC/Make. */
export function validateLegacyOwnerIntake(input: unknown): ValidatedOwnerIntake {
  const parsed = legacySchema.safeParse(input);
  if (!parsed.success) throw new OwnerIntakeError("VALIDATION_FAILED", 400, [...new Set(parsed.error.issues.map(issue => issue.path.join(".")))]);
  const p = parsed.data;
  const providedId = /(?:^|\n)Pedido:\s*([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\s|$)/i.exec(p.notes)?.[1]?.toLowerCase();
  const stableLegacy = { name: p.name, email: p.email, phone: p.phone, address: p.address,
    type: p.type, bedrooms: p.bedrooms, license: p.license, photosLink: p.photosLink, notes: p.notes, language: p.language };
  const submittedAt = p.submittedAt && Number.isFinite(Date.parse(p.submittedAt)) ? new Date(p.submittedAt).toISOString() : "";
  const hash = createHash("sha256").update(JSON.stringify({ ...stableLegacy, submittedAt })).digest("hex");
  // Old clients without a UUID use a deterministic reference. Replays never send twice.
  const requestId = providedId || `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const fields: OwnerStoredFields = { schemaVersion: "owner-intake-legacy", requestId,
    qualificationIncomplete: true, name: p.name, email: p.email, phone: p.phone, address: p.address,
    type: p.type, bedrooms: p.bedrooms, legacyLicense: p.license, photosLink: p.photosLink,
    legacyNotes: p.notes, language: p.language || "pt" };
  return { fields, attachments: [], fingerprint: createHash("sha256").update(JSON.stringify(fields)).digest("hex") };
}
