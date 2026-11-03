import express, { type Express } from "express";
import { createServer, request as httpRequest, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syntheticOwner } from "../services/owner-intake/__tests__/fixtures";
import { OwnerIntakeError } from "../services/owner-intake/validation";

const fake = vi.hoisted(() => ({
  accept: vi.fn(),
  deliver: vi.fn(),
  production: vi.fn(),
  email: vi.fn(),
  schema: vi.fn(),
  attention: vi.fn(),
}));
vi.mock("../services/owner-intake/service", () => ({
  acceptOwnerIntake: fake.accept,
  sweepOwnerNotifications: fake.deliver,
}));
vi.mock("../services/owner-intake/email", () => ({
  isOwnerIntakeProduction: fake.production,
  ownerEmailConfigured: fake.email,
}));
vi.mock("../services/owner-intake/store", () => ({
  ownerDeliveryAttentionRequired: fake.attention,
  ownerSchemaReady: fake.schema,
}));
import {
  ownerRequestOriginAllowed,
  registerOwnerEnquiryRoutes,
} from "./owner-enquiries";
import {
  createOwnerAdmission,
  ownerBodyHandler,
  type OwnerAdmission,
} from "../lib/owner-admission";

let server: Server;
let app: Express;
let admission: OwnerAdmission;
let origin: string;
const headers = {
  "Content-Type": "application/json",
  Origin: "https://www.portugalactive.com",
};
const post = (
  payload: unknown,
  path = "/api/owner-enquiries",
  moreHeaders = {}
) =>
  fetch(`${origin}${path}`, {
    method: "POST",
    headers: { ...headers, ...moreHeaders },
    body: JSON.stringify(payload),
  });
beforeEach(async () => {
  for (const mock of Object.values(fake)) mock.mockReset();
  fake.production.mockReturnValue(true);
  fake.email.mockReturnValue(true);
  fake.schema.mockResolvedValue(true);
  fake.attention.mockResolvedValue(false);
  fake.accept.mockResolvedValue({
    reference: syntheticOwner().requestId,
    duplicate: false,
  });
  fake.deliver.mockResolvedValue("sent");
  app = express();
  admission = createOwnerAdmission();
  registerOwnerEnquiryRoutes(app, admission);
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterEach(async () => {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve()))
  );
});

