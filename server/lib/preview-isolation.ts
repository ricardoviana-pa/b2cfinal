import type { RequestHandler } from "express";
import { isLiveSiteHostname } from "@shared/deployment";

export function isPreviewDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.APP_ENV === "preview") return true;
  if (env.RENDER_SERVICE_ID && env.RENDER_SERVICE_ID !== "srv-d700n5fgi27c73f9bse0") return true;
  if (env.RENDER_GIT_BRANCH && env.RENDER_GIT_BRANCH !== "main") return true;
  if (env.NODE_ENV === "development") return true;
  const site = env.SITE_URL || env.PUBLIC_BASE_URL || env.PUBLIC_URL || env.APP_URL;
  if (!site) return false;
  try { return !isLiveSiteHostname(new URL(site).hostname); }
  catch { return true; }
}

/** Visual previews have no operational connections. Dedicated sandbox support
 * must be implemented explicitly, never by copying production credentials. */
export const FORBIDDEN_PREVIEW_KEYS = [
  "DATABASE_URL", "GUESTY_CLIENT_ID", "GUESTY_CLIENT_SECRET", "GUESTY_BE_CLIENT_ID",
  "GUESTY_BE_CLIENT_SECRET", "GUESTY_WEBHOOK_SECRET", "GUESTY_DEBUG_SECRET",
  "RESEND_API_KEY", "ACTIVECAMPAIGN_API_KEY", "ACTIVECAMPAIGN_API_URL",
  "BOKUN_ACCESS_KEY", "BOKUN_SECRET_KEY", "BOKUN_VENDOR_ID", "VITE_BOKUN_CHANNEL_UUID",
  "TRIPWIX_API_KEY", "GITHUB_PAT", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_ACCOUNT_ID",
  "STRIPE_CARD_WEBHOOK_SECRET", "STRIPE_KLARNA_WEBHOOK_SECRET", "STRIPE_PAYPAL_WEBHOOK_SECRET",
  "RECOVERY_OPTOUT_SECRET", "NEWSLETTER_TOKEN_SECRET", "BREVO_API_KEY",
  "CLOUDFLARE_API_TOKEN", "PRERENDER_TOKEN",
  "BUILT_IN_FORGE_API_KEY", "OAUTH_SERVER_URL", "ADMIN_API_KEY", "ADMIN_PASSWORD",
] as const;

export function assertPreviewIsolation(env: NodeJS.ProcessEnv = process.env): void {
  if (!isPreviewDeployment(env)) return;
  const present: string[] = FORBIDDEN_PREVIEW_KEYS.filter(key => !!env[key]);
  if (env.CHECKOUT_RECOVERY === "true") present.push("CHECKOUT_RECOVERY");
  if (present.length) throw new Error(`[Preview isolation] Refusing operational configuration: ${present.join(", ")}`);
}

/** Runs before body parsing: never process inbound reservations, leads or webhooks in DEV. */
export const blockPreviewWrites: RequestHandler = (req, res, next) => {
  if (!isPreviewDeployment() || ["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  res.setHeader("Cache-Control", "no-store");
  return res.status(503).json({ code: "PREVIEW_READ_ONLY", message: "Preview only. Real bookings, payments and messages are disabled." });
};

export const PREVIEW_CSP = {
  useDefaults: false,
  directives: {
    "default-src": ["'self'"],
    "img-src": ["'self'", "https:", "data:", "blob:"],
    "style-src": ["'self'", "'unsafe-inline'", "https:"],
    "font-src": ["'self'", "https:", "data:"],
    "media-src": ["'self'", "https:", "blob:"],
    "script-src": ["'self'", "'unsafe-inline'"],
    "connect-src": ["'self'"],
    "frame-src": ["'none'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  },
};
