import type { Express, Request, RequestHandler } from "express";
import { ownerBodyHandler, parseOwnerBody } from "../lib/owner-admission";
import { isOwnerIntakeProduction } from "../services/owner-intake/email";
import { OutboundEventError, parseOutboundEvent, recordOutboundMessage } from "../services/owner-email-photos/outbound";
const PATH = "/api/webhooks/owner-email-events";
const guard: RequestHandler = (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!isOwnerIntakeProduction() || !process.env.OWNER_EMAIL_RESEND_WEBHOOK_SECRET)
    return res.status(503).json({ success: false, code: "WEBHOOK_UNCONFIGURED" });
  if (!req.is("application/json")) return res.status(415).json({ success: false, code: "JSON_REQUIRED" });
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(req.headers["svix-id"] || ""))
    || !/^\d{10,11}$/.test(String(req.headers["svix-timestamp"] || ""))
    || !/^v1,[A-Za-z0-9+/=]+(?: v1,[A-Za-z0-9+/=]+)*$/.test(String(req.headers["svix-signature"] || "")))
    return res.status(401).json({ success: false, code: "INVALID_WEBHOOK_SIGNATURE" });
  next();
};
export function registerOwnerEmailEventRoutes(app: Express) {
  app.post(PATH, guard, parseOwnerBody("email_event"), ownerBodyHandler(async (req, res) => {
    const event = parseOutboundEvent(req.body, { id: String(req.headers["svix-id"]), timestamp: String(req.headers["svix-timestamp"]),
      signature: String(req.headers["svix-signature"]) }, process.env.OWNER_EMAIL_RESEND_WEBHOOK_SECRET!);
    if (event) await recordOutboundMessage(event);
    res.json({ success: true });
  }));
  app.use(PATH, (_req, res) => res.status(404).json({ success: false, code: "NOT_FOUND" }));
  app.use(PATH, (error: unknown, _req: Request, res: import("express").Response, _next: import("express").NextFunction) => {
    if (error instanceof OutboundEventError) return res.status(error.status).json({ success: false, code: error.code });
    console.warn("[Owner email events] correlation not committed; provider retry required");
    return res.status(503).json({ success: false, code: "WEBHOOK_UNAVAILABLE" });
  });
}