describe("owner HTTP boundary (only synthetic mocked DB/provider)", () => {
  it("acknowledges committed data before triggering notification, with no caching", async () => {
    let commit!: (value: unknown) => void;
    fake.accept.mockImplementation(
      () =>
        new Promise(resolve => {
          commit = resolve;
        })
    );
    const pending = post(syntheticOwner());
    await vi.waitFor(() => expect(fake.accept).toHaveBeenCalled(), {
      timeout: 1000,
      interval: 5,
    });
    expect(fake.deliver).not.toHaveBeenCalled();
    commit({ reference: syntheticOwner().requestId, duplicate: false });
    const response = await pending;
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({
      success: true,
      reference: syntheticOwner().requestId,
      duplicate: false,
    });
    expect(fake.deliver).toHaveBeenCalledTimes(1);
  });
  it("storage failure returns503 and never invokes a provider", async () => {
    fake.accept.mockRejectedValue(new OwnerIntakeError("INTAKE_UNAVAILABLE"));
    const response = await post(syntheticOwner());
    expect(response.status).toBe(503);
    expect(fake.deliver).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      success: false,
      code: "INTAKE_UNAVAILABLE",
    });
  });
  it("returns stable success for a replay and409 for changed data under the same reference", async () => {
    fake.accept.mockResolvedValueOnce({
      reference: syntheticOwner().requestId,
      duplicate: true,
    });
    expect((await post(syntheticOwner())).status).toBe(200);
    fake.accept.mockRejectedValueOnce(
      new OwnerIntakeError("REQUEST_ID_CONFLICT", 409)
    );
    expect((await post(syntheticOwner())).status).toBe(409);
    expect(fake.deliver).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed qualification without echoing owner contact details", async () => {
    const response = await post({
      ...syntheticOwner(),
      phone: "",
      email: "sensitive-invalid-email",
    });
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toContain('"fields":["email","phone"]');
    expect(body).not.toContain("sensitive-invalid-email");
    expect(fake.accept).not.toHaveBeenCalled();
  });
  it("rejects cross-site, missing origin and non-JSON submissions before parsing or persistence", async () => {
    expect(
      (
        await post(syntheticOwner(), undefined, {
          Origin: "https://attacker.invalid",
        })
      ).status
    ).toBe(403);
    expect(
      (await post(syntheticOwner(), undefined, { Origin: "" })).status
    ).toBe(403);
    expect(
      (
        await post(syntheticOwner(), undefined, {
          "Sec-Fetch-Site": "cross-site",
        })
      ).status
    ).toBe(403);
    expect(
      (
        await post(syntheticOwner(), undefined, {
          "Content-Type": "text/plain",
        })
      ).status
    ).toBe(415);
    expect(
      (await post(syntheticOwner(), undefined, { "Content-Encoding": "gzip" }))
        .status
    ).toBe(415);
    expect(fake.accept).not.toHaveBeenCalled();
  });
  it("blocks preview writes and readiness independently of any provider credentials", async () => {
    fake.production.mockReturnValue(false);
    fake.email.mockReturnValue(false);
    expect((await post(syntheticOwner())).status).toBe(503);
    expect(fake.accept).not.toHaveBeenCalled();
    expect((await fetch(`${origin}/api/owner-enquiries/health`)).status).toBe(
      503
    );
    expect(fake.schema).not.toHaveBeenCalled();
  });
  it("accepts an old cached form through the same clean delivery circuit", async () => {
    const response = await post(
      {
        name: "Synthetic",
        email: "old@example.invalid",
        address: "Synthetic property",
        type: "villa",
        bedrooms: "2",
        notes: `Pedido: ${syntheticOwner().requestId}`,
      },
      "/api/owner-enquiries/legacy"
    );
    expect(response.status).toBe(201);
    expect(fake.accept.mock.calls[0][0].fields).toMatchObject({
      qualificationIncomplete: true,
      schemaVersion: "owner-intake-legacy",
    });
  });
  it("rejects malformed JSON and oversized legacy bodies", async () => {
    const response = await fetch(`${origin}/api/owner-enquiries`, {
      method: "POST",
      headers,
      body: "{not-json",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      code: "INVALID_JSON",
    });
    expect(
      (
        await post(
          { extra: "x".repeat(60 * 1024) },
          "/api/owner-enquiries/legacy"
        )
      ).status
    ).toBe(413);
    expect(fake.accept).not.toHaveBeenCalled();
  });
  it("rate-limits repeated requests across both intake routes", async () => {
    for (let i = 0; i < 15; i++) expect((await post({})).status).toBe(400);
    const limited = await post({}, "/api/owner-enquiries/legacy");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(fake.accept).not.toHaveBeenCalled();
  });
  it("retains the global cap even when client-IP hints change, with Retry-After before persistence", async () => {
    for (let i = 1; i <= 60; i++) {
      expect(
        (
          await post({}, "/api/owner-enquiries", {
            "CF-Connecting-IP": `192.0.2.${i}`,
          })
        ).status
      ).toBe(400);
    }
    const limited = await post({}, "/api/owner-enquiries", {
      "CF-Connecting-IP": "192.0.2.61",
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(fake.accept).not.toHaveBeenCalled();
  });
  it("health reveals only readiness and aggregate delivery attention; there is no record/file GET", async () => {
    const response = await fetch(`${origin}/api/owner-enquiries/health`);
    expect(await response.json()).toEqual({
      ready: true,
      schemaVersion: "owner-intake-v3",
      storageReady: true,
      emailConfigured: true,
      deliveryAttentionRequired: false,
    });
    fake.attention.mockResolvedValue(true);
    expect((await fetch(`${origin}/api/owner-enquiries/health`)).status).toBe(
      503
    );
    expect(
      (
        await fetch(
          `${origin}/api/owner-enquiries/${syntheticOwner().requestId}`
        )
      ).status
    ).toBe(404);
    expect((await fetch(`${origin}/api/owner-sales`)).status).toBe(404);
  });
});

