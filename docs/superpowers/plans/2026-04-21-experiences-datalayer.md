# Experiences Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GA4 e-commerce data layer events (`view_item_list`, `select_item`, `view_item`, `begin_checkout`) to the `/experiences` listing and `/experiences/:slug` detail pages.

**Architecture:** Inline `pushEcommerce()` calls in four existing files — no new helpers, no new files. A module-level lookup map in Adventures.tsx (mirroring the existing `experienceRatings` pattern) provides `experienceCategory` and `priceOta` per slug from `experienceDetails.json`. Booking components receive three optional tracking props from ExperienceDetail.tsx.

**Tech Stack:** React, TypeScript, `pushEcommerce` from `client/src/lib/datalayer.ts`, IntersectionObserver Web API, Wouter `<Link>`.

---

## File Map

| File | Change |
|------|--------|
| `client/src/pages/Adventures.tsx` | Add `experienceData` lookup, IntersectionObserver refs + `view_item_list`, `select_item` on card click |
| `client/src/pages/ExperienceDetail.tsx` | Add `view_item` on mount; pass tracking props to booking components |
| `client/src/components/experience/ExperienceBookingCard.tsx` | Add optional tracking props; fire `begin_checkout` on mount (Bókun) or CTA click (WhatsApp) |
| `client/src/components/experience/ExperienceMobileBookingBar.tsx` | Add optional tracking props; fire `begin_checkout` on "Book now" click |

---

## Task 1: Adventures.tsx — `view_item_list` via IntersectionObserver

**Files:**
- Modify: `client/src/pages/Adventures.tsx`

### Background

Adventures.tsx already imports `experienceDetailsData` and builds `experienceRatings` from it at module level (lines 23–31). We mirror this pattern to build an `experienceData` lookup that provides `experienceCategory` and `priceOta` per slug — the two fields needed for GA4 items that are absent from `products.json`.

The IntersectionObserver pattern mirrors `Homes.tsx` exactly:
- Five refs hold observer state: `cardDataRef`, `slugToElementRef`, `elementToSlugRef`, `pendingItemsRef`, `flushTimerRef`, `observerRef`
- A `useEffect([filtered])` creates the observer, flushes pending impressions after 200ms batching
- Each card element registers itself via a `ref` callback on mount/unmount

- [ ] **Step 1: Add `pushEcommerce` import and `experienceData` module-level lookup**

In `client/src/pages/Adventures.tsx`, after the existing imports block (after line 17), add:

```typescript
import { pushEcommerce } from '@/lib/datalayer';
```

After the existing `experienceRatings` block (after line 31), add at module level:

```typescript
// Slug → { experienceCategory, priceOta } from experienceDetails.json
const experienceData: Record<string, { experienceCategory: string; priceOta: number }> = {};
((experienceDetailsData as any).experiences || []).forEach((exp: any) => {
  if (exp.slug) {
    experienceData[exp.slug] = {
      experienceCategory: exp.experienceCategory || '',
      priceOta: exp.priceOta || 0,
    };
  }
});
```

- [ ] **Step 2: Add `useRef` to the existing React import**

Change line 6 from:
```typescript
import { useState, useMemo, useEffect } from 'react';
```
to:
```typescript
import { useState, useMemo, useEffect, useRef } from 'react';
```

- [ ] **Step 3: Add observer refs inside the `Adventures()` component, after the `const filtered = ...` block (after line 117)**

```typescript
  // GA4 view_item_list refs — same pattern as Homes.tsx
  const cardDataRef = useRef<Map<string, { adventure: Product; index: number }>>(new Map());
  const slugToElementRef = useRef<Map<string, Element>>(new Map());
  const elementToSlugRef = useRef<Map<Element, string>>(new Map());
  const pendingItemsRef = useRef<Map<string, { adventure: Product; index: number }>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
```

- [ ] **Step 4: Add the IntersectionObserver `useEffect` immediately after the refs, before the `return` statement**

