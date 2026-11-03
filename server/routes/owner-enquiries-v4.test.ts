import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ start: vi.fn(), auth: vi.fn(), draft: vi.fn(), mutate: vi.fn(), file: vi.fn(), remove: vi.fn(), ready: vi.fn(), attention: vi.fn(), kick: vi.fn() }));
vi.mock("../services/owner-intake-v4/store", () => ({ startV4: fake.start, authenticateV4: fake.auth, draftV4: fake.draft,
  mutateV4: fake.mutate, addV4File: fake.file, removeV4File: fake.remove, v4SchemaReady: fake.ready, v4AttentionRequired: fake.attention }));
vi.mock("../services/owner-intake-v4/service", () => ({ kickV4: fake.kick }));
import { registerOwnerV4Routes } from "./owner-enquiries-v4";
import { ownerAdmission } from "../lib/owner-admission";
import { OwnerIntakeError } from "../services/owner-intake-v4/validation";
import { detailsInput, pngBytes, recordInput, startInput, SYNTHETIC_TOKEN } from "../services/owner-intake-v4/fixtures.test-utils";
let server: Server; let base: string;
const path = "/api/owner-enquiries/v4";
const origin = "https://www.portugalactive.com";
beforeEach(async () => {
  for (const mock of Object.values(fake)) mock.mockReset();
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_ENV", "production"); vi.stubEnv("RENDER_GIT_BRANCH", "main");
  vi.stubEnv("RENDER_SERVICE_ID", "srv-d700n5fgi27c73f9bse0"); vi.stubEnv("RESEND_API_KEY", "synthetic-only");
  fake.auth.mockResolvedValue(recordInput()); fake.ready.mockResolvedValue(true); fake.attention.mockResolvedValue(false);
  fake.start.mockImplementation(async input => ({ success: true, reference: input.requestId, status: "awaiting_details", duplicate: false, continuationToken: SYNTHETIC_TOKEN,
    completionUrl: `${origin}/management/complete/?lang=pt#token=${SYNTHETIC_TOKEN}` }));
  fake.draft.mockResolvedValue({ success: true, reference: recordInput().id, status: "awaiting_details", contact: recordInput().contact, context: recordInput().context, details: null, files: [], expiresAt: "2099-02-01T00:00:00.000Z" });
  fake.mutate.mockResolvedValue({ success: true, reference: recordInput().id, status: "awaiting_photos", duplicate: false });
  fake.file.mockImplementation(async (_auth, file) => ({ success: true, reference: recordInput().id, status: "awaiting_details", duplicate: false,
    file: { id: file.id, name: file.name, mimeType: file.mimeType, size: file.size } }));
  fake.remove.mockResolvedValue({ success: true, reference: recordInput().id, status: "awaiting_details", duplicate: true });
  const app = express(); registerOwnerV4Routes(app);
  server = await new Promise<Server>((resolve, reject) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); s.once("error", reject); });
  const address = server.address(); base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}${path}`;
});
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); if (server) await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }); });
function request(route: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) {
  return fetch(base + route, { method, headers: { Origin: origin, Authorization: `Bearer ${SYNTHETIC_TOKEN}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
