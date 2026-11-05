import { describe, expect, it } from "vitest";
import { bodyDigest, INBOUND_FILE_LIMIT, metadataSchema, parseInboundMetadata, signInboundRequest, verifyBodyDigest, verifySignedHeaders } from "./protocol";
import { syntheticMetadata } from "./fixtures.test-utils";
describe("signed internal owner-photo ingress protocol", () => {
  const secret = "synthetic-test-only-secret-not-for-production";
  const now = new Date("2099-01-04T12:00:00Z"), timestamp = String(+now / 1000), body = Buffer.from('synthetic\nbody');
  const path = "/api/owner-email-photos/messages";
  it("authenticates declared digest before reading body and verifies exact raw bytes afterwards", () => {
    const headers = signInboundRequest(secret, timestamp, "POST", path, body);
    expect(headers.contentSha256).toBe(bodyDigest(body));
    expect(verifySignedHeaders(secret, headers, "POST", path, now)).toBe(true);
    expect(verifyBodyDigest(body, headers.contentSha256)).toBe(true);
    expect(() => verifyBodyDigest(Buffer.from("synthetic changed body"), headers.contentSha256)).toThrow("INBOUND_BODY_DIGEST_MISMATCH");
  });
  it("binds method, pathname, timestamp and body digest and rejects stale/future requests", () => {
    const headers = signInboundRequest(secret, timestamp, "POST", path, body);
    expect(() => verifySignedHeaders(secret, headers, "PUT", path, now)).toThrow("INBOUND_SIGNATURE_INVALID");
    expect(() => verifySignedHeaders(secret, headers, "POST", path + "/changed", now)).toThrow("INBOUND_SIGNATURE_INVALID");
    expect(() => verifySignedHeaders(secret, { ...headers, contentSha256: "a".repeat(64) }, "POST", path, now)).toThrow("INBOUND_SIGNATURE_INVALID");
    expect(() => verifySignedHeaders(secret, { ...headers, timestamp: String(+timestamp + 1) }, "POST", path, now)).toThrow("INBOUND_SIGNATURE_INVALID");
    expect(() => verifySignedHeaders(secret, headers, "POST", path, new Date(+now + 301000))).toThrow("INBOUND_SIGNATURE_EXPIRED");
    expect(() => verifySignedHeaders(secret, headers, "POST", path, new Date(+now - 301000))).toThrow("INBOUND_SIGNATURE_EXPIRED");
    expect(() => verifySignedHeaders(secret, { ...headers, signature: "not-hex" }, "POST", path, now)).toThrow("INBOUND_SIGNATURE_INVALID");
  });
  it("rejects ambiguous paths, invalid digests and missing secrets", () => {
    expect(() => signInboundRequest(secret, timestamp, "POST", path + "?unbound=1", body)).toThrow("INVALID_SIGNED_REQUEST");
    expect(() => signInboundRequest("short", timestamp, "POST", path, body)).toThrow("INBOUND_SECRET_UNAVAILABLE");
    expect(() => verifyBodyDigest(body, "bad")).toThrow("INBOUND_BODY_DIGEST_MISMATCH");
  });
  it("uses the exact read-only source mailbox and a strict bounded metadata contract", () => {
    expect(parseInboundMetadata(syntheticMetadata())).toEqual(syntheticMetadata());
    expect(metadataSchema.safeParse({ ...syntheticMetadata(), mailbox: "different@synthetic.test" }).success).toBe(false);
    expect(metadataSchema.safeParse({ ...syntheticMetadata(), attachmentUrl: "https://synthetic.test/file" }).success).toBe(false);
    expect(metadataSchema.safeParse({ ...syntheticMetadata(), text: "x".repeat(16001) }).success).toBe(false);
    expect(metadataSchema.safeParse({ ...syntheticMetadata(), originalSender: "not an email" }).success).toBe(false);
  });
  it("accepts oversized declarations for a durable policy review and rejects duplicate part identities", () => {
    const file = { id: "a".repeat(64), name: "synthetic.jpg", mimeType: "image/jpeg", size: INBOUND_FILE_LIMIT + 1, disposition: "attachment" as const };
    expect(metadataSchema.safeParse({ ...syntheticMetadata(), attachments: [file] }).success).toBe(true);
    expect(metadataSchema.safeParse({ ...syntheticMetadata(), attachments: [file, file] }).success).toBe(false);
    expect(() => parseInboundMetadata({ ...syntheticMetadata(), attachments: [{ ...file, size: -1 }] })).toThrow("INVALID_INBOUND_METADATA");
  });
});