```typescript
  // GA4: view_item_list — fires only for adventure cards that enter the viewport
  useEffect(() => {
    observerRef.current?.disconnect();
    pendingItemsRef.current.clear();

    observerRef.current = new IntersectionObserver((entries) => {
      let hasNew = false;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const slug = elementToSlugRef.current.get(entry.target);
          if (slug) {
            const data = cardDataRef.current.get(slug);
            if (data) {
              pendingItemsRef.current.set(slug, data);
              hasNew = true;
            }
          }
        }
      }
      if (!hasNew) return;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        if (pendingItemsRef.current.size === 0) return;
        const items = Array.from(pendingItemsRef.current.values())
          .sort((a, b) => a.index - b.index)
          .map(({ adventure, index }) => {
            const expData = experienceData[adventure.slug];
            return {
              item_id: `EXP-${adventure.slug}`,
              item_name: adventure.name,
              item_category: expData?.experienceCategory || '',
              price: expData?.priceOta || adventure.priceFrom || 0,
              quantity: 1,
              index,
            };
          });
        pushEcommerce({
          event: 'view_item_list',
          ecommerce: {
            item_list_id: 'experiences_listing',
            item_list_name: 'Experiences',
            items,
          },
        });
        pendingItemsRef.current.clear();
      }, 200);
    }, { threshold: 0.5 });

    slugToElementRef.current.forEach((el) => observerRef.current!.observe(el));

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      pendingItemsRef.current.clear();
    };
  }, [filtered]);
```

- [ ] **Step 5: Wrap each card in a `ref`-tracked `<div>` — replace the current map in the adventures grid**

The current render (lines 166–229) maps `filtered` with a bare `<Link>`. Replace the entire `{filtered.map(...)}` block with:

```tsx
{filtered.map((adventure, index) => {
  const rating = experienceRatings[adventure.slug];
  return (
    <div
      key={adventure.id}
      ref={(el) => {
        if (el) {
          cardDataRef.current.set(adventure.slug, { adventure, index: index + 1 });
          elementToSlugRef.current.set(el, adventure.slug);
          slugToElementRef.current.set(adventure.slug, el);
          observerRef.current?.observe(el);
        } else {
          const existing = slugToElementRef.current.get(adventure.slug);
          if (existing) {
            observerRef.current?.unobserve(existing);
            elementToSlugRef.current.delete(existing);
            slugToElementRef.current.delete(adventure.slug);
          }
          cardDataRef.current.delete(adventure.slug);
        }
      }}
    >
      <Link
        href={`/experiences/${adventure.slug}`}
        className="group block"
      >
        <div className="relative overflow-hidden bg-[#E8E4DC]" style={{ aspectRatio: '4/5' }}>
          {adventure.image ? (
            <img src={adventure.image} alt={`${adventure.name} – guided experience in Portugal`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" loading="lazy" />
          ) : (
            <div className="w-full h-full placeholder-image" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          {adventure.destinations.length > 0 && (
            <span className="absolute top-4 left-4 max-w-[60%] text-[10px] tracking-[0.12em] uppercase text-white/90 font-medium leading-relaxed">
              {adventure.destinations.join(' · ')}
            </span>
          )}
          {(adventure as any).videoUrl && (
            <span className="absolute top-4 right-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-[10px] tracking-[0.08em] uppercase font-medium px-2.5 py-1.5">
              <Play className="w-3 h-3 fill-current" /> {t('adventures.videoLabel')}
            </span>
          )}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <h3 className="font-display text-[1.5rem] text-white leading-tight mb-1">
              {adventure.name}
            </h3>
            <p className="text-[13px] text-white/80 font-light line-clamp-2">{adventure.tagline}</p>
          </div>
        </div>

        {/* Card metadata row — price, duration, rating, free cancellation */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            {(adventure.priceFrom ?? 0) > 0 && (
              <p className="text-[13px] text-[#1A1A18] font-medium">
                {t('common.from')} {formatEurEditorial(adventure.priceFrom ?? 0)} <span className="text-[12px] text-[#9E9A90] font-light">{adventure.priceSuffix}</span>
              </p>
            )}
            {rating && (
              <span className="text-[12px] text-[#8B7355] italic" style={{ fontWeight: 400 }}>
                {rating.value.toFixed(1)}/5
                <span className="text-[#9E9A90] not-italic ml-1" style={{ fontWeight: 300 }}>({rating.count})</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {adventure.duration && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[#6B6860]" style={{ fontWeight: 300 }}>
                <Clock className="w-3 h-3 text-[#9E9A90]" />
                {adventure.duration}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] text-[#6B8E4E]" style={{ fontWeight: 300 }}>
              <Check className="w-3 h-3" />
              {t('adventures.freeCancellation')}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
})}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd "/Users/fabiofreitas/Documents/VIsual Studio Projects/b2cfinal-ricardoviana"
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors in `Adventures.tsx`.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/Adventures.tsx
git commit -m "feat(tracking): add view_item_list to experiences listing via IntersectionObserver"
```

