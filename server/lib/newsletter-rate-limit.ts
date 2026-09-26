/**
 * Rate limit for newsletter.subscribe that a tRPC batch cannot dodge.
 *
 * app.use("/api/trpc/newsletter.subscribe", limiter) only sees a request whose
 * path is exactly that procedure. The client uses httpBatchLink, and anyone
 * can POST /api/trpc/newsletter.subscribe,newsletter.subscribe?batch=1: the
 * path no longer matches and dozens of subscriptions ride in one request.
 *
 * Mounted on /api/trpc, this middleware reads the procedure list in the path
 * (comma-separated, as tRPC batches it), refuses a request that names
 * newsletter.subscribe more than once, and runs the limiter on any request
 * that names it once, batched with other procedures or not.
 */
import type { RequestHandler } from "express";

export const NEWSLETTER_SUBSCRIBE_PROCEDURE = "newsletter.subscribe";

/** Procedures named by a tRPC path ("/a.b,c.d" → ["a.b", "c.d"]). */
export function trpcProcedures(path: string): string[] {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    /* keep the raw path */
  }
  return decoded
    .replace(/^\/+/, "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function countSubscribeCalls(path: string): number {
  return trpcProcedures(path).filter((p) => p === NEWSLETTER_SUBSCRIBE_PROCEDURE).length;
}

export function newsletterSubscribeGuard(limiter: RequestHandler): RequestHandler {
  return (req, res, next) => {
    const count = countSubscribeCalls(req.path || "");
    if (count === 0) return next();
    if (count > 1) {
      res.status(400).json({ error: "One newsletter subscription per request." });
      return;
    }
    return limiter(req, res, next);
  };
}
