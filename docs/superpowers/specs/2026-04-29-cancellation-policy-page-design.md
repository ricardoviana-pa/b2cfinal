# Cancellation Policy Page — Design Spec

**Date:** 2026-04-29  
**Status:** Approved

## Problem

When a user selects a rate plan in the booking widget (e.g. "Non-Refundable" or one with "Firm cancellation policy"), there is no in-product explanation of what those terms mean. Users cannot understand what they are agreeing to, which creates friction and potential disputes.

## Goal

Make the text "Non-refundable" and "Firm cancellation policy" clickable in the rate plan selector. Clicking opens a dedicated static page explaining all cancellation policy types in plain language.

---

## Architecture

Two independent changes:

1. **New static page** — `/legal/cancellation-policy`
2. **Widget link injection** — `BookingWidget.tsx` rate plan section

---

## 1. New Static Page

### URL & Route

- Path: `/legal/cancellation-policy`
- Registered in `client/src/App.tsx` alongside `/legal/terms`, `/legal/privacy`, `/legal/cookies`
- Lazy-loaded via `React.lazy()`

### File

`client/src/pages/CancellationPolicy.tsx`

Follows the exact pattern of `Terms.tsx`:
- `Header` component at the top
- `72px` top padding spacer (matches other legal pages)
- `section-padding` + `container max-w-[800px]` prose layout
- `Footer` component at the bottom
- `usePageMeta()` for SEO (title + description + canonical URL)

### Page Structure

| Section | Anchor | Policy code (Guesty) |
|---------|--------|----------------------|
| Flexible | `#flexible` | `flexible`, `moderate` |
| Firm | `#firm` | `firm` |
| Strict | `#strict` | `strict` |
| Non-refundable | `#non-refundable` | `super_strict` |

Each section: `<h2 id="...">` heading + 1–2 paragraphs of plain-language explanation.

### i18n

New keys under `cancellationPolicy.*` in all 9 locale files:
`en`, `pt`, `es`, `fr`, `de`, `it`, `nl`, `sv`, `fi`

Keys:
- `cancellationPolicy.pageTitle` — "Cancellation Policies"
- `cancellationPolicy.overline` — "Legal"
- `cancellationPolicy.intro` — short intro paragraph
- `cancellationPolicy.flexibleTitle` / `cancellationPolicy.flexibleBody`
- `cancellationPolicy.firmTitle` / `cancellationPolicy.firmBody`
- `cancellationPolicy.strictTitle` / `cancellationPolicy.strictBody`
- `cancellationPolicy.nonRefundableTitle` / `cancellationPolicy.nonRefundableBody`

---

## 2. Widget Link Injection

### File

`client/src/components/booking/BookingWidget.tsx`

### What changes

**Cancellation policy sub-text (line ~1043)**

Currently:
```tsx
<p className="text-[11px] text-black/40 mt-0.5">
  {humanizeCancellationPolicy(opt.cancellationPolicy[0])}
</p>
```

After: wrap the text in an `<a>` when the policy code maps to a page anchor.

```tsx
{opt.cancellationPolicy?.[0] && (() => {
  const text = humanizeCancellationPolicy(opt.cancellationPolicy[0]);
  const anchor = policyPageAnchor(opt.cancellationPolicy[0]);
  return anchor ? (
    <a
      href={`/legal/cancellation-policy${anchor}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="text-[11px] text-black/40 mt-0.5 underline underline-offset-2 hover:text-black/70 transition-colors"
    >
      {text}
    </a>
  ) : (
    <p className="text-[11px] text-black/40 mt-0.5">{text}</p>
  );
})()}
```

**Rate plan name (line ~1037)**

When `isNonRefundable` is true, the "Non-Refundable" name also becomes a link:

```tsx
{isNonRefundable ? (
  <a
    href="/legal/cancellation-policy#non-refundable"
    target="_blank"
    rel="noopener noreferrer"
    onClick={e => e.stopPropagation()}
    className="text-[13px] text-black font-medium underline underline-offset-2 hover:text-black/70 transition-colors"
  >
    {humanizeRatePlanName(opt.name)}
  </a>
) : (
  <p className="text-[13px] text-black font-medium">{humanizeRatePlanName(opt.name)}</p>
)}
```

### Helper function

Add `policyPageAnchor(raw: string): string | null` near the existing `humanizeCancellationPolicy` function:

```typescript
function policyPageAnchor(raw: string): string | null {
  const map: Record<string, string> = {
    'super_strict': '#non-refundable',
    'firm': '#firm',
  };
  return map[raw.toLowerCase()] ?? null;
}
```

Only `firm` and `super_strict` return an anchor — these are the two policy types the user identified. All other codes (flexible, moderate, strict) return `null` and stay as plain text.

---

## Out of Scope

- Existing `/faq#cancellation` links at lines 1286 and 1352 — left unchanged
- Dynamic content from Guesty API — page is fully static/editorial
- Admin UI changes

---

## Verification

1. Navigate to `/legal/cancellation-policy` — all four sections render, anchors work
2. Open a property with a `firm` or `super_strict` rate plan in the booking widget
3. Confirm "Non-refundable" and "Firm cancellation policy" are underlined links
4. Click each → opens new tab at the correct anchor section
5. Clicking the link does NOT deselect the radio button
6. Check all 9 language locale files contain the new keys
