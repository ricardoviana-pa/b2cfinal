import type { Express, Request, RequestHandler } from "express";
import { ownerBodyHandler, parseOwnerBody } from "../lib/owner-admission";
import { verifySignedHeaders, verifyBodyDigest, InboundProtocolError } from "../services/owner-email-photos/protocol";
import { acceptOwnerEmail, putOwnerEmailFile, completeOwnerEmail, emailPhotosEnabled, recordOwnerEmailPoll, ownerEmailHealth, OwnerEmailError } from "../services/owner-email-photos/store";
import { kickV4 } from "../services/owner-intake-v4/service";
import { sweepOwnerCrm } from "../services/owner-crm/service";

const BASE = "/api/internal/owner-email-photos";
const digestId = /^[a-f0-9]{64}$/;
const guard: RequestHandler = (req, res, next) => {
  if (!emailPhotosEnabled()) return res.status(503).json({ success: false, code: "EMAIL_IMPORT_DISABLED" });
  const secret = process.env.OWNER_EMAIL_INGEST_SECRET || "";
  if (!digestId.test(secret)) return res.status(503).json({ success: false, code: "EMAIL_IMPORT_UNCONFIGURED" });
  if (req.headers.origin || req.headers["sec-fetch-site"] || req.originalUrl !== req.path)
    return res.status(403).json({ success: false, code: "INTERNAL_REQUEST_REQUIRED" });
  // Authenticate the declared digest before admitting or reading attachment bytes.
  try {
    verifySignedHeaders(secret, { timestamp: String(req.headers["x-pa-timestamp"] || ""),
      contentSha256: String(req.headers["x-pa-content-sha256"] || ""), signature: String(req.headers["x-pa-signature"] || "") }, req.method, req.path);
  } catch { return res.status(401).json({ success: false, code: "INVALID_SIGNATURE" }); }
  next();
};
const contentType = (type: string): RequestHandler => (req, res, next) => req.is(type) ? next() : res.status(415).json({ success: false, code: "CONTENT_TYPE_REQUIRED" });
const authenticatedBody: RequestHandler = (req, _res, next) => {
  try { verifyBodyDigest(req.body, String(req.headers["x-pa-content-sha256"])); next(); } catch (error) { next(error); }
};
function jsonBody(req: Request) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(req.body)); }
  catch { throw new OwnerEmailError("INVALID_JSON", 400); }
}
function emptyBody(req: Request) {
  const value = jsonBody(req);
  if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).length)
    throw new OwnerEmailError("EMPTY_OBJECT_REQUIRED", 400);
}
const validIds: RequestHandler = (req, res, next) => Object.values(req.params).every(value => digestId.test(String(value))) ? next() : res.status(400).json({ success: false, code: "INVALID_IDENTIFIER" });
const kick = () => {
  kickV4();
  setImmediate(() => { void sweepOwnerCrm().catch(() => console.warn("[Owner email photos] CRM retry retained")); });
};
export function registerOwnerEmailPhotoRoutes(app: Express) {
  app.use(BASE, (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0"); res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("X-Content-Type-Options", "nosniff"); next();
  });
  app.get(`${BASE}/health`, ownerBodyHandler(async (_req, res) => {
    const health = await ownerEmailHealth(); res.status(health.enabled && health.attentionRequired ? 503 : 200).json(health);
  }));
  const metadata = [guard, contentType("application/json"), parseOwnerBody("email_metadata"), authenticatedBody];
  app.post(`${BASE}/messages`, ...metadata, ownerBodyHandler(async (req, res) => {
    const result = await acceptOwnerEmail(jsonBody(req)); res.json(result); if (result.state === "review") kickV4();
  }));
  app.put(`${BASE}/messages/:messageKey/files/:attachmentId`, guard, validIds, contentType("application/octet-stream"), parseOwnerBody("email_file"), authenticatedBody,
    ownerBodyHandler(async (req, res) => {
      const result = await putOwnerEmailFile(String(req.params.messageKey), String(req.params.attachmentId), req.body);
      res.json(result); if (result.state === "review") kickV4();
    }));
  app.post(`${BASE}/messages/:messageKey/complete`, validIds, ...metadata, ownerBodyHandler(async (req, res) => {
    emptyBody(req); const result = await completeOwnerEmail(String(req.params.messageKey)); res.json(result); kick();
  }));
  app.post(`${BASE}/poll`, ...metadata, ownerBodyHandler(async (req, res) => {
    emptyBody(req); await recordOwnerEmailPoll(); res.json({ success: true });
  }));
  app.use(BASE, (_req, res) => res.status(404).json({ success: false, code: "NOT_FOUND" }));
  app.use(BASE, (error: unknown, req: Request, res: import("express").Response, _next: import("express").NextFunction) => {
    // Body admission must be released even if authentication of the raw body fails.
    const respond = ownerBodyHandler((_req, response) => {
      if (error instanceof InboundProtocolError) return response.status(401).json({ success: false, code: "INVALID_BODY_SIGNATURE" });
      if (error instanceof OwnerEmailError) return response.status(error.status).json({ success: false, code: error.code });
      console.warn("[Owner email photos] operation unavailable; message retained for retry");
      return response.status(503).json({ success: false, code: "EMAIL_IMPORT_UNAVAILABLE" });
    });
    respond(req, res, _next);
  });
}
