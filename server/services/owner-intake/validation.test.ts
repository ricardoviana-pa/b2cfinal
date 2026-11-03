import { describe, expect, it } from "vitest";
import { OWNER_FILE_LIMIT, OWNER_TOTAL_FILE_LIMIT } from "../../../shared/owner-intake";
import { validateLegacyOwnerIntake, validateOwnerIntake } from "./validation";
import { png, syntheticOwner } from "./__tests__/fixtures";

describe("owner qualification and private file validation", () => {
  it("normalises postcode/email while retaining net annual owner expectations", () => {
    const parsed = validateOwnerIntake({ ...syntheticOwner(), email: "OWNER@example.invalid" });
    expect(parsed.fields).toMatchObject({ postalCode: "4900-123", email: "owner@example.invalid", incomeBasis: "annual_net_owner" });
    expect(parsed.fields).not.toHaveProperty("website");
  });
  it.each(["phone", "email", "postalCode", "operatedBefore", "licenseStatus", "occupied", "forSale", "saleInterest", "launchTimeline", "incomeExpectation"])("rejects missing %s before saving", key => {
    expect(() => validateOwnerIntake({ ...syntheticOwner(), [key]: "" })).toThrow("VALIDATION_FAILED");
  });
  it("rejects absent privacy acknowledgement and a filled honeypot", () => {
    expect(() => validateOwnerIntake({ ...syntheticOwner(), privacyAcknowledged: false })).toThrow();
    expect(() => validateOwnerIntake({ ...syntheticOwner(), website: "spam" })).toThrow();
  });
  it("requires selected photos method and rejects URLs with credentials or executable protocols", () => {
    for (const photosLink of ["", "javascript:alert(1)", "https://secret@example.invalid/photos"]) {
      expect(() => validateOwnerIntake({ ...syntheticOwner(), photoMethod: "link", photosLink })).toThrow();
    }
    expect(() => validateOwnerIntake({ ...syntheticOwner(), photoMethod: "files" })).toThrow();
  });
  it("accepts a full 5 MiB file without recursive regex overflow", () => {
    const result = validateOwnerIntake({ ...syntheticOwner(), photoMethod: "files", attachments: [png(OWNER_FILE_LIMIT)] });
    expect(result.attachments[0].size).toBe(OWNER_FILE_LIMIT);
  });
  it("accepts 15 MiB in total but rejects a fourth 5 MiB file", () => {
    const file = png(OWNER_FILE_LIMIT);
    const data = { ...syntheticOwner(), photoMethod: "files", attachments: [file, file, file] };
    expect(validateOwnerIntake(data).attachments.reduce((n, a) => n + a.size, 0)).toBe(OWNER_TOTAL_FILE_LIMIT);
    expect(() => validateOwnerIntake({ ...data, attachments: [...data.attachments, file] })).toThrow("PAYLOAD_TOO_LARGE");
  });
  it("checks file signature, extension, canonical base64, size and filename controls", () => {
    const variants = [
      { ...png(), base64: Buffer.from("<script>fake image</script>").toString("base64") },
      { ...png(), name: "image.svg" }, { ...png(), name: "image\r\n.png" },
      { ...png(), name: "../image.png" }, { ...png(), base64: "AA==AAAA" },
      { ...png(), base64: "AB==" }, { ...png(), base64: "====" },
      png(OWNER_FILE_LIMIT + 1),
    ];
    for (const file of variants) expect(() => validateOwnerIntake({ ...syntheticOwner(), photoMethod: "files", attachments: [file] })).toThrow();
  });
  it("caps attachment count", () => {
    expect(() => validateOwnerIntake({ ...syntheticOwner(), photoMethod: "files", attachments: Array.from({ length: 9 }, () => png()) })).toThrow();
  });
  it("fingerprints both data and actual bytes without retaining base64 in stored fields", () => {
    const data = { ...syntheticOwner(), photoMethod: "files", attachments: [png()] };
    const first = validateOwnerIntake(data);
    expect(validateOwnerIntake(data).fingerprint).toBe(first.fingerprint);
    expect(validateOwnerIntake({ ...data, description: "A changed synthetic description of this property." }).fingerprint).not.toBe(first.fingerprint);
    expect(validateOwnerIntake({ ...data, attachments: [png(25)] }).fingerprint).not.toBe(first.fingerprint);
    expect(first.fields).not.toHaveProperty("attachments");
  });
});
describe("old cached forms", () => {
  const old = () => ({ name: "Synthetic", email: "legacy@example.invalid", phone: "", address: "Synthetic property", type: "villa", bedrooms: "3", license: "A confirmar", photosLink: "", notes: "Some synthetic notes", language: "pt" });
  it("preserves the client UUID but never invents missing qualification answers", () => {
    const result = validateLegacyOwnerIntake({ ...old(), notes: `Pedido: ${syntheticOwner().requestId}` });
    expect(result.fields).toMatchObject({ requestId: syntheticOwner().requestId, qualificationIncomplete: true, schemaVersion: "owner-intake-legacy" });
    expect(result.fields).not.toHaveProperty("incomeExpectation");
    expect(result.fields).not.toHaveProperty("licenseStatus");
  });
  it("deduplicates a replay without a UUID and distinguishes a new declared submission time", () => {
    expect(validateLegacyOwnerIntake(old()).fields.requestId).toBe(validateLegacyOwnerIntake(old()).fields.requestId);
    expect(validateLegacyOwnerIntake({ ...old(), submittedAt: "2099-01-01T00:00:00Z" }).fields.requestId)
      .not.toBe(validateLegacyOwnerIntake({ ...old(), submittedAt: "2099-02-01T00:00:00Z" }).fields.requestId);
  });
  it("timestamp changes never override an existing request UUID or alter its fingerprint", () => {
    const data = { ...old(), notes: `Pedido: ${syntheticOwner().requestId}` };
    expect(validateLegacyOwnerIntake({ ...data, submittedAt: "2099-01-01T00:00:00Z" }).fingerprint)
      .toBe(validateLegacyOwnerIntake({ ...data, submittedAt: "2099-02-01T00:00:00Z" }).fingerprint);
  });
});
