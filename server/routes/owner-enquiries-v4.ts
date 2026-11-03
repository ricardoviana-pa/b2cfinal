import type { Express, Request, RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { isIP } from "node:net";
import { isOwnerIntakeProduction, ownerEmailConfigured } from "../services/owner-intake/email";
import { ownerBodyHandler, parseOwnerBody } from "../lib/owner-admission";
import { authenticateV4, startV4, draftV4, mutateV4, addV4File, removeV4File, v4SchemaReady, v4AttentionRequired } from "../services/owner-intake-v4/store";
import { bearerToken, mutationSchema, OwnerIntakeError, parse, startSchema, uuid, validateFile } from "../services/owner-intake-v4/validation";
import { kickV4 } from "../services/owner-intake-v4/service";
import type { V4Record } from "../services/owner-intake-v4/types";
const BASE = "/api/owner-enquiries/v4";
type AuthRequest = Request & { ownerV4?: V4Record };
const owned = new Set(["https://www.portugalactive.com", "https://portugalactive.com"]);
const wrap = (handler: RequestHandler) => ownerBodyHandler(handler);
const guard: RequestHandler = (req, res, next) => {
  if (!isOwnerIntakeProduction()) return res.status(503).json({ success: false, code: "PREVIEW_READ_ONLY" });
  const origin = req.headers.origin;
  if (req.headers["sec-fetch-site"] === "cross-site" || (origin && !owned.has(origin)) || (req.method !== "GET" && !origin))
    return res.status(403).json({ success: false, code: "ORIGIN_NOT_ALLOWED" });
  if (req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity") return res.status(415).json({ success: false, code: "ENCODING_NOT_ALLOWED" });
  next();
};
const json: RequestHandler = (req, res, next) => req.is("application/json") ? next() : res.status(415).json({ success: false, code: "JSON_REQUIRED" });
function visitor(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  const hop = typeof forwarded === "string" ? forwarded.split(",").at(-1)?.trim() : undefined;
  const upstream = hop && isIP(hop) ? hop : req.socket.remoteAddress || "unknown";
  const cf = req.headers["cf-connecting-ip"];
  return `${ipKeyGenerator(upstream)}:${ipKeyGenerator(typeof cf === "string" && isIP(cf) ? cf : upstream)}`;
}
export function registerOwnerV4Routes(app: Express) {
  app.use(BASE, (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0"); res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "no-referrer"); next();
  });
  app.get(`${BASE}/health`, wrap(async (_req, res) => {
    const storageReady = await v4SchemaReady(); const emailConfigured = ownerEmailConfigured();
    let deliveryAttentionRequired = false;
    if (storageReady) { try { deliveryAttentionRequired = await v4AttentionRequired(); } catch { deliveryAttentionRequired = true; } }
    const ready = storageReady && emailConfigured;
    res.status(ready && !deliveryAttentionRequired ? 200 : 503).json({ ready, schemaVersion: "owner-intake-v4", storageReady, emailConfigured, deliveryAttentionRequired });
  }));
  const captureLimit = rateLimit({ windowMs: 10 * 60_000, limit: 15, keyGenerator: visitor, standardHeaders: "draft-7", legacyHeaders: false, message: { success: false, code: "RATE_LIMITED" } });
  const tokenLimit = rateLimit({ windowMs: 10 * 60_000, limit: 120, keyGenerator: req => (req as AuthRequest).ownerV4!.id,
    standardHeaders: "draft-7", legacyHeaders: false, message: { success: false, code: "RATE_LIMITED" } });
  const authenticationLimit = rateLimit({ windowMs: 10 * 60_000, limit: 180, keyGenerator: visitor, standardHeaders: "draft-7", legacyHeaders: false, message: { success: false, code: "RATE_LIMITED" } });
  // Invalid random bearer tokens must not create an unbounded DB queue, including
  // when a direct origin caller forges visitor-IP hints. Capture uses its own lane.
  const globalAuthenticationLimit = rateLimit({ windowMs: 10 * 60_000, limit: 1800, keyGenerator: () => "owner-v4-auth",
    standardHeaders: "draft-7", legacyHeaders: false, message: { success: false, code: "RATE_LIMITED" } });
  let activeAuthentication = 0;
  const auth: RequestHandler = (req: AuthRequest, res, next) => {
    let token: string;
    try { token = bearerToken(req.headers.authorization); } catch (error) { next(error); return; }
    if (activeAuthentication >= 8) { res.setHeader("Retry-After", "5"); res.status(429).json({ success: false, code: "RATE_LIMITED" }); return; }
    activeAuthentication++;
    void authenticateV4(token).then(record => { activeAuthentication--; req.ownerV4 = record; next(); }, error => { activeAuthentication--; next(error); });
  };
  const privateRequest = [guard, globalAuthenticationLimit, authenticationLimit, auth, tokenLimit];
  app.post(`${BASE}/start`, guard, captureLimit, json, parseOwnerBody("start"), wrap(async (req, res) => {
    const result = await startV4(parse(startSchema, req.body)); res.status(result.duplicate ? 200 : 201).json(result); kickV4();
  }));
  app.get(`${BASE}/draft`, ...privateRequest, wrap(async (req: AuthRequest, res) => { res.json(await draftV4(req.ownerV4!)); }));
  app.patch(`${BASE}/draft`, ...privateRequest, json, parseOwnerBody("draft"), wrap(async (req: AuthRequest, res) => {
    res.json(await mutateV4(req.ownerV4!, parse(mutationSchema, req.body), false));
  }));
  app.post(`${BASE}/complete`, ...privateRequest, json, parseOwnerBody("draft"), wrap(async (req: AuthRequest, res) => {
    const result = await mutateV4(req.ownerV4!, parse(mutationSchema, req.body), true); res.json(result); kickV4();
  }));
  app.put(`${BASE}/files/:fileId`, ...privateRequest,
    (req, res, next) => ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(String(req.headers["content-type"])) ? next() : res.status(415).json({ success: false, code: "FILE_TYPE_NOT_ALLOWED" }),
    parseOwnerBody("file"), wrap(async (req: AuthRequest, res) => {
      let name: string; try { name = decodeURIComponent(String(req.headers["x-file-name"] || "")); } catch { throw new OwnerIntakeError("VALIDATION_FAILED", 400, ["attachments"]); }
      const result = await addV4File(req.ownerV4!, validateFile(uuid(req.params.fileId), name, req.headers["content-type"], req.body));
      res.status(result.duplicate ? 200 : 201).json(result);
    }));
  app.delete(`${BASE}/files/:fileId`, ...privateRequest, wrap(async (req: AuthRequest, res) => {
    res.json(await removeV4File(req.ownerV4!, uuid(req.params.fileId)));
  }));
  // Never allow unknown routes or file GETs to fall through to HTML/SSR.
  app.use(BASE, (_req, res) => res.status(404).json({ success: false, code: "NOT_FOUND" }));
  app.use(BASE, (error: unknown, _req: Request, res: import("express").Response, _next: import("express").NextFunction) => {
    if (error instanceof OwnerIntakeError) return res.status(error.status).json({ success: false, code: error.code, ...(error.fields.length ? { fields: error.fields } : {}) });
    console.warn("[Owner intake v4] operation unavailable; no uncommitted success acknowledged");
    return res.status(503).json({ success: false, code: "INTAKE_UNAVAILABLE" });
  });
}
