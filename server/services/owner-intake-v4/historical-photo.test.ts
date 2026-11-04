import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildHistoricalPhotoRequest, historicalPhotoId, type HistoricalPhotoSource } from "./historical-photo";
import { managementMediaMail, photoRequestMail } from "./email";
import { detailsInput, recordInput, SYNTHETIC_TOKEN, testNow } from "./fixtures.test-utils";
const now = new Date("2099-01-04T12:00:00Z");
const source = (): HistoricalPhotoSource => ({ dealId: 123, personId: 456, name: "Proprietário fictício", email: "owner@example.test", language: "pt", requestedAt: "2099-01-01T12:00:00Z", propertyType: "villa" });
const url = `https://www.portugalactive.com/management/complete/?lang=pt#token=${SYNTHETIC_TOKEN}`;
describe("existing owner CRM photo continuation", () => {
  it("creates one operational photo request with no welcome, new-lead notice or invented facts", () => {
    const plan = buildHistoricalPhotoRequest(source(), now);
    expect(plan.newRecord).toBe(true); expect(plan.outbox.id).toBe(`${plan.record.id}:photo-reminder`);
    expect(plan.outbox.kind).toBe("historical_photos"); expect(plan.outbox.attachmentBytes).toBe(0);
    expect(plan.record).toMatchObject({ details: null, attribution: null, status: "awaiting_details", privacyAcknowledgedAt: null, privacyNoticeVersion: "owner-crm-photo-followup", completionCount: 0, capturedAt: now });
    expect(plan.record.contact).toMatchObject({ phone: "", locality: "", type: "villa" });
    expect(plan.record.context.page_kind).toBe("crm-photo-followup");
    expect(plan.provenance).toEqual({ dealId: 123, personId: 456, requestedAt: new Date("2099-01-01T12:00:00Z") });
    expect(plan.outbox.payload.mail.subject).toContain("Fotografias para avaliar");
    expect(plan.outbox.payload.mail.text).toContain("mesmo pedido");
    expect(plan.outbox.payload.mail.text).not.toContain("Recebemos o seu pedido");
    expect(plan.outbox.payload.mail.html).toContain("pa-logo-dark.png");
    expect(plan.outbox.payload.mail.replyTo).toBe("management@portugalactive.com");
  });
  it("uses a stable deal-specific UUID and a single reminder identity across runs", () => {
    const first = buildHistoricalPhotoRequest(source(), now), second = buildHistoricalPhotoRequest(source(), now);
    expect(z.string().uuid().safeParse(first.record.id).success).toBe(true);
    expect(first.record.id).toBe(second.record.id); expect(first.outbox.id).toBe(second.outbox.id);
    expect(historicalPhotoId(124)).not.toBe(first.record.id);
    // The persisted winning plan must be reused; new links must never be exposed on replay.
    expect(first.completionUrl).not.toBe(second.completionUrl);
    expect(JSON.stringify(first.record)).not.toContain("#token=");
  });
  it("reuses the exact existing enquiry, original privacy provenance and valid private URL", () => {
    const record = recordInput(); record.contact.email = "owner@example.test";
    const plan = buildHistoricalPhotoRequest({ ...source(), originalEnquiry: { source: "v4", id: record.id } }, now, { record, completionUrl: url, files: [] });
    expect(plan.newRecord).toBe(false); expect(plan.record).toBe(record); expect(plan.completionUrl).toBe(url);
    expect(plan.record.privacyNoticeVersion).toBe("owner-intake-v4"); expect(plan.record.privacyAcknowledgedAt).toEqual(testNow);
    expect(plan.outbox.id).toBe(`${record.id}:photo-reminder`);
  });
  it("never creates a second continuation when an existing v4 reference was supplied", () => {
    expect(() => buildHistoricalPhotoRequest({ ...source(), originalEnquiry: { source: "v4", id: recordInput().id } }, now)).toThrow("EXISTING_CONTINUATION_REQUIRED");
  });
  it("retains only verified details and never infers qualification from contact data", () => {
    const partial = buildHistoricalPhotoRequest({ ...source(), details: { address: "Rua fictícia 10" } }, now);
    expect(partial.record.details).toEqual({ address: "Rua fictícia 10" }); expect(partial.record.qualificationCompletedAt).toBeNull();
    const full = buildHistoricalPhotoRequest({ ...source(), details: detailsInput(), originalEnquiry: { source: "v3", id: recordInput().id } }, now);
    expect(full.record.status).toBe("awaiting_photos"); expect(full.record.qualificationCompletedAt).toEqual(new Date("2099-01-01T12:00:00Z"));
    expect(full.provenance.originalEnquiry?.source).toBe("v3");
  });
  it("rejects missing property type, invalid email/IDs, unknown fields and leads outside the requested window", () => {
    const { propertyType: _, ...missing } = source();
    for (const input of [missing, { ...source(), email: "invalid" }, { ...source(), dealId: -1 }, { ...source(), unexpected: "do not import" }])
      expect(() => buildHistoricalPhotoRequest(input, now)).toThrow("INVALID_HISTORICAL_SOURCE");
    expect(() => buildHistoricalPhotoRequest({ ...source(), requestedAt: "2098-12-27T00:00:00Z" }, now)).toThrow("OUTSIDE_SEVEN_DAY_WINDOW");
    expect(() => buildHistoricalPhotoRequest({ ...source(), requestedAt: "2099-01-05T00:00:00Z" }, now)).toThrow("OUTSIDE_SEVEN_DAY_WINDOW");
  });
  it("rejects mismatched identities, photos already received and invalid or expired URLs", () => {
    const record = recordInput(); const existing = { record, completionUrl: url, files: [] };
    expect(() => buildHistoricalPhotoRequest(source(), now, existing)).toThrow("CONTACT_MATCH_REVIEW");
    record.contact.email = "owner@example.test";
    expect(() => buildHistoricalPhotoRequest(source(), now, { ...existing, files: [{ mimeType: "image/jpeg" }] })).toThrow("PHOTOS_ALREADY_RECEIVED");
    expect(() => buildHistoricalPhotoRequest({ ...source(), details: { photosLink: "https://example.test/album" } }, now)).toThrow("PHOTOS_ALREADY_RECEIVED");
    expect(() => buildHistoricalPhotoRequest(source(), now, { ...existing, completionUrl: url.replace("www.portugalactive.com", "example.test") })).toThrow("INVALID_CONTINUATION_LINK");
    expect(() => buildHistoricalPhotoRequest(source(), now, { ...existing, completionUrl: url.replace(SYNTHETIC_TOKEN, "b".repeat(43)) })).toThrow("INVALID_CONTINUATION_LINK");
    record.tokenExpiresAt = now; expect(() => buildHistoricalPhotoRequest(source(), now, existing)).toThrow("CONTINUATION_EXPIRED");
  });
  it("does not describe an imported CRM enquiry as a newly accepted privacy checkbox", () => {
    const record = buildHistoricalPhotoRequest(source(), now).record;
    const mail = managementMediaMail(record, [{ name: "image.png", mimeType: "image/png" }], "photos");
    expect(mail.text).toContain("Continuação de um pedido comercial já existente no CRM");
    expect(mail.text).not.toContain("Privacidade aceite para tratar este pedido");
    expect(mail.html).toContain("Não foi registada uma nova aceitação");
    expect(mail.text).toContain("Telefone: Por confirmar"); expect(mail.subject).toContain("Localidade por confirmar");
  });
  it("identifies the property in both text and HTML using verified address or locality only", () => {
    const addressed = buildHistoricalPhotoRequest({ ...source(), locality: "Cidade fictícia", details: { address: "Rua fictícia <12>" } }, now);
    expect(addressed.outbox.payload.mail.text).toContain("Propriedade: Rua fictícia <12>");
    expect(addressed.outbox.payload.mail.html).toContain("Propriedade: Rua fictícia &lt;12&gt;");
    expect(addressed.outbox.payload.mail.text).not.toContain("Propriedade: Cidade fictícia");
    const locality = buildHistoricalPhotoRequest({ ...source(), language: "en", locality: "Synthetic town" }, now);
    expect(locality.outbox.payload.mail.text).toContain("Property: Synthetic town");
    expect(locality.outbox.payload.mail.html).toContain("Property: Synthetic town");
    const unknown = buildHistoricalPhotoRequest(source(), now);
    expect(unknown.outbox.payload.mail.text).not.toContain("Propriedade:");
  });
  it("has a clear English equivalent without asking the owner to repeat the form", () => {
    const plan = buildHistoricalPhotoRequest({ ...source(), language: "en" }, now);
    expect(plan.outbox.payload.mail.subject).toContain("Photographs to assess");
    expect(plan.outbox.payload.mail.text).toContain("same enquiry");
    expect(plan.outbox.payload.mail.text).toContain("do not need to enter your details again");
    const record = { ...plan.record, contact: { ...plan.record.contact, name: '<script>Owner</script>' } };
    expect(photoRequestMail(record, plan.completionUrl).html).not.toContain("<script>");
  });
});
