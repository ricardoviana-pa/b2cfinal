/**
 * Rate limit for the newsletter mutations that a tRPC batch cannot dodge.
 *
 * app.use("/api/trpc/newsletter.subscribe", limiter) only sees a request
 * whose path is exactly that procedure. The client uses httpBatchLink, and
 * anyone can POST /api/trpc/newsletter.subscribe,newsletter.subscribe?batch=1:
 * the path no longer matches and dozens of sign-ups ride in one request.
 *
 * Mounted on /api/trpc, this middleware reads the procedure list in the path
 * (comma-separated, as tRPC batches it), refuses a request that names one of
 * these procedures more than once, and runs the limiter on any request that
 * names them, batched with other procedures or not.
 */
import type { RequestHandler } from "express";

export const LIMITED_NEWSLETTER_PROCEDURES = ["newsletter.subscribe", "newsletter.interest"] as const;

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

/** How many times the busiest limited procedure appears in the path. */
export function countLimitedCalls(path: string): number {
  const procedures = trpcProcedures(path);
  return Math.max(0, ...LIMITED_NEWSLETTER_PROCEDURES.map((name) => procedures.filter((p) => p === name).length));
}

export function newsletterRateGuard(limiter: RequestHandler): RequestHandler {
  return (req, res, next) => {
    const count = countLimitedCalls(req.path || "");
    if (count === 0) return next();
    if (count > 1) {
      res.status(400).json({ error: "One newsletter request per call." });
      return;
    }
    return limiter(req, res, next);
  };
}
