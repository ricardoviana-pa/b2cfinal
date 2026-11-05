import { createHash } from "node:crypto";
import { INBOUND_FILE_COUNT_LIMIT, INBOUND_FILE_LIMIT, INBOUND_MESSAGE_LIMIT, type InboundAttachmentDescriptor, type InboundPhotoMetadata } from "./protocol";

export type AttachmentClassification = {
  kind: "photo" | "document"; name: string; mimeType: string; size: number; digest: string; extension: "jpg" | "png" | "webp" | "pdf" | "heic" | "heif";
} | { kind: "ignored" | "review"; code: string };
export function classifyInboundMessage(message: Pick<InboundPhotoMetadata, "attachments">): { decision: "accept" } | { decision: "ignored" | "review"; code: string } {
  if (!message.attachments.length) return { decision: "ignored", code: "NO_ATTACHMENTS" };
  if (message.attachments.length > INBOUND_FILE_COUNT_LIMIT) return { decision: "review", code: "TOO_MANY_ATTACHMENTS" };
  if (message.attachments.reduce((total, file) => total + file.size, 0) > INBOUND_MESSAGE_LIMIT) return { decision: "review", code: "MESSAGE_TOO_LARGE" };
  if (message.attachments.some(file => file.size > INBOUND_FILE_LIMIT)) return { decision: "review", code: "FILE_TOO_LARGE" };
  return { decision: "accept" };
}
type ImageType = { mime: string; extension: "jpg" | "png" | "webp" | "heic" | "heif"; width?: number; height?: number };
function webpHasImageData(bytes: Buffer) {
  let offset = 12, data = false;
  while (offset + 8 <= bytes.length) {
    const size = bytes.readUInt32LE(offset + 4), kind = bytes.subarray(offset, offset + 4).toString("ascii");
    if (size > bytes.length - offset - 8) return false;
    if ((kind === "VP8 " && size >= 10) || (kind === "VP8L" && size >= 5) || (kind === "ANMF" && size > 16)) data = true;
    offset += 8 + size + (size % 2);
  }
  return offset === bytes.length && data;
}
function pngHasImageData(bytes: Buffer) {
  let offset = 8, data = false;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset), kind = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (size > bytes.length - offset - 12) return false;
    if (kind === "IDAT" && size > 0) data = true;
    offset += size + 12;
    if (kind === "IEND") return data && size === 0 && offset === bytes.length;
  }
  return false;
}
function heifHasImageBoxes(bytes: Buffer, start: number) {
  let offset = start, meta = false, data = false;
  while (offset + 8 <= bytes.length) {
    let size = bytes.readUInt32BE(offset); const kind = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    let header = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length) return false;
      const large = bytes.readBigUInt64BE(offset + 8); if (large > BigInt(bytes.length)) return false;
      size = Number(large); header = 16;
    } else if (size === 0) size = bytes.length - offset;
    if (size < header || size > bytes.length - offset) return false;
    if (kind === "meta" && size > header) meta = true;
    if (kind === "mdat" && size > header) data = true;
    offset += size;
  }
  return offset === bytes.length && meta && data;
}
function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) return null;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) return null;
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}
function imageType(bytes: Buffer): ImageType | null {
  const jpeg = jpegDimensions(bytes);
  if (jpeg) return { mime: "image/jpeg", extension: "jpg", ...jpeg };
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.readUInt32BE(8) === 13 && bytes.subarray(12, 16).toString("ascii") === "IHDR"
    && bytes.readUInt32BE(bytes.length - 12) === 0 && bytes.subarray(-8, -4).toString("ascii") === "IEND" && pngHasImageData(bytes))
    return { mime: "image/png", extension: "png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length >= 30 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.readUInt32LE(4) + 8 === bytes.length
    && bytes.subarray(8, 12).toString("ascii") === "WEBP" && webpHasImageData(bytes)) {
    const chunk = bytes.subarray(12, 16).toString("ascii");
    if (bytes.readUInt32LE(16) + 20 > bytes.length) return null;
    if (chunk === "VP8X" && bytes.readUInt32LE(16) >= 10)
      return { mime: "image/webp", extension: "webp", width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    if (chunk === "VP8L" && bytes.readUInt32LE(16) >= 5 && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      return { mime: "image/webp", extension: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8 " && bytes.readUInt32LE(16) >= 10 && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a])))
      return { mime: "image/webp", extension: "webp", width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (bytes.length >= 24 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const length = bytes.readUInt32BE(0);
    if (length < 16 || length > Math.min(bytes.length, 512) || length % 4 !== 0 || !heifHasImageBoxes(bytes, length)) return null;
    const brands = [bytes.subarray(8, 12).toString("ascii")];
    for (let offset = 16; offset + 4 <= length; offset += 4) brands.push(bytes.subarray(offset, offset + 4).toString("ascii"));
    if (brands.some(brand => ["avif", "avis"].includes(brand))) return null;
    if (brands.some(brand => ["heic", "heix", "hevc", "hevx"].includes(brand))) return { mime: "image/heic", extension: "heic" };
    if (brands.includes("mif1") || brands.includes("heif")) return { mime: "image/heif", extension: "heif" };
  }
  return null;
}
function safeFilename(name: string, extension: string) {
  const base = name.replace(/\\/g, "/").split("/").pop()!.replace(/[\u0000-\u001f\u007f]/g, "_").trim().replace(/^\.+/, "") || "fotografia";
  const stem = base.replace(/\.[^.]{1,10}$/, "") || "fotografia";
  return `${stem.slice(0, 179 - extension.length)}.${extension}`;
}
/** Bounded magic checks; no image rendering, external fetches, archives or execution. */
export function classifyAttachment(file: InboundAttachmentDescriptor, input: Uint8Array): AttachmentClassification {
  if (file.quoted) return { kind: "ignored", code: "QUOTED_ATTACHMENT" };
  if (file.size > INBOUND_FILE_LIMIT || input.byteLength > INBOUND_FILE_LIMIT) return { kind: "review", code: "FILE_TOO_LARGE" };
  if (!input.byteLength || file.size !== input.byteLength) return { kind: "review", code: "ATTACHMENT_SIZE_MISMATCH" };
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const mime = file.mimeType.toLowerCase();
  const generic = ["application/octet-stream", "binary/octet-stream", ""].includes(mime);
  const pdf = bytes.length >= 12 && /^%PDF-[12]\.\d/.test(bytes.subarray(0, 8).toString("ascii")) && bytes.subarray(-1024).includes(Buffer.from("%%EOF"));
  const image = imageType(bytes);
  if (!image && !pdf) return { kind: "review", code: "UNSUPPORTED_OR_INVALID_FILE" };
  const detectedMime = image?.mime || "application/pdf";
  const acceptedMime = image?.extension === "jpg" ? ["image/jpeg", "image/jpg", "image/pjpeg"]
    : ["heic", "heif"].includes(image?.extension || "") ? ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"] : [detectedMime];
  if (!generic && !acceptedMime.includes(mime)) return { kind: "review", code: "MIME_CONTENT_MISMATCH" };
  if (image?.width !== undefined && (!image.width || !image.height || image.width > 100000 || image.height > 100000 || image.width * image.height > 100000000))
    return { kind: "review", code: "INVALID_IMAGE_DIMENSIONS" };
  const signatureName = /(?:^|[\s_.-])(?:logo|signature|assinatura|facebook|instagram|linkedin|twitter|whatsapp|icon)(?:[\s_.-]|$)/i.test(file.name)
    || /^pa-logo-/i.test(file.name);
  if (image && signatureName && (file.disposition === "inline" || file.size < 100 * 1024)) return { kind: "ignored", code: "SIGNATURE_IMAGE" };
  if (image && file.disposition === "inline" && (file.size < 20 * 1024 || image.width !== undefined && (image.width < 320 || (image.height || 0) < 200)))
    return { kind: "ignored", code: "SMALL_INLINE_IMAGE" };
  const extension = image?.extension || "pdf";
  return { kind: image ? "photo" : "document", name: safeFilename(file.name, extension), mimeType: detectedMime, size: bytes.length,
    digest: createHash("sha256").update(bytes).digest("hex"), extension };
}
