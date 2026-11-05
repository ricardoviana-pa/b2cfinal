import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractReplySignals, normalizeMessageId, resolveReplyTarget, type ReplyCandidate } from "./matching";
import { syntheticMetadata } from "./fixtures.test-utils";
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", OLD = "33333333-3333-4333-8333-333333333333";
const token = "a".repeat(43), digest = createHash("sha256").update(token).digest("hex");
const candidate = (): ReplyCandidate => ({ sourceKey: "v4:" + A, enquiryId: A, email: "owner@synthetic.test", personId: 10, dealId: 20,
  requestIds: [A, OLD], tokenHashes: [digest], outboundMessageIds: ["<outgoing@synthetic.test>"], status: "open", archived: false });
describe("owner photo reply association", () => {
  it("associates a normal authenticated reply to the existing deal by actual RFC reference", () => {
    const message = { ...syntheticMetadata(), inReplyTo: ["<outgoing@synthetic.test>"] };
    expect(resolveReplyTarget(message, [candidate()])).toEqual({ decision: "matched", sourceKey: "v4:" + A, enquiryId: A, personId: 10, dealId: 20, matchedBy: ["rfc_reply"], sender: "from" });
  });
  it("supports the 41 old emails by a full quoted request reference and canonical v3 alias", () => {
    const message = { ...syntheticMetadata(), text: `Fotos em anexo\n> Portugal Active\n> ${OLD}` };
    expect(resolveReplyTarget(message, [candidate()])).toMatchObject({ decision: "matched", enquiryId: A, matchedBy: ["request_reference"] });
  });
  it("resolves private upload links only to their hash and never returns tokens or mail text", () => {
    const message = { ...syntheticMetadata(), text: `> https://www.portugalactive.com/management/complete/?lang=pt#token=${token}` };
    const result = resolveReplyTarget(message, [candidate()]);
    expect(result).toMatchObject({ decision: "matched", matchedBy: ["private_link"] });
    expect(JSON.stringify(result)).not.toContain(token); expect(JSON.stringify(extractReplySignals(message))).not.toContain(token);
    expect(extractReplySignals(message).tokenHashes).toEqual([digest]);
    expect(extractReplySignals({ ...message, text: message.text.replace("www.portugalactive.com", "portugalactive.com.evil.test") }).tokenHashes).toEqual([]);
  });
  it("never guesses from a unique sender, subject or the most recent property", () => {
    expect(resolveReplyTarget(syntheticMetadata(), [candidate()])).toEqual({ decision: "review", code: "REQUEST_REFERENCE_MISSING" });
    const message = { ...syntheticMetadata(), subject: "Re: [PA Gestão 11111111] Fotos" };
    expect(resolveReplyTarget(message, [candidate()])).toMatchObject({ decision: "review", code: "REQUEST_REFERENCE_MISSING" });
  });
  it("selects the referenced house when a verified owner has multiple properties", () => {
    const other = { ...candidate(), sourceKey: "v4:" + B, enquiryId: B, requestIds: [B], dealId: 21, tokenHashes: [], outboundMessageIds: [] };
    expect(resolveReplyTarget({ ...syntheticMetadata(), text: B }, [candidate(), other])).toMatchObject({ decision: "matched", dealId: 21 });
  });
  it("holds contradictions between RFC headers and quoted bodies or between two request UUIDs", () => {
    const other = { ...candidate(), sourceKey: "v4:" + B, enquiryId: B, requestIds: [B], dealId: 21, tokenHashes: [], outboundMessageIds: [] };
    expect(resolveReplyTarget({ ...syntheticMetadata(), inReplyTo: ["outgoing@synthetic.test"], text: B }, [candidate(), other])).toMatchObject({ decision: "review", code: "CONFLICTING_REQUEST_REFERENCES" });
    expect(resolveReplyTarget({ ...syntheticMetadata(), text: `${A}\n${B}` }, [candidate(), other])).toMatchObject({ decision: "review", code: "CONFLICTING_REQUEST_REFERENCES" });
  });
  it("rejects the wrong owner or unverified sender even with a valid request reference", () => {
    const message = { ...syntheticMetadata(), text: A };
    expect(resolveReplyTarget({ ...message, from: "someone-else@synthetic.test" }, [candidate()])).toMatchObject({ decision: "review", code: "SENDER_REQUEST_MISMATCH" });
    expect(resolveReplyTarget({ ...message, authentication: { ...message.authentication, fromVerified: false } }, [candidate()])).toMatchObject({ decision: "review", code: "SENDER_NOT_VERIFIED" });
    expect(resolveReplyTarget({ ...message, authentication: { ...message.authentication, googleAuthserv: false } }, [candidate()])).toMatchObject({ decision: "review", code: "SENDER_NOT_VERIFIED" });
  });
  it("uses a rewritten group original sender only with authenticated group and original-sender evidence", () => {
    const message = { ...syntheticMetadata(), from: "management@portugalactive.com", originalSender: "owner@synthetic.test", text: A,
      to: ["ricardo.viana@portugalactive.com"], cc: [], listId: "Management <management.portugalactive.com>",
      authentication: { ...syntheticMetadata().authentication, groupVerified: true, originalSenderVerified: true } };
    expect(resolveReplyTarget(message, [candidate()])).toMatchObject({ decision: "matched", sender: "original_sender" });
    expect(resolveReplyTarget({ ...message, authentication: { ...message.authentication, originalSenderVerified: false } }, [candidate()])).toMatchObject({ decision: "review", code: "ORIGINAL_SENDER_NOT_VERIFIED" });
    expect(resolveReplyTarget({ ...message, authentication: { ...message.authentication, groupVerified: false } }, [candidate()])).toMatchObject({ decision: "ignored" });
  });
  it("accepts Management in Cc and ignores mail addressed to unrelated teams", () => {
    const message = { ...syntheticMetadata(), text: A, to: ["ricardo.viana@portugalactive.com"], cc: ["management@portugalactive.com"] };
    expect(resolveReplyTarget(message, [candidate()])).toMatchObject({ decision: "matched" });
    expect(resolveReplyTarget({ ...message, cc: [] }, [candidate()])).toMatchObject({ decision: "ignored", code: "NOT_MANAGEMENT_REPLY" });
  });
  it("ignores internal notifications and automatic replies without creating anything", () => {
    expect(resolveReplyTarget({ ...syntheticMetadata(), from: "management@portugalactive.com", text: A }, [candidate()])).toMatchObject({ decision: "ignored", code: "INTERNAL_MESSAGE" });
    expect(resolveReplyTarget({ ...syntheticMetadata(), automatic: true, text: A }, [candidate()])).toMatchObject({ decision: "ignored", code: "AUTOMATIC_MESSAGE" });
    expect(resolveReplyTarget({ ...syntheticMetadata(), subject: "Resposta automática: ausente", text: A }, [candidate()])).toMatchObject({ decision: "ignored", code: "AUTOMATIC_MESSAGE" });
  });
  it("holds missing bindings, conflicts and inactive deals; a won deal can receive photos without a stage mutation", () => {
    const message = { ...syntheticMetadata(), text: A };
    expect(resolveReplyTarget(message, [{ ...candidate(), dealId: 0 }])).toMatchObject({ decision: "review", code: "CRM_BINDING_MISSING" });
    expect(resolveReplyTarget(message, [candidate(), { ...candidate(), dealId: 21 }])).toMatchObject({ decision: "review", code: "CANONICAL_MAPPING_CONFLICT" });
    expect(resolveReplyTarget(message, [{ ...candidate(), status: "lost" }])).toMatchObject({ decision: "review", code: "CRM_DEAL_NOT_ACTIVE" });
    expect(resolveReplyTarget(message, [{ ...candidate(), archived: true }])).toMatchObject({ decision: "review", code: "CRM_DEAL_NOT_ACTIVE" });
    expect(resolveReplyTarget(message, [{ ...candidate(), status: "won" }])).toMatchObject({ decision: "matched" });
  });
  it("requires an explicit enquiry allowlist for controlled test identities", () => {
    const c = { ...candidate(), email: "management@portugalactive.com", synthetic: true };
    const message = { ...syntheticMetadata(), from: c.email, text: A };
    expect(resolveReplyTarget(message, [c])).toMatchObject({ decision: "ignored" });
    expect(resolveReplyTarget(message, [c], { allowedTestEnquiryIds: [B] })).toMatchObject({ decision: "ignored" });
    expect(resolveReplyTarget(message, [c], { allowedTestEnquiryIds: [A] })).toMatchObject({ decision: "matched" });
    const unrelated = { ...c, enquiryId: B, sourceKey: `v4:${B}`, requestIds: [B], tokenHashes: [], outboundMessageIds: [], synthetic: false };
    expect(resolveReplyTarget({ ...message, text: B }, [c, unrelated], { allowedTestEnquiryIds: [A] })).toMatchObject({ decision: "ignored", code: "INTERNAL_MESSAGE" });
  });
  it("does not treat provider IDs as RFC IDs and safely decodes quoted entities", () => {
    expect(normalizeMessageId("plain-provider-uuid")).toBeNull();
    const message = { ...syntheticMetadata(), text: A.replaceAll("-", "&#45;") };
    expect(resolveReplyTarget(message, [candidate()])).toMatchObject({ decision: "matched" });
  });
});
