import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import crypto from "crypto";
import axios from "axios";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

const pendingStates = new Map<string, { returnPath: string; expires: number }>();

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return { clientId, clientSecret, isConfigured: !!clientId && !!clientSecret };
}

function getRedirectUri(req: Request) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}/api/auth/google/callback`;
}

export function registerGoogleAuthRoutes(app: Express) {
  app.get("/api/auth/google", (req: Request, res: Response) => {
    const { clientId, isConfigured } = getGoogleConfig();
    if (!isConfigured) {
      res.status(503).json({ error: "Google OAuth not configured" });
      return;
    }

    const redirectUri = getRedirectUri(req);
    const returnPath = (req.query.returnTo as string) || "/account";
    const state = crypto.randomBytes(32).toString("hex");
    pendingStates.set(state, { returnPath, expires: Date.now() + 10 * 60 * 1000 });

    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
      state,
    });

    res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const { clientId, clientSecret, isConfigured } = getGoogleConfig();
    if (!isConfigured) {
      res.status(503).json({ error: "Google OAuth not configured" });
      return;
    }

    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    if (error) {
      console.warn("[GoogleAuth] User denied access:", error);
      res.redirect("/login?error=denied");
      return;
    }

    if (!code) {
      res.status(400).json({ error: "Authorization code missing" });
      return;
    }

    const stateData = pendingStates.get(state);
    if (!stateData || stateData.expires < Date.now()) {
      pendingStates.delete(state);
      res.redirect("/login?error=invalid_state");
      return;
    }
    pendingStates.delete(state);

    try {
      const redirectUri = getRedirectUri(req);

      const tokenRes = await axios.post(GOOGLE_TOKEN_URL, {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });

      const { access_token } = tokenRes.data;

      const userInfoRes = await axios.get(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      const { id: googleId, email, name, picture } = userInfoRes.data;
      const openId = `google_${googleId}`;

      await db.upsertUser({
        openId,
        name: name || null,
        email: email || null,
        loginMethod: "google",
        role: "user",
        lastSignedIn: new Date(),
      });

      await db.upsertCustomerProfile({
        openId,
        googleId,
        avatar: picture || null,
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name: name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      const returnPath = stateData.returnPath || "/account";
      const safePath = returnPath.startsWith("/") ? returnPath : "/account";

      console.log(`[GoogleAuth] Login successful for ${email}, redirecting to: ${safePath}`);
      res.redirect(302, safePath);
    } catch (err) {
      console.error("[GoogleAuth] Callback failed:", err);
      res.redirect("/login?error=failed");
    }
  });

  app.get("/api/auth/google/status", (_req: Request, res: Response) => {
    const { isConfigured } = getGoogleConfig();
    res.json({ available: isConfigured });
  });
}
