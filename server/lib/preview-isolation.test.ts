import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPreviewIsolation, FORBIDDEN_PREVIEW_KEYS, isPreviewDeployment, blockPreviewWrites, PREVIEW_CSP } from "./preview-isolation";
import { publicProcedure, router } from "../_core/trpc";

const preview = { APP_ENV: "preview", SITE_URL: "https://dev.portugalactive.com", NODE_ENV: "production" };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("preview deployment boundary", () => {
  it("detects previews independently of the Node production build mode", () => {
    expect(isPreviewDeployment(preview)).toBe(true);
    expect(isPreviewDeployment({ RENDER_GIT_BRANCH: "dev", SITE_URL: "https://www.portugalactive.com" })).toBe(true);
    expect(isPreviewDeployment({ RENDER_SERVICE_ID: "srv-d7b7d7qdbo4c73b1st8g" })).toBe(true);
    expect(isPreviewDeployment({ SITE_URL: "https://preview.onrender.com" })).toBe(true);
    expect(isPreviewDeployment({ SITE_URL: "invalid" })).toBe(true);
    expect(isPreviewDeployment({ RENDER_GIT_BRANCH: "main", NODE_ENV: "production", SITE_URL: "https://www.portugalactive.com" })).toBe(false);
  });
  it.each(FORBIDDEN_PREVIEW_KEYS)("refuses %s without disclosing its value", key => {
    const run = () => assertPreviewIsolation({ ...preview, [key]: "sensitive-value-never-log" });
    expect(run).toThrow(key);
    try { run(); } catch (e) { expect(String(e)).not.toContain("sensitive-value-never-log"); }
  });
  it("permits an isolated visual preview, and preserves production configuration", () => {
    expect(() => assertPreviewIsolation({ ...preview, JWT_SECRET: "preview-only", CHECKOUT_RECOVERY: "false" })).not.toThrow();
    expect(() => assertPreviewIsolation({ SITE_URL: "https://www.portugalactive.com", DATABASE_URL: "production-db", NODE_ENV: "production", RENDER_GIT_BRANCH: "main" })).not.toThrow();
    expect(() => assertPreviewIsolation({ ...preview, CHECKOUT_RECOVERY: "true" })).toThrow("CHECKOUT_RECOVERY");
  });
  it("blocks webhook/REST writes before a handler can run", () => {
    vi.stubEnv("APP_ENV", "preview");
    const next = vi.fn(); const res: any = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    blockPreviewWrites({ method: "POST" } as any, res, next);
    expect(res.status).toHaveBeenCalledWith(503); expect(next).not.toHaveBeenCalled();
    blockPreviewWrites({ method: "GET" } as any, res, next); expect(next).toHaveBeenCalledOnce();
  });
  it("also blocks mutations invoked directly through a tRPC caller", async () => {
    vi.stubEnv("APP_ENV", "preview");
    const write = vi.fn(() => "written");
    const api = router({ write: publicProcedure.mutation(write), read: publicProcedure.query(() => "public catalogue") });
    const caller = api.createCaller({} as any);
    await expect(caller.write()).rejects.toThrow("Preview is read-only");
    expect(write).not.toHaveBeenCalled();
    await expect(caller.read()).resolves.toBe("public catalogue");
  });
  it("never opens a database connection in preview even if configuration is changed after boot", async () => {
    vi.stubEnv("APP_ENV", "preview"); vi.stubEnv("DATABASE_URL", "mysql://do-not-connect.invalid/production");
    const { getDb } = await import("../db");
    await expect(getDb()).resolves.toBeNull();
  });
  it("never reads cached Guesty credentials or calls Guesty from preview", async () => {
    vi.stubEnv("APP_ENV", "preview");
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    const { guestyClient, guestyBEClient } = await import("./guesty");
    await expect(guestyClient.request("GET", "/v1/listings")).rejects.toThrow("Guesty is disabled in previews");
    await expect(guestyBEClient.request("GET", "/listings")).rejects.toThrow("Guesty is disabled in previews");
    expect(network).not.toHaveBeenCalled();
  });
  it("blocks operational browser connections and third-party payment frames", () => {
    expect(PREVIEW_CSP.directives["connect-src"]).toEqual(["'self'"]);
    expect(PREVIEW_CSP.directives["frame-src"]).toEqual(["'none'"]);
    expect(PREVIEW_CSP.directives["form-action"]).toEqual(["'self'"]);
  });
});
