import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const INBOUND_SCHEMA_VERSION = "owner-email-photos-v1" as const;
export const INBOUND_MAILBOX = "ricardo.viana@portugalactive.com" as const;
export const INBOUND_FILE_LIMIT = 15 * 1024 * 1024;
export const INBOUND_MESSAGE_LIMIT = 75 * 1024 * 1024;
export const INBOUND_FILE_COUNT_LIMIT = 30;
export const INBOUND_CLOCK_SKEW_SECONDS = 300;
const email = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const header = z.string().trim().max(998).refine(value => !/[\r\n\u0000]/.test(value));
const domain = z.string().trim().toLowerCase().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
export const inboundAttachmentSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/), name: z.string().max(180), mimeType: z.string().trim().toLowerCase().max(127),
  // The transport accepts a bounded declaration larger than our policy limit so
  // oversized customer messages become review items, not endless HTTP retries.
  size: z.number().int().min(0).max(250 * 1024 * 1024),
  disposition: z.enum(["attachment", "inline", "unknown"]), contentId: header.optional(), quoted: z.boolean().optional(),
}).strict();
export const inboundAuthenticationSchema = z.object({
  googleAuthserv: z.boolean(), dkimPassDomains: z.array(domain).max(30), dmarcPassDomains: z.array(domain).max(30), spfPassDomains: z.array(domain).max(30),
  arcPass: z.boolean(), groupVerified: z.boolean(), fromVerified: z.boolean(), originalSenderVerified: z.boolean(),
}).strict();
export const metadataSchema = z.object({
  schemaVersion: z.literal(INBOUND_SCHEMA_VERSION), source: z.literal("gmail"), mailbox: z.literal(INBOUND_MAILBOX),
  providerId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), threadId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).nullable(),
  messageId: header.nullable(), inReplyTo: z.array(header).max(30), references: z.array(header).max(100),
  from: email, originalSender: email.optional(), to: z.array(email).max(100), cc: z.array(email).max(100), listId: header.optional(),
  subject: z.string().max(500), text: z.string().max(16000), replyText: z.string().max(16000).optional(), automatic: z.boolean(), receivedAt: z.iso.datetime({ offset: true }),
  attachments: z.array(inboundAttachmentSchema).max(100), authentication: inboundAuthenticationSchema,
}).strict().refine(value => new Set(value.attachments.map(file => file.id)).size === value.attachments.length, "duplicate_attachment_id");
export type InboundPhotoMetadata = z.infer<typeof metadataSchema>;
export type InboundAttachmentDescriptor = z.infer<typeof inboundAttachmentSchema>;
export class InboundProtocolError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export function parseInboundMetadata(value: unknown): InboundPhotoMetadata {
  const result = metadataSchema.safeParse(value);
  if (!result.success) throw new InboundProtocolError("INVALID_INBOUND_METADATA");
  return result.data;
}
export const bodyDigest = (body: Uint8Array) => createHash("sha256").update(body).digest("hex");
export interface SignedInboundHeaders { timestamp: string; signature: string; contentSha256: string }
function canonical(timestamp: string, method: string, path: string, digest: string) {
  if (!/^\d{10,11}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(digest)
    || !/^[A-Z]+$/.test(method.toUpperCase()) || !path.startsWith("/") || /[\r\n?#]/.test(path))
    throw new InboundProtocolError("INVALID_SIGNED_REQUEST");
  return `${timestamp}\n${method.toUpperCase()}\n${path}\n${digest}`;
}
export function signInboundHeaders(secret: string, timestamp: string, method: string, path: string, contentSha256: string) {
  if (secret.length < 32) throw new InboundProtocolError("INBOUND_SECRET_UNAVAILABLE");
  return createHmac("sha256", secret).update(canonical(timestamp, method, path, contentSha256)).digest("hex");
}
/** Authenticate the declared body digest before consuming an upload. */
export function verifySignedHeaders(secret: string, headers: SignedInboundHeaders, method: string, path: string, now = new Date()) {
  if (!Number.isFinite(now.getTime()) || !/^\d{10,11}$/.test(headers.timestamp)
    || Math.abs(Math.floor(now.getTime() / 1000) - Number(headers.timestamp)) > INBOUND_CLOCK_SKEW_SECONDS)
    throw new InboundProtocolError("INBOUND_SIGNATURE_EXPIRED");
  if (!/^[a-f0-9]{64}$/.test(headers.signature)) throw new InboundProtocolError("INBOUND_SIGNATURE_INVALID");
  const expected = signInboundHeaders(secret, headers.timestamp, method, path, headers.contentSha256);
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(headers.signature, "hex"))) throw new InboundProtocolError("INBOUND_SIGNATURE_INVALID");
  return true;
}
export function verifyBodyDigest(body: Uint8Array, expected: string) {
  if (!/^[a-f0-9]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(bodyDigest(body), "hex"), Buffer.from(expected, "hex")))
    throw new InboundProtocolError("INBOUND_BODY_DIGEST_MISMATCH");
  return true;
}
export function signInboundRequest(secret: string, timestamp: string, method: string, path: string, body: Uint8Array): SignedInboundHeaders {
  const contentSha256 = bodyDigest(body);
  return { timestamp, contentSha256, signature: signInboundHeaders(secret, timestamp, method, path, contentSha256) };
}
