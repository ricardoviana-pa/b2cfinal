import type { RequestHandler } from "express";
import { CHECKOUT_EMAIL_ORIGIN } from "../lib/checkout-email";

const RECOVERY_PATH = /^\/(?:en|pt|es|fr|de|it|nl|sv|fi)\/checkout\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\/?$/i;

/** Repair recovery emails already sent from DEV, without touching normal DEV checkouts. */
export const redirectLegacyRecoveryEmail: RequestHandler = (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.hostname.toLowerCase() !== "dev.portugalactive.com") return next();
  // Previously sent opt-out URLs must still validate against production's
  // signing key after DEV gets its own independent session secret.
  const legacyOptout = req.path === "/api/checkout/recovery-optout" &&
    /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(req.query.intent)) &&
    /^[a-f0-9]{32}$/i.test(String(req.query.t));
  if (!legacyOptout && !RECOVERY_PATH.test(req.path)) return next();
  if (!legacyOptout && (
    req.query.utm_source !== "email" ||
    req.query.utm_medium !== "recovery" ||
    !["checkout_recovery_1h", "checkout_recovery_20h"].includes(String(req.query.utm_campaign))
  )) return next();

  // Temporary and uncached: the URL contains a private booking capability.
  // The destination is fixed, never supplied by a query parameter or Host.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  return res.redirect(302, `${CHECKOUT_EMAIL_ORIGIN}${req.originalUrl}`);
};
