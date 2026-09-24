/**
 * POST /api/vitals — field Core Web Vitals from client/src/lib/vitals.ts.
 *
 * The body is a small JSON array sent by navigator.sendBeacon when the page is
 * hidden. Every field is checked and clamped here: this endpoint is public and
 * unauthenticated, so nothing from the body reaches the database unless it
 * has the expected shape. Always answers 204, so a bad row never produces a
 * console error in the visitor's browser.
 */
import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";

const METRICS = new Set(["LCP", "INP", "CLS", "FCP", "TTFB"]);
const RATINGS = new Set(["good", "needs-improvement", "poor"]);
const DEVICES = new Set(["mobile", "desktop"]);
const MAX_ROWS = 10;

export interface VitalRow {
  metric: string;
  value: number;
  rating: string;
  page: string;
  lang: string;
  device: string;
  conn: string | null;
  target: string | null;
  detail: string | null;
}

const str = (v: unknown, n: number): string | null =>
  typeof v === "string" && v.length > 0 ? v.slice(0, n) : null;
const num = (v: unknown, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined;

/** Validate one beacon row; null when it isn't a well-formed measurement. */
export function parseVitalRow(raw: unknown): VitalRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const metric = typeof r.m === "string" && METRICS.has(r.m) ? r.m : null;
  const value = num(r.v, metric === "CLS" ? 50 : 120_000);
  const rating = typeof r.r === "string" && RATINGS.has(r.r) ? r.r : null;
  const page = typeof r.p === "string" && /^\/[\w\-/:.]{0,79}$/.test(r.p) ? r.p : null;
  const device = typeof r.d === "string" && DEVICES.has(r.d) ? r.d : null;
  if (!metric || value === undefined || !rating || !page || !device) return null;
  const lang = typeof r.l === "string" && /^[a-z]{0,2}$/.test(r.l) ? r.l : "";

  // Attribution: timings in ms plus a couple of short labels.
  const detail: Record<string, number | string> = {};
  for (const k of ["ttfb", "rld", "rlt", "erd", "id", "pd", "pr", "sd"]) {
    const n = num(r[k], 120_000);
    if (n !== undefined) detail[k] = Math.round(n);
  }
  for (const [k, n] of [["y", 10], ["ls", 20], ["ss", 120], ["si", 80]] as const) {
    const s = str(r[k], n);
    if (s) detail[k] = s;
  }
  return {
    metric, value, rating, page, lang, device,
    conn: str(r.c, 8),
    target: str(r.t, 200),
    detail: Object.keys(detail).length ? JSON.stringify(detail) : null,
  };
}

export function registerVitalsRoute(app: Express) {
  const limiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: false, legacyHeaders: false });
  app.post("/api/vitals", limiter, async (req: Request, res: Response) => {
    res.status(204).end();
    const body = Array.isArray(req.body) ? req.body.slice(0, MAX_ROWS) : [];
    const rows = body.map(parseVitalRow).filter((r): r is VitalRow => r !== null);
    if (!rows.length) return;
    try {
      const { insertWebVitals } = await import("../db");
      await insertWebVitals(rows);
    } catch (err) {
      console.warn("[vitals] insert failed:", (err as Error).message);
    }
  });
}
