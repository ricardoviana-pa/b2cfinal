import express from "express";
import rateLimit from "express-rate-limit";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countSubscribeCalls, newsletterSubscribeGuard, trpcProcedures } from "./newsletter-rate-limit";

describe("trpcProcedures", () => {
  it("reads single and batched tRPC paths, encoded or not", () => {
    expect(trpcProcedures("/newsletter.subscribe")).toEqual(["newsletter.subscribe"]);
    expect(trpcProcedures("/newsletter.config,newsletter.subscribe")).toEqual(["newsletter.config", "newsletter.subscribe"]);
    expect(countSubscribeCalls("/newsletter.subscribe%2Cnewsletter.subscribe")).toBe(2);
    expect(countSubscribeCalls("/leads.create")).toBe(0);
  });
});

describe("newsletterSubscribeGuard", () => {
  let server: Server;
  let origin: string;
  beforeAll(async () => {
    const app = express();
    const limiter = rateLimit({ windowMs: 60_000, max: 2, standardHeaders: true, legacyHeaders: false });
    app.use("/api/trpc", newsletterSubscribeGuard(limiter));
    app.use("/api/trpc", (_req, res) => { res.json({ ok: true }); });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const post = (path: string) => fetch(`${origin}/api/trpc${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

  it("refuses a batch that names the subscription more than once", async () => {
    const res = await post("/newsletter.subscribe,newsletter.subscribe?batch=1");
    expect(res.status).toBe(400);
  });
  it("counts a subscription inside a batch against the same limit as a single one", async () => {
    expect((await post("/newsletter.subscribe?batch=1")).status).toBe(200);
    expect((await post("/newsletter.config,newsletter.subscribe?batch=1")).status).toBe(200);
    expect((await post("/newsletter.subscribe")).status).toBe(429);
    // Other procedures are not limited by it.
    expect((await post("/newsletter.config")).status).toBe(200);
  });
});
