import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { OWNER_FILE_LIMIT } from "../../../shared/owner-intake";
import type { OwnerV4Details } from "../../../shared/owner-intake-v4";
import { ownerIntakeSchema, OwnerIntakeError } from "../owner-intake/validation";

export { OwnerIntakeError };
const clean = (min: number, max: number) => z.string().trim().min(min).max(max)
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value), "invalid_characters");
const s = ownerIntakeSchema.shape;
export const contactSchema = z.object({ name: clean(1, 120), email: s.email, phone: s.phone.refine(value => !/[\r\n\t]/.test(value)), type: s.type, locality: clean(2, 200) }).strict();
export const contactEditSchema = contactSchema.omit({ email: true }).partial();
const slug = z.string().max(80).regex(/^[a-zA-Z0-9._~-]*$/);
export const attributionSchema = z.object({ source: slug.optional(), medium: slug.optional(), campaign: slug.optional(), content: slug.optional(),
  landing_path: z.string().max(300).regex(/^\/management(?:\/[a-zA-Z0-9_./~-]*)?$/).optional() }).strict();
export const startSchema = contactSchema.extend({ requestId: z.string().uuid(), privacyAcknowledged: z.literal(true),
  context: s.context, attribution: attributionSchema.optional(), website: z.string().max(0).optional().default("") }).strict();
const detailShape = { address: s.address, postalCode: s.postalCode, bedrooms: s.bedrooms, description: s.description,
  operatedBefore: s.operatedBefore, licenseStatus: s.licenseStatus, licenseNumber: clean(0, 100), occupied: s.occupied,
  occupiedDetails: s.occupiedDetails, forSale: s.forSale, saleInterest: s.saleInterest, launchTimeline: s.launchTimeline,
  incomeExpectation: s.incomeExpectation, incomeBasis: s.incomeBasis, photosLink: s.photosLink };
export const completeDetailsSchema = z.object(detailShape).strict();
// Drafts accept incomplete text, while retaining bounded lengths and enum values.
// Defaults must not overwrite already saved fields when a patch omits them.
const draftDetailsSchema = z.object({ ...detailShape, address: clean(0, 300), postalCode: clean(0, 10),
  description: z.string().max(2000).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)), licenseNumber: clean(0, 100),
  occupiedDetails: z.string().max(500), photosLink: z.string().max(2000) }).partial().strict();
export const mutationSchema = z.object({ mutationId: z.string().uuid(), contact: contactEditSchema.optional(), details: draftDetailsSchema.optional() }).strict();

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new OwnerIntakeError("VALIDATION_FAILED", 400,
    [...new Set(result.error.issues.map(issue => issue.path.join(".")))]);
  return result.data;
}
export function completeDetails(input: unknown): OwnerV4Details {
  return parse(completeDetailsSchema, { licenseNumber: "", occupiedDetails: "", photosLink: "", ...(input as object) }) as OwnerV4Details;
}
export function fingerprint(value: unknown) {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(key => [key, canonical(v[key])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export function bearerToken(header: unknown) {
  if (typeof header !== "string" || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) throw new OwnerIntakeError("TOKEN_INVALID_OR_EXPIRED", 401);
  return header.slice(7);
}
export function uuid(value: unknown) { return parse(z.string().uuid(), value); }
export interface V4File { id: string; name: string; mimeType: string; size: number; digest: string; bytes: Buffer }
export function validateFile(id: string, name: unknown, mime: unknown, bytes: unknown): V4File {
  uuid(id);
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > OWNER_FILE_LIMIT) throw new OwnerIntakeError("PAYLOAD_TOO_LARGE", 413, ["attachments"]);
  if (typeof name !== "string" || !name.trim() || name.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(name)) throw new OwnerIntakeError("VALIDATION_FAILED", 400, ["attachments"]);
  const ext = name.split(".").pop()?.toLowerCase();
  const matches = mime === "image/jpeg" ? ["jpg", "jpeg"].includes(ext || "") && bytes.length >= 4 && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    : mime === "image/png" ? ext === "png" && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === "image/webp" ? ext === "webp" && bytes.length >= 16 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"
    : mime === "application/pdf" ? ext === "pdf" && bytes.length >= 12 && bytes.subarray(0, 5).toString() === "%PDF-" && bytes.subarray(-1024).includes(Buffer.from("%%EOF")) : false;
  if (!matches) throw new OwnerIntakeError("VALIDATION_FAILED", 400, ["attachments"]);
  return { id, name: name.trim(), mimeType: String(mime), size: bytes.length, digest: createHash("sha256").update(bytes).digest("hex"), bytes };
}
