import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signInboundRequest } from "../services/owner-email-photos/protocol";
import { ownerAdmission } from "../lib/owner-admission";
const fake = vi.hoisted(() => ({ enabled: vi.fn(), accept: vi.fn(), file: vi.fn(), complete: vi.fn(), poll: vi.fn(), health: vi.fn(), kick: vi.fn(), crm: vi.fn() }));
vi.mock("../services/owner-email-photos/store", () => ({
  emailPhotosEnabled: fake.enabled, acceptOwnerEmail: fake.accept, putOwnerEmailFile: fake.file,
  completeOwnerEmail: fake.complete, recordOwnerEmailPoll: fake.poll, ownerEmailHealth: fake.health,
  OwnerEmailError: class extends Error { constructor(public code: string, public status = 503) { super(code); } },
}));
vi.mock("../services/owner-intake-v4/service", () => ({ kickV4: fake.kick }));
vi.mock("../services/owner-crm/service", () => ({ sweepOwnerCrm: fake.crm }));
import { registerOwnerEmailPhotoRoutes } from "./owner-email-photos";
const secret = "a".repeat(64), key = "b".repeat(64), file = "c".repeat(64);
const base = "/api/internal/owner-email-photos";
let server: Server, origin: string;
beforeEach(async () => {
  for (const mock of Object.values(fake)) mock.mockReset();
  vi.stubEnv("OWNER_EMAIL_INGEST_SECRET", secret); fake.enabled.mockReturnValue(true);
  fake.accept.mockResolvedValue({ state: "accepted", messageKey: key, missingAttachmentIds: [file] });
  fake.file.mockResolvedValue({ success: true, state: "accepted", duplicate: false });
  fake.complete.mockResolvedValue({ state: "complete", messageKey: key, missingAttachmentIds: [] });
  fake.health.mockResolvedValue({ enabled: true, configured: true, attentionRequired: false, pollCurrent: true });
  fake.crm.mockResolvedValue(undefined);
  const app = express(); registerOwnerEmailPhotoRoutes(app);
  server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const address = server.address() as import("node:net").AddressInfo; origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  vi.unstubAllEnvs(); vi.restoreAllMocks();
  await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
});
function request(path: string, body = Buffer.from("{}"), method = "POST", extra: Record<string, string> = {}) {
  const route = base + path;
  const signed = signInboundRequest(secret, String(Math.floor(Date.now() / 1000)), method, route.split("?")[0], body);
  return fetch(origin + route, { method, body, headers: {
    "content-type": method === "PUT" ? "application/octet-stream" : "application/json",
    "x-pa-timestamp": signed.timestamp, "x-pa-content-sha256": signed.contentSha256, "x-pa-signature": signed.signature, ...extra,
  } });
}
describe("owner email photo ingestion transport", () => {
  it("authenticates before parsing bytes and blocks browser origins, queries and disabled imports", async () => {
    const before = ownerAdmission.snapshot().totals.parsed;
    expect((await request("/messages", undefined, "POST", { "x-pa-signature": "0".repeat(64) })).status).toBe(401);
    expect((await request("/messages", undefined, "POST", { origin: "https://www.portugalactive.com" })).status).toBe(403);
    expect((await request("/messages?secret=ignored")).status).toBe(403);
    fake.enabled.mockReturnValue(false); expect((await request("/messages")).status).toBe(503);
    expect(ownerAdmission.snapshot().totals.parsed).toBe(before); expect(fake.accept).not.toHaveBeenCalled();
  });
  it("checks the actual raw digest and releases reserved memory after rejection", async () => {
    const signed = signInboundRequest(secret, String(Math.floor(Date.now() / 1000)), "POST", base + "/messages", Buffer.from("[]"));
    const result = await request("/messages", Buffer.from("{}"), "POST", {
      "x-pa-timestamp": signed.timestamp, "x-pa-content-sha256": signed.contentSha256, "x-pa-signature": signed.signature,
    });
    expect(result.status).toBe(401); expect(fake.accept).not.toHaveBeenCalled();
    expect(ownerAdmission.snapshot().active).toEqual({ small: 0, media: 0 });
  });
  it("accepts normalized metadata and only starts CRM after durable completion", async () => {
    const result = await request("/messages", Buffer.from('{"synthetic":true}'));
    expect(result.status).toBe(200); expect(fake.accept).toHaveBeenCalledWith({ synthetic: true });
    expect(fake.crm).not.toHaveBeenCalled(); expect(result.headers.get("cache-control")).toContain("no-store");
    expect((await request(`/messages/${key}/files/${file}`, Buffer.from("synthetic-image"), "PUT")).status).toBe(200);
    expect(fake.file).toHaveBeenCalledWith(key, file, Buffer.from("synthetic-image"));
    expect((await request(`/messages/${key}/complete`)).status).toBe(200);
    await new Promise(resolve => setImmediate(resolve)); expect(fake.crm).toHaveBeenCalledTimes(1);
  });
  it("returns durable review states without infinite transfer retries", async () => {
    fake.file.mockResolvedValue({ success: true, state: "review", duplicate: false });
    const response = await request(`/messages/${key}/files/${file}`, Buffer.from("invalid-image"), "PUT");
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ success: true, state: "review" });
    expect(fake.kick).toHaveBeenCalledTimes(1); expect(fake.crm).not.toHaveBeenCalled();
  });
  it("enforces 15 MiB, content types, identifiers and strict empty control bodies", async () => {
    expect((await request(`/messages/${key}/files/${file}`, Buffer.alloc(15 * 1024 * 1024 + 1), "PUT")).status).toBe(413);
    expect((await request(`/messages/${key}/files/not-valid`, Buffer.from("x"), "PUT")).status).toBe(400);
    expect((await request("/messages", undefined, "POST", { "content-type": "text/plain" })).status).toBe(415);
    expect((await request("/poll", Buffer.from('{"private":"ignored"}'))).status).toBe(400);
    expect(fake.file).not.toHaveBeenCalled(); expect(fake.poll).not.toHaveBeenCalled();
  });
  it("records an authenticated heartbeat and exposes only aggregate health", async () => {
    expect((await request("/poll")).status).toBe(200); expect(fake.poll).toHaveBeenCalledTimes(1);
    const response = await fetch(origin + base + "/health"); expect(response.status).toBe(200);
    expect(Object.values(await response.json()).every(value => typeof value === "boolean")).toBe(true);
  });
  it("never discloses source errors or acknowledges an uncommitted write", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    fake.complete.mockRejectedValue(new Error("private-owner@example.invalid secret-token"));
    const result = await request(`/messages/${key}/complete`); expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ success: false, code: "EMAIL_IMPORT_UNAVAILABLE" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-owner"); expect(fake.crm).not.toHaveBeenCalled();
  });
});
