import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../db", () => ({ getDb: vi.fn() }));
import { parseOutboundEvent } from "./outbound";
const key = Buffer.from("synthetic-secret-only-123456789012"), secret = `whsec_${key.toString("base64")}`;
function event(input: any) {
  const body = Buffer.from(JSON.stringify(input)), id = "msg_synthetic_owner_photo_test", timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.`).update(body).digest("base64")}`;
  return { body, headers: { id, timestamp, signature } };
}
const data = { email_id: "22d64b28-8fd4-49bf-9604-369d9662c451", message_id: "<synthetic-owner-message@example.invalid>", from: "Portugal Active · Management <management@portugalactive.com>" };
afterEach(() => vi.restoreAllMocks());
describe("outbound email correlation", () => {
  it("verifies the provider event locally and retains only genuine provider/RFC identifiers", () => {
    const { body, headers } = event({ type: "email.sent", data: { ...data, to: ["owner@example.invalid"], subject: "Private synthetic subject" } });
    const result = parseOutboundEvent(body, headers, secret);
    expect(result).toEqual({ providerId: data.email_id, messageId: data.message_id });
    expect(JSON.stringify(result)).not.toContain("owner@example.invalid");
  });
  it("rejects a changed payload, incorrect signature and expired event", () => {
    const { body, headers } = event({ type: "email.sent", data });
    expect(() => parseOutboundEvent(Buffer.concat([body, Buffer.from(" ")]), headers, secret)).toThrow("INVALID_WEBHOOK_SIGNATURE");
    expect(() => parseOutboundEvent(body, { ...headers, signature: "v1,AAAA" }, secret)).toThrow("INVALID_WEBHOOK_SIGNATURE");
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 600_000);
    expect(() => parseOutboundEvent(body, headers, secret)).toThrow("INVALID_WEBHOOK_SIGNATURE"); clock.mockRestore();
  });
  it("ignores other event types and non-management senders", () => {
    for (const value of [{ type: "email.delivered", data }, { type: "email.sent", data: { ...data, from: "booking@portugalactive.com" } }]) {
      const { body, headers } = event(value); expect(parseOutboundEvent(body, headers, secret)).toBeNull();
    }
  });
  it("never invents RFC identifiers when the provider has not supplied one", () => {
    const { body, headers } = event({ type: "email.sent", data: { ...data, message_id: undefined } });
    expect(() => parseOutboundEvent(body, headers, secret)).toThrow("INVALID_OUTBOUND_EVENT");
  });
});
