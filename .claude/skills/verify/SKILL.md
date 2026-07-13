---
name: verify
description: How to run and drive this app locally to verify changes end-to-end.
---

# Verifying changes locally (Portugal Active)

Vite + React SPA (wouter routing, `/en/...` locale prefix) served by an Express dev server.

## Launch

```bash
npm run dev          # Express + vite middleware on http://localhost:3000
```

- There is **no local `.env`** (gitignored, only `.env.example`), so no DATABASE_URL: any flow that reads real DB records (real checkout intents, admin) fails locally.
- Gotcha (fixed once, watch for regressions): `vite.config.ts` exports a **function** of ConfigEnv; `server/_core/vite.ts` must resolve it before spreading into `createViteServer`, otherwise every module request 404s to the HTML fallback ("Failed to load url /src/main.tsx").

## Driving checkout without a DB

Use the demo intent — full checkout with mock data, no server round-trips, can't charge:

```
http://localhost:3000/en/checkout/demo
```

Flow: step "stay" → fill `input[type="email"]`, click Continue → step "customize" (extras + mandatory self check-in / hosted reception choice) → step "pay". `checkout.getExtras` is DB-free (static config), so the customize step is fully functional.

## Browser driving

Playwright is not a project dep. Install it in the session scratchpad (`npm i playwright`) and run headless Chromium (`npx playwright install chromium` if the cache is empty; no Chrome is installed on this machine). Buttons gated by required choices use `aria-disabled` (still clickable) — Playwright needs `click({ force: true })` for those.

Cookie banner: appears 2s after load when `localStorage['pa-cookies-consent']` is unset (fresh Playwright contexts always show it); it publishes its height as `--cookie-banner-h` on `<html>`.
