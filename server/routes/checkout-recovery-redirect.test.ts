import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redirectLegacyRecoveryEmail } from "./checkout-recovery-redirect";

const route = "/pt/checkout/12345678-1234-1234-1234-123456789abc";
const tracking = "?utm_source=email&utm_medium=recovery&utm_campaign=checkout_recovery_1h";
let server: Server;
let origin: string;
beforeAll(async () => {
  const app = express();
  app.set("trust proxy", true);
  app.use(redirectLegacyRecoveryEmail);
  app.use((_req, res) => { res.status(204).end(); });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
const request = (url: string, host = "dev.portugalactive.com", method = "GET") =>
  fetch(`${origin}${url}`, { method, redirect: "manual", headers: { "X-Forwarded-Host": host } });

describe("recovery links already sent by DEV", () => {
  it.each(["1h", "20h"])("sends the %s email to the same production checkout", async (stage) => {
    const url = route + tracking.replace("1h", stage);
    const response = await request(url);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`https://www.portugalactive.com${url}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("does not redirect production, normal DEV sessions, APIs or malformed links", async () => {
    for (const [url, host, method] of [
      [route + tracking, "www.portugalactive.com", "GET"],
      [route, "dev.portugalactive.com", "GET"],
      [route + tracking, "preview.onrender.com", "GET"],
      [route + tracking, "dev.portugalactive.com", "POST"],
      ["/api/trpc/checkout.getIntent" + tracking, "dev.portugalactive.com", "GET"],
      ["/pt/checkout/invalid" + tracking, "dev.portugalactive.com", "GET"],
      [route + tracking.replace("utm_medium=recovery", "utm_medium=other"), "dev.portugalactive.com", "GET"],
    ]) expect((await request(url, host, method)).status).toBe(204);
  });
  it("ignores query-provided redirect targets", async () => {
    const response = await request(route + tracking + "&redirect=https://evil.test");
    expect(new URL(response.headers.get("location")!).origin).toBe("https://www.portugalactive.com");
  });
});