describe("v4 private continuation HTTP contract", () => {
  it("accepts a small contact before any qualification or optional files", async () => {
    const result = await request("/start", "POST", startInput()); expect(result.status).toBe(201);
    expect(await result.json()).toMatchObject({ success: true, reference: startInput().requestId, continuationToken: SYNTHETIC_TOKEN });
    expect(fake.kick).toHaveBeenCalledTimes(1); expect(fake.file).not.toHaveBeenCalled();
    expect(result.headers.get("Cache-Control")).toContain("no-store"); expect(result.headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("requires valid contact/consent and blocks previews and unowned origins", async () => {
    expect((await request("/start", "POST", { ...startInput(), email: "invalid" })).status).toBe(400);
    expect((await request("/start", "POST", startInput(), { Origin: "https://other.example.invalid" })).status).toBe(403);
    expect((await request("/start", "POST", startInput(), { Origin: "" })).status).toBe(403);
    vi.stubEnv("APP_ENV", "preview"); expect((await request("/start", "POST", startInput())).status).toBe(503);
    expect(fake.start).not.toHaveBeenCalled();
  });
  it("accepts bearer authorization only and excludes continuation data from file GETs", async () => {
    expect((await request(`/draft?token=${SYNTHETIC_TOKEN}`, "GET", undefined, { Authorization: "" })).status).toBe(401);
    expect(fake.auth).not.toHaveBeenCalled();
    expect((await request("/draft", "GET", undefined, { Authorization: `Bearer ${startInput().requestId}` })).status).toBe(401);
    expect((await request(`/files/${startInput().requestId}`)).status).toBe(404);
    const result = await fetch(base + "/draft", { headers: { Authorization: `Bearer ${SYNTHETIC_TOKEN}` } });
    expect(result.status).toBe(200); expect(await result.json()).not.toHaveProperty("continuationToken");
  });
  it("authenticates before reading an upload and never writes an expired request", async () => {
    fake.auth.mockRejectedValue(new OwnerIntakeError("TOKEN_INVALID_OR_EXPIRED", 401));
    const result = await fetch(base + `/files/${startInput().requestId}`, { method: "PUT", headers: { Origin: origin, Authorization: `Bearer ${SYNTHETIC_TOKEN}`, "Content-Type": "image/png", "X-File-Name": "synthetic.png" }, body: pngBytes() });
    expect(result.status).toBe(401); expect(fake.file).not.toHaveBeenCalled();
  });
  it("bounds outstanding token lookups without blocking independent small contact capture", async () => {
    const release: (() => void)[] = [];
    fake.auth.mockImplementation(() => new Promise(resolve => { release.push(() => resolve(recordInput())); }));
    const pending = Array.from({ length: 8 }, () => request("/draft"));
    await vi.waitFor(() => expect(release).toHaveLength(8));
    const blocked = await request("/draft"); expect(blocked.status).toBe(429); expect(blocked.headers.get("Retry-After")).toBe("5");
    expect((await request("/start", "POST", startInput())).status).toBe(201);
    release.forEach(resolve => resolve()); await Promise.all(pending);
  });
  it("saves drafts and completes optional-photo qualification using the same authenticated record", async () => {
    const mutationId = startInput().requestId;
    expect((await request("/draft", "PATCH", { mutationId, contact: { phone: "+351900000001" }, details: { description: "Partial" } })).status).toBe(200);
    expect(fake.mutate.mock.calls[0][2]).toBe(false);
    const response = await request("/complete", "POST", { mutationId, details: detailsInput() });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ status: "awaiting_photos", reference: recordInput().id });
    expect(fake.mutate.mock.calls[1][2]).toBe(true);
    expect((await request("/draft", "PATCH", { mutationId, contact: { email: "other@example.invalid" } })).status).toBe(400);
  });
  it("uploads binary bytes with encoded filenames, without JSON/base64", async () => {
    const response = await fetch(base + `/files/${startInput().requestId}`, { method: "PUT", headers: { Origin: origin, Authorization: `Bearer ${SYNTHETIC_TOKEN}`, "Content-Type": "image/png", "X-File-Name": encodeURIComponent("Casa sintética.png") }, body: pngBytes() });
    expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ file: { name: "Casa sintética.png", size: 24 } });
    expect(fake.file.mock.calls[0][1].bytes.equals(pngBytes())).toBe(true);
    expect((await request(`/files/${startInput().requestId}`, "PUT", { base64: "anything" })).status).toBe(415);
  });
  it("does not acknowledge a failed transaction or disclose its error values", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    fake.start.mockRejectedValue(new Error(`synthetic ${SYNTHETIC_TOKEN} private-owner@example.invalid`));
    const response = await request("/start", "POST", startInput()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ success: false, code: "INTAKE_UNAVAILABLE" });
    expect(JSON.stringify(log.mock.calls)).not.toContain(SYNTHETIC_TOKEN); expect(JSON.stringify(log.mock.calls)).not.toContain("private-owner"); expect(fake.kick).not.toHaveBeenCalled();
  });
  it("preserves the upload reservation until a disconnected client's DB operation finishes", async () => {
    let release!: () => void; let entered!: () => void;
    const writing = new Promise<void>(resolve => { entered = resolve; });
    fake.file.mockImplementation(async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); return { success: true }; });
    const controller = new AbortController();
    const response = fetch(base + `/files/${startInput().requestId}`, { method: "PUT", signal: controller.signal,
      headers: { Origin: origin, Authorization: `Bearer ${SYNTHETIC_TOKEN}`, "Content-Type": "image/png", "X-File-Name": "synthetic.png" }, body: pngBytes() }).catch(() => null);
    await writing; expect(ownerAdmission.snapshot().active.media).toBe(1); controller.abort(); await response;
    expect(ownerAdmission.snapshot().active.media).toBe(1); release();
    await vi.waitFor(() => expect(ownerAdmission.snapshot().active.media).toBe(0));
  });
  it("caps repeated public captures with an explicit Retry-After", async () => {
    for (let i = 0; i < 15; i++) expect((await request("/start", "POST", {})).status).toBe(400);
    const blocked = await request("/start", "POST", startInput()); expect(blocked.status).toBe(429); expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(fake.start).not.toHaveBeenCalled();
  });
  it("reports aggregate delivery attention without exposing lead records", async () => {
    fake.attention.mockResolvedValue(true); const response = await request("/health"); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ready: true, schemaVersion: "owner-intake-v4", storageReady: true, emailConfigured: true, deliveryAttentionRequired: true });
  });
});
