import type { Express, Request, Response } from "express";
import * as db from "../db";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./env";

/**
 * Dev / password login when OAuth is not configured.
 * Set ADMIN_PASSWORD in .env to enable.
 */
export function registerDevAuthRoutes(app: Express) {
  app.post("/api/auth/dev-login", async (req: Request, res: Response) => {
    if (ENV.oAuthServerUrl) {
      res.status(400).json({ error: "OAuth is configured; use OAuth login" });
      return;
    }

    if (!ENV.adminPassword) {
      res.status(500).json({
        error: "ADMIN_PASSWORD not set. Add ADMIN_PASSWORD=your_password to .env",
      });
      return;
    }

    const password = req.body?.password;
    if (password !== ENV.adminPassword) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    const dbInstance = await db.getDb();
    if (!dbInstance) {
      res.status(500).json({
        error: "Database not configured. Set DATABASE_URL in .env for admin access.",
      });
      return;
    }

    try {
      await db.upsertUser({
        openId: ENV.devAdminOpenId,
        name: "Admin",
        email: "admin@localhost",
        loginMethod: "password",
        role: "admin",
      });

      const sessionToken = await sdk.createSessionToken(ENV.devAdminOpenId, {
        name: "Admin",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      const returnPath = req.body?.returnPath || "/admin";
      const safePath = returnPath.startsWith("/") ? returnPath : "/admin";
      res.json({ success: true, redirect: safePath });
    } catch (err) {
      console.error("[DevAuth] Login failed:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });
}
