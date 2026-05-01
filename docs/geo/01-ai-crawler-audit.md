# Task 1 — AI crawler audit & unblock

Status: **robots.txt updated in this commit. External infra checks pending (see below).**

## What we changed in-repo

`client/public/robots.txt`

- Added previously-missing AI crawlers: `OAI-SearchBot`, `Perplexity-User`, `ClaudeBot`, `GoogleOther`, `CCBot`, `FacebookBot`, `Meta-ExternalAgent`, `Applebot-Extended`, `Amazonbot`, `Diffbot`.
- Kept existing: `GPTBot`, `ChatGPT-User`, `PerplexityBot`, `Claude-Web`, `anthropic-ai`, `Google-Extended`, `Bytespider`.
- Fixed a silent bug: the old file had each AI bot in its own `User-agent:` block with only `Allow: /`. Per the robots.txt spec a bot only follows the **most specific** matching group, so those bots were technically being permitted on `/admin`, `/account`, `/login`, `/booking/confirmation/` and `/api/` because they skipped the `*` group's Disallow list. All AI bots now share one group that replicates the same Disallow set as `*`.

## What is NOT blocked by our server code

`server/_core/index.ts` ratelimit audit:

- `authLimiter` → `/api/auth/google`, `/api/auth/dev-login`
- `apiLimiter` → `/api/reservations`, `/api/trpc/booking`
- `leadLimiter` → `/api/trpc/leads.create`

None of these paths are crawled by bots — AI crawlers only hit public HTML routes (`/`, `/homes/*`, `/blog/*`, etc.). **No rate-limit change needed.**

`helmet` runs with CSP disabled; no user-agent filtering anywhere in the Express stack. No server-side bot blocks.

## External infra — MANUAL CHECKS NEEDED

These live outside the repo. Please verify in the respective dashboards:

### Render (hosting)

- [ ] Check **Render → Service → Settings → Firewall / IP Rules** for any IP-range blocks that could catch AI bot ranges. Default Render install has none — only act if a block exists.
- [ ] Check **Render → Logs** for `429`/`403` spikes from user-agents in this list:
  ```
  GPTBot OAI-SearchBot ChatGPT-User PerplexityBot Perplexity-User
  ClaudeBot Claude-Web anthropic-ai Google-Extended GoogleOther
  CCBot FacebookBot Meta-ExternalAgent Applebot-Extended Bytespider
  ```
  If you see rejects, file a root-cause before Task 2.

### Cloudflare (if in front of Render — check DNS)

If `portugalactive.com` is proxied through Cloudflare (orange-cloud DNS), verify:

- [ ] **Security → Bots → Super Bot Fight Mode**: set to **Allow verified bots** (not "Block all").
- [ ] **Security → WAF → Custom Rules**: no rule with `(cf.client.bot)` or `user agent contains "..."` blocking the bots above.
- [ ] **Security → WAF → Managed Rules → OWASP Core Rule Set**: OWASP can false-positive on simple UA strings — if there are rejects, lower the sensitivity to *Medium* and monitor.
- [ ] **Security → Rate Limiting Rules**: if `/` or `/homes/*` have aggressive limits (e.g. <60 req/min/IP), whitelist the verified-bot category or raise the ceiling.
- [ ] **Rules → Page Rules / Transform Rules**: no `User-Agent: *bot*` rewrite or block.
- [ ] **Cache → Configuration**: AI bots benefit from a warm HTML cache. Consider enabling "Cache Everything" for the apex domain with edge TTL of 1 h for HTML.

### DNS

- [ ] `www.portugalactive.com` and `portugalactive.com` both serve 200 OK to anonymous GET with header `User-Agent: GPTBot/1.0`. Quick test from local shell:
  ```bash
  curl -sI -A "GPTBot/1.0 (+https://openai.com/gptbot)" https://www.portugalactive.com/ | head -1
  curl -sI -A "PerplexityBot" https://www.portugalactive.com/ | head -1
  curl -sI -A "ClaudeBot" https://www.portugalactive.com/ | head -1
  ```
  Expected: `HTTP/2 200`. If any return `403`/`429`, the block is in Cloudflare or Render, not this repo.

## Verification checklist (after deploy)

- [ ] Visit `https://www.portugalactive.com/robots.txt` — it reflects the new file.
- [ ] **Google Search Console → Settings → Crawl stats**: `Google-Extended` appears in the per-agent breakdown (Google needs 24-72h to pick up robots.txt changes).
- [ ] **Bing Webmaster Tools → Site Explorer**: no "Blocked by robots.txt" messages for content URLs.
- [ ] **robots.txt tester** (https://technicalseo.com/tools/robots-txt/): paste the live file, test `User-Agent: GPTBot` against `https://www.portugalactive.com/homes/some-villa` → should resolve to **Allowed**.
- [ ] Curl spot-checks above all return 200.

## Why this matters

LLM citation traffic compounds like SEO did 10 years ago. Blocking GPTBot means Portugal Active is absent from ChatGPT's answer when a user asks "best villa rentals in northern Portugal". Our competitors who allow these bots get cited; we don't. Unblocking is free and reversible — the only real risk is traffic load, which Render + Cloudflare absorb without effort at our current volumes.

## Env vars added this task

None.