---

## Task 2: Adventures.tsx — `select_item` on card click

**Files:**
- Modify: `client/src/pages/Adventures.tsx`

- [ ] **Step 1: Add `onClick` to the `<Link>` element inside the ref-tracked div (from Task 1)**

Update the `<Link>` opening tag (which currently reads `<Link href={...} className="group block">`) to:

```tsx
<Link
  href={`/experiences/${adventure.slug}`}
  className="group block"
  onClick={() => {
    const expData = experienceData[adventure.slug];
    pushEcommerce({
      event: 'select_item',
      ecommerce: {
        item_list_id: 'experiences_listing',
        item_list_name: 'Experiences',
        items: [{
          item_id: `EXP-${adventure.slug}`,
          item_name: adventure.name,
          item_category: expData?.experienceCategory || '',
          price: expData?.priceOta || adventure.priceFrom || 0,
          quantity: 1,
          index: index + 1,
        }],
      },
    });
  }}
>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/fabiofreitas/Documents/VIsual Studio Projects/b2cfinal-ricardoviana"
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server (`npm run dev`) and open `/experiences` in the browser. Open the browser console and run:

```javascript
window.dataLayer.filter(e => e.event === 'view_item_list' || e.event === 'select_item')
```

Expected after scrolling through the grid: at least one `view_item_list` entry with `item_list_id: 'experiences_listing'` and items with `item_id` values like `'EXP-horseback-riding'`. After clicking a card: one `select_item` entry.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Adventures.tsx
git commit -m "feat(tracking): add select_item to experiences listing card click"
```

---

## Task 3: ExperienceDetail.tsx — `view_item` on mount

**Files:**
- Modify: `client/src/pages/ExperienceDetail.tsx`

- [ ] **Step 1: Add `pushEcommerce` import**

In `client/src/pages/ExperienceDetail.tsx`, add to the existing imports block (after line 44, after the data imports):

```typescript
import { pushEcommerce } from '@/lib/datalayer';
```

- [ ] **Step 2: Add `view_item` useEffect after the JSON-LD useEffect**

The JSON-LD useEffect ends at line 301 (`}, [exp?.slug]);`). Add the following block immediately after it:

```typescript
  // GA4: view_item — fires once per experience slug
  useEffect(() => {
    if (!exp) return;
    pushEcommerce({
      event: 'view_item',
      ecommerce: {
        currency: 'EUR',
        value: exp.priceOta || 0,
        items: [{
          item_id: `EXP-${exp.slug}`,
          item_name: exp.name,
          item_category: exp.experienceCategory || '',
          price: exp.priceOta || 0,
          quantity: 1,
        }],
      },
    });
  }, [exp?.slug]);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/fabiofreitas/Documents/VIsual Studio Projects/b2cfinal-ricardoviana"
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Navigate to any experience detail page (e.g. `/experiences/horseback-riding`). In the browser console run:

```javascript
window.dataLayer.filter(e => e.event === 'view_item')
```

Expected: one entry with `ecommerce.items[0].item_id === 'EXP-horseback-riding'`, `price` equal to the experience's `priceOta` value, `item_category` set to the `experienceCategory`.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ExperienceDetail.tsx
git commit -m "feat(tracking): add view_item to experience detail page on mount"
```

---

## Task 4: ExperienceBookingCard.tsx — `begin_checkout` (desktop)

**Files:**
- Modify: `client/src/components/experience/ExperienceBookingCard.tsx`
- Modify: `client/src/pages/ExperienceDetail.tsx`

### Background

The booking card has two paths:
- **hasBokun = true**: The Bókun calendar widget is embedded inline from mount — no separate "Check availability" button exists. Fire `begin_checkout` via `useEffect` on mount.
- **hasBokun = false**: A "Check availability" `<a>` element is shown. Fire on its click.

Three tracking props are added as optional so the component remains usable in any context that doesn't need tracking.

- [ ] **Step 1: Add imports to ExperienceBookingCard.tsx**

Change line 8 from:
```typescript
import { useMemo } from 'react';
```
to:
```typescript
import { useMemo, useEffect } from 'react';
```

Add after the existing imports (after line 10):
```typescript
import { pushEcommerce } from '@/lib/datalayer';
```

- [ ] **Step 2: Add optional tracking props to the interface**

In `client/src/components/experience/ExperienceBookingCard.tsx`, update `ExperienceBookingCardProps` (lines 12–22) to add three optional fields at the end:

