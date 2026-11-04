import { describe, it, expect } from "vitest";
import { bearerToken, completeDetails, fingerprint, mediaSchema, mutationSchema, newToken, parse, startSchema, tokenHash, validateFile } from "./validation";
import { detailsInput, pngBytes, startInput } from "./fixtures.test-utils";
describe("v4 contact, continuation and separate file contract", () => {
  it("captures only essential details and normalises the contact", () => {
    const value = parse(startSchema, { ...startInput(), email: "OWNER@example.invalid", name: " Synthetic " });
    expect(value.email).toBe("owner@example.invalid"); expect(value.name).toBe("Synthetic");
    expect(value).not.toHaveProperty("details");
  });
  it.each(["name", "email", "phone", "type", "locality", "privacyAcknowledged"])("requires %s before capture", key => {
    expect(() => parse(startSchema, { ...startInput(), [key]: "" })).toThrow("VALIDATION_FAILED");
  });
  it("rejects honeypot, uncontrolled attribution and fields outside the contract", () => {
    for (const extra of [{ website: "bot" }, { attribution: { campaign: "email@example.invalid" } }, { attribution: { term: "private query" } }, { attribution: { landing_path: "/management/?email=private" } }, { unexpected: "field" }])
      expect(() => parse(startSchema, { ...startInput(), ...extra })).toThrow("VALIDATION_FAILED");
  });
  it("generates 256-bit random bearer tokens and never accepts a reference as authorization", () => {
    const a = newToken(), b = newToken(); expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32); expect(tokenHash(a)).toHaveLength(64);
    expect(bearerToken(`Bearer ${a}`)).toBe(a);
    for (const value of [undefined, startInput().requestId, `Bearer ${startInput().requestId}`, `Bearer ${a} `, `?token=${a}`])
      expect(() => bearerToken(value)).toThrow("TOKEN_INVALID_OR_EXPIRED");
  });
  it("permits partial drafts and inline corrections but never changing the email", () => {
    const mutationId = startInput().requestId;
    expect(parse(mutationSchema, { mutationId, contact: { phone: "+351 900 000 001" }, details: { description: "short" } }).details).toEqual({ description: "short" });
    expect(parse(mutationSchema, { mutationId, details: {} }).details).toEqual({});
    expect(() => parse(mutationSchema, { mutationId, contact: { email: "other@example.invalid" } })).toThrow("VALIDATION_FAILED");
  });
  it("completion retains all qualification answers while photos remain optional", () => {
    expect(completeDetails(detailsInput()).photosLink).toBe("");
    expect(() => completeDetails({ ...detailsInput(), description: "short" })).toThrow("VALIDATION_FAILED");
    expect(() => completeDetails({ ...detailsInput(), photosLink: "javascript:alert(1)" })).toThrow("VALIDATION_FAILED");
    expect(() => completeDetails({ ...detailsInput(), postalCode: "123" })).toThrow("VALIDATION_FAILED");
  });
  it("limits follow-up to an idempotency ID and an optional safe photo link", () => {
    const mutationId = startInput().requestId;
    expect(parse(mediaSchema, { mutationId })).toEqual({ mutationId });
    expect(parse(mediaSchema, { mutationId, photosLink: "" })).toEqual({ mutationId, photosLink: "" });
    expect(parse(mediaSchema, { mutationId, photosLink: " https://example.test/photos " }).photosLink).toBe("https://example.test/photos");
    for (const extra of [{ photosLink: "javascript:alert(1)" }, { photosLink: "https://" }, { contact: { name: "Other" } }, { details: { description: "Other" } }])
      expect(() => parse(mediaSchema, { mutationId, ...extra })).toThrow("VALIDATION_FAILED");
  });
  it("hashes canonical payloads independently of object key order", () => {
    expect(fingerprint({ a: 1, b: { x: true, y: 2 } })).toBe(fingerprint({ b: { y: 2, x: true }, a: 1 }));
  });
  it("validates a binary 5MiB file without base64 or regex stack growth", () => {
    const bytes = pngBytes(5 * 1024 * 1024);
    const file = validateFile(startInput().requestId, "synthetic.png", "image/png", bytes);
    expect(file.size).toBe(bytes.length); expect(file.bytes).toBe(bytes);
    expect(() => validateFile(startInput().requestId, "synthetic.png", "image/png", pngBytes(bytes.length + 1))).toThrow("PAYLOAD_TOO_LARGE");
  });
  it("rejects mismatched extensions, signatures and unsafe names", () => {
    for (const [name, type, bytes] of [["../test.png", "image/png", pngBytes()], ["test.pdf", "image/png", pngBytes()], ["test.png", "image/png", Buffer.from("bad")], ["test.png", "text/html", pngBytes()]])
      expect(() => validateFile(startInput().requestId, name, type, bytes)).toThrow("VALIDATION_FAILED");
  });
});