function chunked(path: string, chunks: (Buffer | string)[]) {
  return new Promise<{
    status: number;
    headers: Record<string, unknown>;
    body: string;
  }>((resolve, reject) => {
    const req = httpRequest(
      `${origin}${path}`,
      { method: "POST", headers },
      response => {
        const data: Buffer[] = [];
        response.on("data", chunk => data.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode!,
            headers: response.headers,
            body: Buffer.concat(data).toString(),
          })
        );
      }
    );
    req.on("error", reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

describe("bounded owner admission with real local streams", () => {
  it("charges actual chunked JSON bytes instead of21MiB for each small request", async () => {
    const payload = JSON.stringify(syntheticOwner());
    for (let i = 0; i < 12; i++) {
      const response = await chunked("/api/owner-enquiries", [
        payload.slice(0, 30),
        payload.slice(30),
      ]);
      expect(response.status).toBe(201);
    }
    expect(fake.accept).toHaveBeenCalledTimes(12);
    expect(admission.snapshot().windows.v3.bytes).toBe(
      Buffer.byteLength(payload) * 12
    );
    expect(admission.snapshot().peak.media).toBe(0);
    expect(admission.snapshot().active).toEqual({ small: 0, media: 0 });
  });
  it("accepts only exact owned HTTPS origins", () => {
    for (const origin of [
      "https://www.portugalactive.com.evil.invalid",
      "http://www.portugalactive.com",
      "null",
    ])
      expect(ownerRequestOriginAllowed({ headers: { origin } })).toBe(false);
  });
  it("rejects excess media concurrency with429 before writes while small JSON still passes", async () => {
    const controller = createOwnerAdmission();
    const write = vi.fn();
    const commits: (() => void)[] = [];
    app.post(
      "/synthetic/file",
      controller.body("file"),
      ownerBodyHandler(async (_req, res) => {
        write();
        await new Promise<void>(resolve => commits.push(resolve));
        res.status(201).json({ success: true });
      })
    );
    app.post(
      "/synthetic/start",
      controller.body("start"),
      ownerBodyHandler((_req, res) => {
        res.status(201).json({ success: true });
      })
    );
    const unexpectedV3Write = vi.fn();
    app.post(
      "/synthetic/auto-v3",
      controller.body("v3"),
      ownerBodyHandler((_req, res) => {
        unexpectedV3Write();
        res.sendStatus(201);
      })
    );
    const body = Buffer.alloc(128 * 1024);
    const first = fetch(`${origin}/synthetic/file`, { method: "POST", body });
    const second = fetch(`${origin}/synthetic/file`, { method: "POST", body });
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    const blocked = await fetch(`${origin}/synthetic/file`, {
      method: "POST",
      body,
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("5");
    expect((await post({}, "/synthetic/start")).status).toBe(201);
    const chunkedV3 = await chunked("/synthetic/auto-v3", [
      JSON.stringify({ padding: "x".repeat(300 * 1024) }),
    ]);
    expect(chunkedV3.status).toBe(429);
    expect(unexpectedV3Write).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(2);
    commits.forEach(commit => commit());
    expect((await first).status).toBe(201);
    expect((await second).status).toBe(201);
    await vi.waitFor(() =>
      expect(controller.snapshot().active).toEqual({ small: 0, media: 0 })
    );
  });
  it("rejects a chunked body when actual memory would exceed the pool, before its write handler", async () => {
    const controller = createOwnerAdmission({
      limits: { mediaMemoryBytes: 6 * 1024 },
    });
    const write = vi.fn();
    app.post(
      "/synthetic/file-budget",
      controller.body("file"),
      ownerBodyHandler((_req, res) => {
        write();
        res.sendStatus(201);
      })
    );
    const response = await chunked("/synthetic/file-budget", [
      Buffer.alloc(1024),
      Buffer.alloc(2 * 1024),
    ]);
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("5");
    expect(write).not.toHaveBeenCalled();
    expect(controller.snapshot().peak.mediaMemory).toBeLessThanOrEqual(
      6 * 1024
    );
    await vi.waitFor(() => expect(controller.snapshot().active.media).toBe(0));
  });
  it("enforces chunked route size and read deadlines without reaching persistence", async () => {
    const controller = createOwnerAdmission({
      policies: { start: { maxBytes: 20, timeoutMs: 30 } },
    });
    const write = vi.fn();
    app.post(
      "/synthetic/short",
      controller.body("start"),
      ownerBodyHandler((_req, res) => {
        write();
        res.sendStatus(201);
      })
    );
    expect(
      (await chunked("/synthetic/short", ["{", "x".repeat(30)])).status
    ).toBe(413);
    const timedOut = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        `${origin}/synthetic/short`,
        { method: "POST", headers },
        res => {
          res.resume();
          res.once("end", () => resolve(res.statusCode!));
        }
      );
      req.on("error", reject);
      req.write("{");
    });
    expect(timedOut).toBe(408);
    expect(write).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(controller.snapshot().active.small).toBe(0));
  });
  it("applies traffic limits to actual bytes and resets the window", async () => {
    let now = 0;
    const controller = createOwnerAdmission({
      now: () => now,
      policies: { start: { maxWindowBytes: 16 } },
    });
    const write = vi.fn();
    app.post(
      "/synthetic/window",
      controller.body("start"),
      ownerBodyHandler((_req, res) => {
        write();
        res.sendStatus(201);
      })
    );
    expect((await chunked("/synthetic/window", ['{"a":1}'])).status).toBe(201);
    expect((await chunked("/synthetic/window", ['{"a":2}'])).status).toBe(201);
    const blocked = await chunked("/synthetic/window", ['{"a":3}']);
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("600");
    expect(write).toHaveBeenCalledTimes(2);
    now = 600_000;
    expect((await chunked("/synthetic/window", ['{"a":4}'])).status).toBe(201);
    expect(write).toHaveBeenCalledTimes(3);
  });
  it("holds parsed-body admission while a disconnected request is still writing", async () => {
    const controller = createOwnerAdmission({ limits: { smallActive: 1 } });
    let commit!: () => void;
    const write = vi.fn();
    app.post(
      "/synthetic/disconnect",
      controller.body("start"),
      ownerBodyHandler(async (_req, res) => {
        write();
        await new Promise<void>(resolve => {
          commit = resolve;
        });
        res.sendStatus(201);
      })
    );
    const req = httpRequest(`${origin}/synthetic/disconnect`, {
      method: "POST",
      headers,
    });
    req.on("error", () => {});
    req.end("{}");
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    req.destroy();
    await new Promise(resolve => setTimeout(resolve, 25));
    expect(controller.snapshot().active.small).toBe(1);
    expect((await post({}, "/synthetic/disconnect")).status).toBe(429);
    expect(write).toHaveBeenCalledTimes(1);
    commit();
    await vi.waitFor(() => expect(controller.snapshot().active.small).toBe(0));
  });
  it("releases incomplete aborted bodies without accepting or persisting them", async () => {
    const controller = createOwnerAdmission({ limits: { smallActive: 1 } });
    const write = vi.fn();
    app.post(
      "/synthetic/abort",
      controller.body("start"),
      ownerBodyHandler((_req, res) => {
        write();
        res.sendStatus(201);
      })
    );
    const req = httpRequest(`${origin}/synthetic/abort`, {
      method: "POST",
      headers,
    });
    req.on("error", () => {});
    req.write("{");
    await vi.waitFor(() => expect(controller.snapshot().active.small).toBe(1));
    req.destroy();
    await vi.waitFor(() => expect(controller.snapshot().active.small).toBe(0));
    expect(write).not.toHaveBeenCalled();
    expect((await post({}, "/synthetic/abort")).status).toBe(201);
  });
});