```typescript
interface ExperienceBookingCardProps {
  experienceName: string;
  priceFrom: number;
  priceLabel?: string;
  duration?: string;
  freeCancellationHours?: number;
  reserveNowPayLater?: boolean;
  whatsappMessage: string;
  maxGroupSize?: number;
  bokunActivityId?: number;
  // Tracking
  experienceSlug?: string;
  experienceCategory?: string;
  priceOta?: number;
}
```

- [ ] **Step 3: Destructure the new props in the component function signature**

Update the function signature (lines 27–37) to include the new props:

```typescript
export default function ExperienceBookingCard({
  experienceName,
  priceFrom,
  priceLabel,
  duration,
  freeCancellationHours = 24,
  reserveNowPayLater = true,
  whatsappMessage,
  maxGroupSize = 10,
  bokunActivityId,
  experienceSlug,
  experienceCategory,
  priceOta,
}: ExperienceBookingCardProps) {
```

- [ ] **Step 4: Add `begin_checkout` useEffect (hasBokun path) after the `hasBokun` const**

After `const hasBokun = !!bokunActivityId && !!BOKUN_CHANNEL_UUID;` (line 38), add:

```typescript
  useEffect(() => {
    if (!hasBokun || !experienceSlug) return;
    pushEcommerce({
      event: 'begin_checkout',
      ecommerce: {
        currency: 'EUR',
        value: priceOta || 0,
        items: [{
          item_id: `EXP-${experienceSlug}`,
          item_name: experienceName,
          item_category: experienceCategory || '',
          price: priceOta || 0,
          quantity: 1,
        }],
      },
    });
  }, [hasBokun, experienceSlug]);
```

- [ ] **Step 5: Add `begin_checkout` to the WhatsApp fallback CTA click**

In the `!hasBokun` branch (lines 77–98), the "Check availability" `<a>` element currently has no onClick. Add one:

```tsx
<a
  href={waHref}
  target="_blank"
  rel="noopener noreferrer"
  className="w-full flex items-center justify-center gap-2 bg-[#1A1A18] text-white text-[11px] tracking-[0.14em] font-medium uppercase py-4 hover:bg-black transition-colors mb-3"
  style={{ minHeight: '52px' }}
  onClick={() => {
    if (!experienceSlug) return;
    pushEcommerce({
      event: 'begin_checkout',
      ecommerce: {
        currency: 'EUR',
        value: priceOta || 0,
        items: [{
          item_id: `EXP-${experienceSlug}`,
          item_name: experienceName,
          item_category: experienceCategory || '',
          price: priceOta || 0,
          quantity: 1,
        }],
      },
    });
  }}
>
  Check availability
</a>
```

- [ ] **Step 6: Pass tracking props from ExperienceDetail.tsx**

In `client/src/pages/ExperienceDetail.tsx`, update the `<ExperienceBookingCard>` usage (lines 795–805):

```tsx
<ExperienceBookingCard
  experienceName={exp.name}
  priceFrom={priceFrom}
  priceLabel={exp.price}
  duration={exp.duration}
  freeCancellationHours={exp.freeCancellationHours}
  reserveNowPayLater={exp.reserveNowPayLater}
  whatsappMessage={exp.whatsappMessage || ''}
  maxGroupSize={exp.groupSizeRange?.max}
  bokunActivityId={(exp as any).bokunActivityId}
  experienceSlug={exp.slug}
  experienceCategory={exp.experienceCategory}
  priceOta={exp.priceOta}
/>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd "/Users/fabiofreitas/Documents/VIsual Studio Projects/b2cfinal-ricardoviana"
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/experience/ExperienceBookingCard.tsx client/src/pages/ExperienceDetail.tsx
git commit -m "feat(tracking): add begin_checkout to experience booking card (desktop)"
```

---

## Task 5: ExperienceMobileBookingBar.tsx — `begin_checkout` (mobile)

**Files:**
- Modify: `client/src/components/experience/ExperienceMobileBookingBar.tsx`
- Modify: `client/src/pages/ExperienceDetail.tsx`

- [ ] **Step 1: Add `pushEcommerce` import**

In `client/src/components/experience/ExperienceMobileBookingBar.tsx`, add after the existing imports (after line 9):

```typescript
import { pushEcommerce } from '@/lib/datalayer';
```

- [ ] **Step 2: Add optional tracking props to the interface**

Update `ExperienceMobileBookingBarProps` (lines 11–17):

