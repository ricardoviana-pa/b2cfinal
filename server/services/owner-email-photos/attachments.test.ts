import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { classifyAttachment, classifyInboundMessage } from "./attachments";
import { INBOUND_FILE_LIMIT, type InboundAttachmentDescriptor } from "./protocol";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4xkAAAAASUVORK5CYII=", "base64");
const file = (bytes: Buffer = png, patch: Partial<InboundAttachmentDescriptor> = {}): InboundAttachmentDescriptor => ({ id: "a".repeat(64), name: "synthetic.png", mimeType: "image/png", size: bytes.length, disposition: "attachment", ...patch });
function jpeg(width = 800, height = 600, size = 40000) {
  const b = Buffer.alloc(size); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xc0; b.writeUInt16BE(11, 4); b[6] = 8; b.writeUInt16BE(height, 7); b.writeUInt16BE(width, 9);
  b[11] = 1; b[12] = 1; b[13] = 0x11; b[14] = 0; b[size - 2] = 0xff; b[size - 1] = 0xd9; return b;
}
function webp(extended = false) {
  const image = Buffer.alloc(18); image.write("VP8 "); image.writeUInt32LE(10, 4); image.set([0x9d, 0x01, 0x2a], 11); image.writeUInt16LE(800, 14); image.writeUInt16LE(600, 16);
  const extension = Buffer.alloc(extended ? 18 : 0);
  if (extended) { extension.write("VP8X"); extension.writeUInt32LE(10, 4); extension.writeUIntLE(799, 12, 3); extension.writeUIntLE(599, 15, 3); }
  const header = Buffer.alloc(12); header.write("RIFF"); header.write("WEBP", 8); header.writeUInt32LE(4 + extension.length + image.length, 4);
  return Buffer.concat([header, extension, image]);
}
function heif(brand = "heic") {
  const ftyp = Buffer.alloc(24); ftyp.writeUInt32BE(24); ftyp.write("ftyp", 4); ftyp.write(brand, 8); ftyp.write("mif1", 16); ftyp.write(brand, 20);
  const meta = Buffer.alloc(12); meta.writeUInt32BE(12); meta.write("meta", 4);
  const data = Buffer.alloc(16); data.writeUInt32BE(16); data.write("mdat", 4);
  return Buffer.concat([ftyp, meta, data]);
}
describe("email attachment classification and bounded processing", () => {
  it("recognises exact bytes and preserves the SHA used by form and recovered CRM uploads", () => {
    const result = classifyAttachment(file(), png);
    expect(result).toEqual({ kind: "photo", name: "synthetic.png", mimeType: "image/png", size: png.length, digest: createHash("sha256").update(png).digest("hex"), extension: "png" });
    expect(classifyAttachment(file(png, { name: "renamed.png" }), png)).toMatchObject({ digest: result.kind === "photo" ? result.digest : "unexpected" });
  });
  it("supports JPEG names without extensions and generic octet-stream MIME without trusting the filename", () => {
    const bytes = jpeg();
    expect(classifyAttachment(file(bytes, { name: "photo", mimeType: "application/octet-stream" }), bytes)).toMatchObject({ kind: "photo", mimeType: "image/jpeg", extension: "jpg", name: "photo.jpg" });
    expect(classifyAttachment(file(bytes, { name: "photo.jpeg", mimeType: "image/jpeg" }), bytes)).toMatchObject({ name: "photo.jpg" });
    expect(classifyAttachment(file(bytes, { mimeType: "image/png" }), bytes)).toMatchObject({ kind: "review", code: "MIME_CONTENT_MISMATCH" });
  });
  it("accepts bounded WebP containers and rejects header-only or truncated containers", () => {
    for (const extended of [false, true]) {
      const bytes = webp(extended);
      expect(classifyAttachment(file(bytes, { name: "home.webp", mimeType: "image/webp" }), bytes)).toMatchObject({ kind: "photo", extension: "webp" });
    }
    const headerOnly = webp(true).subarray(0, 30); headerOnly.writeUInt32LE(22, 4);
    expect(classifyAttachment(file(headerOnly, { mimeType: "image/webp" }), headerOnly)).toMatchObject({ kind: "review" });
    const corrupt = webp(); corrupt.writeUInt32LE(1000, 16);
    expect(classifyAttachment(file(corrupt, { mimeType: "image/webp" }), corrupt)).toMatchObject({ kind: "review" });
  });
  it("accepts HEIC and HEIF only with bounded image containers, never AVIF or a renamed MP4", () => {
    for (const [brand, extension] of [["heic", "heic"], ["heif", "heif"]]) {
      const bytes = heif(brand);
      expect(classifyAttachment(file(bytes, { name: "home", mimeType: `image/${extension}` }), bytes)).toMatchObject({ kind: "photo", extension });
    }
    for (const bytes of [heif("avif"), heif("heic").subarray(0, 24), heif("heic").subarray(0, 40)])
      expect(classifyAttachment(file(bytes, { mimeType: "image/heic" }), bytes)).toMatchObject({ kind: "review" });
    const mp4 = heif("mp42"); mp4.write("isom", 16);
    expect(classifyAttachment(file(mp4, { mimeType: "image/heic" }), mp4)).toMatchObject({ kind: "review" });
    const corrupt = heif(); corrupt.writeUInt32BE(1000, 24);
    expect(classifyAttachment(file(corrupt, { mimeType: "image/heic" }), corrupt)).toMatchObject({ kind: "review" });
  });
  it("ignores quoted photos, small inline logos and signatures while accepting inline property photos", () => {
    expect(classifyAttachment(file(png, { quoted: true }), png)).toMatchObject({ kind: "ignored", code: "QUOTED_ATTACHMENT" });
    expect(classifyAttachment(file(png, { disposition: "inline" }), png)).toMatchObject({ kind: "ignored", code: "SMALL_INLINE_IMAGE" });
    expect(classifyAttachment(file(png, { name: "pa-logo-dark.png" }), png)).toMatchObject({ kind: "ignored", code: "SIGNATURE_IMAGE" });
    const bytes = jpeg();
    expect(classifyAttachment(file(bytes, { name: "image001.jpg", mimeType: "image/jpeg", disposition: "inline" }), bytes)).toMatchObject({ kind: "photo" });
    const banner = jpeg(800, 80);
    expect(classifyAttachment(file(banner, { name: "image001.jpg", mimeType: "image/jpeg", disposition: "inline" }), banner)).toMatchObject({ kind: "ignored" });
  });
  it("distinguishes a PDF document from photographs and never accepts SVG, GIF or HTML as photos", () => {
    const pdf = Buffer.from("%PDF-1.4\nsynthetic test document\n%%EOF");
    expect(classifyAttachment(file(pdf, { name: "synthetic.pdf", mimeType: "application/pdf" }), pdf)).toMatchObject({ kind: "document", extension: "pdf" });
    for (const [name, mimeType, text] of [["x.svg", "image/svg+xml", '<svg onload="alert(1)"></svg>'], ["x.gif", "image/gif", "GIF89asynthetic"], ["x.jpg", "image/jpeg", "<html>synthetic</html>"]]) {
      const bytes = Buffer.from(text);
      expect(classifyAttachment(file(bytes, { name, mimeType }), bytes)).toMatchObject({ kind: "review", code: "UNSUPPORTED_OR_INVALID_FILE" });
    }
  });
  it("holds corrupt signatures, wrong sizes and files above the chosen limit", () => {
    expect(classifyAttachment(file(png, { size: png.length + 1 }), png)).toMatchObject({ kind: "review", code: "ATTACHMENT_SIZE_MISMATCH" });
    expect(classifyAttachment(file(png, { size: INBOUND_FILE_LIMIT + 1 }), png)).toMatchObject({ kind: "review", code: "FILE_TOO_LARGE" });
    expect(classifyAttachment(file(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { mimeType: "image/jpeg" }), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toMatchObject({ kind: "review" });
    const broken = Buffer.from(png); broken.writeUInt32BE(0, 16);
    expect(classifyAttachment(file(broken), broken)).toMatchObject({ kind: "review", code: "INVALID_IMAGE_DIMENSIONS" });
  });
  it("keeps filenames safe for displays and never uses a supplied path for storage", () => {
    expect(classifyAttachment(file(png, { name: "../../private\\home\u0000.png" }), png)).toMatchObject({ name: "home_.png" });
  });
  it("accepts ten 3MB photos but reviews over30 files, over75MB total, or an oversized single file", () => {
    const ten = Array.from({ length: 10 }, (_, i) => file(png, { id: i.toString(16).padStart(64, "0"), size: 3 * 1024 * 1024 }));
    expect(classifyInboundMessage({ attachments: ten })).toEqual({ decision: "accept" });
    expect(classifyInboundMessage({ attachments: [] })).toMatchObject({ decision: "ignored", code: "NO_ATTACHMENTS" });
    expect(classifyInboundMessage({ attachments: Array.from({ length: 31 }, () => file()) })).toMatchObject({ decision: "review", code: "TOO_MANY_ATTACHMENTS" });
    expect(classifyInboundMessage({ attachments: Array.from({ length: 6 }, () => file(png, { size: INBOUND_FILE_LIMIT })) })).toMatchObject({ decision: "review", code: "MESSAGE_TOO_LARGE" });
    expect(classifyInboundMessage({ attachments: [file(png, { size: INBOUND_FILE_LIMIT + 1 })] })).toMatchObject({ decision: "review", code: "FILE_TOO_LARGE" });
  });
});
