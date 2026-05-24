# Route audit — 2026-05-23

Audit of production routing, sitemap, robots and redirect health after the
destinations hub-and-spoke commit (`e22ea7d`) and the SEO injection tests
(`dfae764`). Snapshot of production taken via `curl` from this session.

## Headline

- ✅ **Webflow legacy is gone from production.** Every legacy path that the
  May-18 Cowork technical audit flagged now redirects cleanly to the new
  stack with zero `website-files.com` references. The TASK E "clean up
  Webflow" stream of the original prompt is effectively moot.
- ✅ **`/locations/*` and `/news` 301s work** (with one narrow gap: see §4).
- ✅ **robots.txt is in good shape** — explicit AI-bot allow lists, sensible
  `Disallow` for legacy paths, sitemap declared.
- ⚠ **Two issues fixed in this commit** (see §2): `comingSoon` destinations
  were eligible for sitemap inclusion; `/locations/viana-do-castelo-portugal`
  was downgrading to the Minho region hub instead of the new Viana spoke.
- ⚠ **Two issues deferred** (see §3): `/news/<slug>` subpaths return 404;
  SSR_ENABLED is off in production so the crawlable body relies on the
  `#seo-content` fallback (which works, but masks the SSR pipeline).

---

## 1. What production currently serves (snapshot)

### Legacy paths

| Path | Final URL | Status | Notes |
|---|---|---|---|
| `/properties` | `/en/homes` | 200 | clean migration; no Webflow |
| `/services` | `/en/services` | 200 | clean |
| `/adventures` | `/en/experiences` | 200 | clean |
| `/about` | `/en/about` | 200 | clean |
| `/contact-us` | `/en/contact` | 200 | clean |
| `/locations` | `/en/destinations` | 200 | ✅ |
| `/locations/viana-do-castelo-portugal` | `/en/destinations/minho` | 200 | ⚠ → fix in §2 |
| `/locations/porto` | `/en/destinations` | 200 | loses specificity; could be `/en/destinations/porto` |
| `/news` | `/en/blog` | 200 | ✅ |
| `/news/welcoming-city` | 404 at `/en/news/welcoming-city` | 404 | ⚠ — see §3 |

### Sitemap (pre-commit)

5 destinations listed: `alentejo`, `algarve`, `lisbon`, `minho`, `porto`.
After the destinations commit deploys, sitemap.ts loads `destinations.json`
dynamically so the 4 new spokes (`viana-do-castelo`, `caminha`,
`esposende`, `douro`) will appear automatically — and `brazil` would too if
we didn't filter (fixed in §2).

### Robots

The robots.txt is **good**. Highlights:

- Explicit AI-bot allow list (GPTBot, ClaudeBot, PerplexityBot,
  OAI-SearchBot, Google-Extended, CCBot, Bytespider, Amazonbot, etc.)
  with the same disallows as `*`, ensuring they don't escape to /admin,
  /api, /login.
- Legacy disallows save crawl budget: `/properties/`, `/rooms/`,
  `/lodges/`, `/journal/`, `/category/`, `/tag/`, `/author/`,
  `/wp-admin/`, `/wp-login.php`.
- Sitemap declared.

The Cowork May-18 audit warned about `Disallow: /properties/` colliding
with a live `/properties` page on Webflow. That collision no longer
exists — `/properties` 301s to `/en/homes`, so the disallow is correctly
protecting a deprecated path rather than blocking live content.

---

## 2. Issues fixed in this commit

### 2.1 `comingSoon` / `draft` destinations were eligible for the sitemap

**Symptom:** `server/lib/sitemap.ts` iterated every entry in
`destinations.json` without filtering. With the May-2026 destinations
commit, Brazil is `comingSoon: true` + `status: "draft"` — would have
shipped into the live sitemap on next deploy.

**Fix:** added a `continue` for both `comingSoon` and `status === "draft"`
in the destination loop. Brazil stays excluded; the 4 new spokes flow
through.

### 2.2 Viana / Caminha / Esposende redirects landed on the wrong page

**Symptom:** `server/lib/redirects.ts` mapped
`viana-do-castelo-portugal → minho`, `caminha-portugal → minho`,
`esposende-portugal → minho`. All three correctly went to a real page
(the Minho region hub), but lost specificity — and after the spokes
land, the legacy URL should point to the spoke that matches the original
intent.

**Fix:** updated `LOCATION_REDIRECTS` so each of the three city-portugal
slugs redirects to its own spoke. The other 9 entries (Arcos, Barcelos,
Fafe, Guimarães, Moimenta-da-Beira, Ponte-de-Lima, Vila-Nova-de-Famalicão,
Porto, Algarve) still resolve to their parent region hub because no
city-level spoke exists for them — they are part of Fase 4 expansion in
the strategy doc.

---

## 3. Issues NOT fixed in this commit (deferred)

### 3.1 `/news/<slug>` subpaths return 404

`/news` itself 301s to `/en/blog`. But `/news/welcoming-city` resolves
to `/en/news/welcoming-city` and returns 404 — i.e. the locale router
appends `/en` but the redirect table for `/news/*` subpaths doesn't
exist. This needs a pattern redirect: `/news/(.+)` → `/blog/$1` (or per
the GSC 404 report, a curated slug-mapping table). Out of scope for the
destinations session; warrants its own debug round informed by the GSC
404 report Cowork already pulled.

### 3.2 SSR_ENABLED is off in production

The SSR phases 0–3 work shipped — but `SSR_ENABLED` is unset in
`.env.local` and presumably in the production environment. Production
serves the SPA shell + the `#seo-content` crawlable fallback (confirmed
via `curl -A Googlebot https://www.portugalactive.com/` — bytes: 380437,
root div empty, `#seo-content` block present, `<h1>` present). This is
not broken — crawlers do receive content — but it leaves the full SSR
pipeline dark. Worth a dedicated flip-and-watch session with Lighthouse
in hand.

### 3.3 `/locations/porto` loses specificity (200 → `/en/destinations`)

`/locations/porto` 301s to `/en/destinations` instead of
`/en/destinations/porto`. The redirect table has
`porto-portugal: "porto"` (correct) but `/locations/porto` is using a
different match path. Worth tracing in `server/lib/redirects.ts`
pattern matching; low priority because Porto is a region hub the visitor
will navigate to from the destinations index anyway.

---

## 4. Recommendations

| # | Action | Owner | Priority |
|---|---|---|---|
| 1 | Fix `/news/<slug>` 404s with pattern redirect + curated slug table | future session | high |
| 2 | Flip `SSR_ENABLED=true` in production with Lighthouse before/after | future session | medium |
| 3 | Trace `/locations/porto` losing the slug in the redirect dispatcher | future session | low |
| 4 | After Cowork deep-research content lands for Caminha/Esposende/Douro, audit their crawl coverage in GSC | follow-up | low |
| 5 | Once blog gets a `destinations: DestinationSlug[]` tag field, wire `TheJournal` in `<DestinationPage />` so section 4 stops self-suppressing | follow-up | medium |

---

*Audit timestamp: 2026-05-23. Generated as part of the destinations
hub-and-spoke implementation; cross-references the Cowork SEO Discovery
2026-05-18 deliverables in Drive.*
