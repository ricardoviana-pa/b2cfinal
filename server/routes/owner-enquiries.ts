import express, { type Express, type Request, type RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { isIP } from "node:net";
import { isOwnerIntakeProduction, ownerEmailConfigured } from "../services/owner-intake/email";
import { acceptOwnerIntake, sweepOwnerNotifications } from "../services/owner-intake/service";
import { ownerDeliveryAttentionRequired, ownerSchemaReady } from "../services/owner-intake/store";
import { OwnerIntakeError, validateLegacyOwnerIntake, validateOwnerIntake } from "../services/owner-intake/validation";

const allowedOrigins = new Set(["https://www.portugalactive.com", "https://portugalactive.com"]);
export function ownerRequestOriginAllowed(req: Pick<Request, "headers">) {
  const origin = req.headers.origin;
  return typeof origin === "string" && allowedOrigins.has(origin) && req.headers["sec-fetch-site"] !== "cross-site";
}

const privateHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
};
const allowedSubmission: RequestHandler = (req, res, next) => {
  if (!isOwnerIntakeProduction()) return res.status(503).json({ success: false, code: "PREVIEW_READ_ONLY" });
  if (!ownerRequestOriginAllowed(req)) return res.status(403).json({ success: false, code: "ORIGIN_NOT_ALLOWED" });
  if (!req.is("application/json")) return res.status(415).json({ success: false, code: "JSON_REQUIRED" });
  if (req.headers["content-encoding"] && req.headers["content-encoding"] !== "identity") return res.status(415).json({ success: false, code: "ENCODING_NOT_ALLOWED" });
  next();
};

/** Process-wide upload bound also applies when an origin client forges IP hints. */
export function ownerUploadBudget(now: () => number = Date.now): RequestHandler {
  let started = now();
  let reserved = 0;
  let largeUploads = 0;
  return (req, res, next) => {
    if (now() - started >= 10 * 60_000) { started = now(); reserved = 0; }
    const limit = req.path.endsWith("/legacy") ? 50 * 1024 : 21 * 1024 * 1024;
    const length = req.headers["content-length"];
    // Chunked requests reserve the route maximum before parsing any bytes.
    const bytes = typeof length === "string" && /^\d+$/.test(length) ? Number(length) : limit;
    if (!Number.isSafeInteger(bytes) || bytes > limit) return res.status(413).json({ success: false, code: "PAYLOAD_TOO_LARGE" });
    if (reserved + bytes > 180 * 1024 * 1024) {
      res.setHeader("Retry-After", Math.ceil((10 * 60_000 - (now() - started)) / 1000));
      return res.status(429).json({ success: false, code: "RATE_LIMITED" });
    }
    // Keep live parsed JSON/base64/decoded buffers bounded as well as traffic.
    if (bytes > 1024 * 1024) {
      if (largeUploads >= 2) {
        res.setHeader("Retry-After", "10");
        return res.status(429).json({ success: false, code: "RATE_LIMITED" });
      }
      largeUploads++;
      let released = false;
      const release = () => { if (!released) { released = true; largeUploads--; } };
      req.once("aborted", release); res.once("finish", release); res.once("close", release);
    }
    reserved += bytes;
    next();
  };
}

/** Call before the general 50 MB parser. No GET endpoint exposes owner records/files. */
export function registerOwnerEnquiryRoutes(app: Express) {
  app.use("/api/owner-enquiries", privateHeaders);
  app.get("/api/owner-enquiries/health", async (_req, res) => {
    const production = isOwnerIntakeProduction();
    const storageReady = production && await ownerSchemaReady();
    const emailConfigured = ownerEmailConfigured();
    let deliveryAttentionRequired = false;
    if (storageReady) {
      try { deliveryAttentionRequired = await ownerDeliveryAttentionRequired(); }
      catch { deliveryAttentionRequired = true; }
    }
    const ready = storageReady && emailConfigured;
    return res.status(ready && !deliveryAttentionRequired ? 200 : 503).json({
      ready, schemaVersion: "owner-intake-v3", storageReady, emailConfigured, deliveryAttentionRequired,
    });
  });
  const limiter = rateLimit({
    windowMs: 10 * 60_000, limit: 15, standardHeaders: "draft-7", legacyHeaders: false,
    // Include the Render-appended upstream hop. CF's client-IP hint separates
    // genuine visitors sharing an edge IP; it is not used as authentication.
    // The independent global limits below still apply if that hint is forged.
    keyGenerator: req => {
      const forwarded = req.headers["x-forwarded-for"];
      const lastHop = typeof forwarded === "string" ? forwarded.split(",").at(-1)?.trim() : undefined;
      const upstream = lastHop && isIP(lastHop) ? lastHop : req.socket.remoteAddress || "unknown";
      const hint = req.headers["cf-connecting-ip"];
      const visitor = typeof hint === "string" && isIP(hint) ? hint : upstream;
      return `${ipKeyGenerator(upstream)}:${ipKeyGenerator(visitor)}`;
    },
    message: { success: false, code: "RATE_LIMITED" },
  });
  const globalLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 60, keyGenerator: () => "owner-intake-global",
    standardHeaders: false, legacyHeaders: false, message: { success: false, code: "RATE_LIMITED" } });
  const uploadBudget = ownerUploadBudget();
  const submit = (legacy: boolean): RequestHandler => async (req, res) => {
    try {
      const validated = legacy ? validateLegacyOwnerIntake(req.body) : validateOwnerIntake(req.body);
      const result = await acceptOwnerIntake(validated);
      res.status(result.duplicate ? 200 : 201).json({ success: true, ...result });
      // Durable outbox was committed above. A restart here is recovered by the sweep.
      void sweepOwnerNotifications().catch(() => {
        console.warn("[Owner intake] immediate notification deferred to durable queue");
      });
    } catch (error) {
      if (error instanceof OwnerIntakeError) return res.status(error.status).json({ success: false, code: error.code, ...(error.fields.length ? { fields: error.fields } : {}) });
      console.warn("[Owner intake] persistence unavailable; submission not acknowledged");
      return res.status(503).json({ success: false, code: "INTAKE_UNAVAILABLE" });
    }
  };
  app.post("/api/owner-enquiries/legacy", allowedSubmission, limiter, globalLimiter, uploadBudget, express.json({ limit: "50kb", inflate: false }), submit(true));
  app.post("/api/owner-enquiries", allowedSubmission, limiter, globalLimiter, uploadBudget, express.json({ limit: "21mb", inflate: false }), submit(false));
  app.use("/api/owner-enquiries", (error: any, _req: Request, res: express.Response, next: express.NextFunction) => {
    if (error?.type === "entity.too.large") return res.status(413).json({ success: false, code: "PAYLOAD_TOO_LARGE" });
    if (error instanceof SyntaxError) return res.status(400).json({ success: false, code: "INVALID_JSON" });
    next(error);
  });
}