```typescript
interface ExperienceMobileBookingBarProps {
  experienceName: string;
  priceFrom: number;
  whatsappMessage: string;
  maxGroupSize?: number;
  bokunActivityId?: number;
  // Tracking
  experienceSlug?: string;
  experienceCategory?: string;
  priceOta?: number;
}
```

- [ ] **Step 3: Destructure the new props in the function signature**

Update the function signature (lines 22–28):

```typescript
export default function ExperienceMobileBookingBar({
  experienceName,
  priceFrom,
  whatsappMessage,
  maxGroupSize = 10,
  bokunActivityId,
  experienceSlug,
  experienceCategory,
  priceOta,
}: ExperienceMobileBookingBarProps) {
```

- [ ] **Step 4: Fire `begin_checkout` on "Book now" click (hasBokun path)**

In the "Book now" button (lines 77–83), update the `onClick` handler:

```tsx
<button
  onClick={() => {
    if (experienceSlug) {
      pushEcommerce({
        event: 'begin_checkout',
        ecommerce: {
          currency: 'EUR',
          value: priceOta || 0,
          items: [{
            item_id: `EXP-${experienceSlug}`,
            item_name: experienceName,
            item_category: experienceCategory || '',
            price: priceOta || 0,
            quantity: 1,
          }],
        },
      });
    }
    setWidgetOpen(true);
  }}
  className="bg-[#1A1A18] text-white text-[11px] tracking-[0.14em] font-medium uppercase px-8 py-3.5"
  style={{ minHeight: '48px' }}
>
  Book now
</button>
```

- [ ] **Step 5: Fire `begin_checkout` on WhatsApp fallback click (mobile)**

In the `!hasBokun` "Check availability" `<a>` element (lines 85–94), add onClick:

```tsx
<a
  href={waHref}
  target="_blank"
  rel="noopener noreferrer"
  className="bg-[#1A1A18] text-white text-[11px] tracking-[0.14em] font-medium uppercase px-8 py-3.5 flex items-center"
  style={{ minHeight: '48px' }}
  onClick={() => {
    if (!experienceSlug) return;
    pushEcommerce({
      event: 'begin_checkout',
      ecommerce: {
        currency: 'EUR',
        value: priceOta || 0,
        items: [{
          item_id: `EXP-${experienceSlug}`,
          item_name: experienceName,
          item_category: experienceCategory || '',
          price: priceOta || 0,
          quantity: 1,
        }],
      },
    });
  }}
>
  Check availability
</a>
```

- [ ] **Step 6: Pass tracking props from ExperienceDetail.tsx**

In `client/src/pages/ExperienceDetail.tsx`, update the `<ExperienceMobileBookingBar>` usage (lines 906–912):

```tsx
<ExperienceMobileBookingBar
  experienceName={exp.name}
  priceFrom={priceFrom}
  whatsappMessage={exp.whatsappMessage || ''}
  maxGroupSize={exp.groupSizeRange?.max}
  bokunActivityId={(exp as any).bokunActivityId}
  experienceSlug={exp.slug}
  experienceCategory={exp.experienceCategory}
  priceOta={exp.priceOta}
/>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd "/Users/fabiofreitas/Documents/VIsual Studio Projects/b2cfinal-ricardoviana"
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 8: Manual smoke test**

On mobile viewport (or DevTools device simulation), navigate to any experience detail page. Open the console and run:

```javascript
window.dataLayer.filter(e => e.event === 'begin_checkout')
```

Click "Book now" in the sticky bottom bar. Expected: one `begin_checkout` entry with `item_id` matching `EXP-{slug}`.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/experience/ExperienceMobileBookingBar.tsx client/src/pages/ExperienceDetail.tsx
git commit -m "feat(tracking): add begin_checkout to experience mobile booking bar"
```

---

## Self-Review Checklist (completed inline)

- **Spec coverage:** All 4 events covered — `view_item_list` (Task 1), `select_item` (Task 2), `view_item` (Task 3), `begin_checkout` (Tasks 4–5). No purchase event per spec.
- **Placeholders:** None — all code is concrete with exact field values.
- **Type consistency:** `experienceSlug`, `experienceCategory`, `priceOta` prop names match across Tasks 4 and 5 and ExperienceDetail pass-through steps. `EXP-${slug}` pattern consistent across all tasks.
- **Ambiguity:** hasBokun/!hasBokun paths both covered in Tasks 4 and 5. `priceOta || 0` fallback consistent with spec.
