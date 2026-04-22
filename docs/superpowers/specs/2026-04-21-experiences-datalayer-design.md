# Experiences Data Layer — Design Spec

**Date:** 2026-04-21  
**Scope:** GTM/GA4 data layer tracking for `/experiences` listing and `/experiences/:slug` detail pages  
**Skill applied:** `datalayer-hotel`

---

## Context

The experiences section (Adventures listing + ExperienceDetail PDP) has no data layer tracking. All other funnel stages (properties, booking confirmation) are already instrumented. The Bókun widget handles external checkout — there is no in-app confirmation page, so `purchase` is not trackable.

---

## Item Shape

All events use this inline object, built from the experience record:

```js
{
  item_id: `EXP-${experience.slug}`,        // e.g. "EXP-horseback-riding"
  item_name: experience.name,
  item_category: experience.experienceCategory, // e.g. "adventure", "cultural", "water"
  price: experience.priceOta || 0,          // OTA reference price (not priceFrom)
  quantity: 1                               // per-person pricing, no nights concept
}
```

No `item_category2`, `item_category3`, or `item_variant` — kept minimal.

---

## Events

### 1. `view_item_list` — Adventures.tsx

- **Trigger:** Experience cards enter the viewport on the `/experiences` listing page
- **Pattern:** IntersectionObserver with 200ms flush timer (mirrors Homes.tsx)
- **List context:**
  ```js
  item_list_id: 'experiences_listing'
  item_list_name: 'Experiences'
  ```
- **Each item:** includes `index` (card position) in addition to base shape

### 2. `select_item` — Adventures.tsx

- **Trigger:** User clicks an experience card (existing `<Link>` onClick)
- **List context:** same `item_list_id` / `item_list_name` as above

### 3. `view_item` — ExperienceDetail.tsx

- **Trigger:** `useEffect` on mount, dependency `[experience.slug]`
- **Top-level fields:** `currency: 'EUR'`, `value: experience.priceOta || 0`

### 4. `begin_checkout` — ExperienceBookingCard.tsx + ExperienceMobileBookingBar.tsx

- **Trigger (desktop):** Click on "Check availability" button (opens Bókun widget)
- **Trigger (mobile):** Click on "Book now" in sticky bar (`setWidgetOpen(true)`)
- **Same item shape** in both; experience data passed as existing props
- **No `purchase` event** — Bókun checkout is external with no postMessage callback

---

## Files Changed

| File | Change |
|------|--------|
| `client/src/pages/Adventures.tsx` | Add `view_item_list` (IntersectionObserver) + `select_item` (card click) |
| `client/src/pages/ExperienceDetail.tsx` | Add `view_item` on mount |
| `client/src/components/experience/ExperienceBookingCard.tsx` | Add `begin_checkout` on CTA click |
| `client/src/components/experience/ExperienceMobileBookingBar.tsx` | Add `begin_checkout` on CTA click |

No new files. No changes to `datalayer.ts`. Inline pushes only (Option A).

---

## Rules Applied

- `pushEcommerce()` used for all events (clears previous ecommerce object before push)
- `pushDL()` not used (all events are ecommerce)
- Dates in ISO 8601 — not applicable for experiences (no check-in/check-out)
- No PII in any event
- `begin_checkout` fires before Bókun modal opens, not inside it
