# Cowork prompt — add Refundable rate plan to every property

> **Goal:** every Portugal Active property must have BOTH a Non-Refundable AND a Refundable rate plan published to the Booking Engine, so customers see a choice and the website's default is the customer-friendly one. Today several properties only have one plan — that's hurting conversion.

---

## 1. Run the audit first

In Render shell of the `portugalactive-com` service:

```bash
pnpm tsx scripts/refundable-plan-audit.ts
```

Output is a table per listing showing which plans exist, plus a final list of listings **missing** the Refundable plan. Copy that list — that's your work queue.

---

## 2. For each listing in the work queue, create a Refundable rate plan in Guesty

Steps in the Guesty dashboard:

1. **Properties → click the listing → tab "Pricing & Policies" → "Rate plans" (sometimes under "Distribution → Booking Engine → Rate plans")**
2. Click **+ New rate plan** (or "Add rate plan")
3. Fill in:

| Field | Value |
|---|---|
| **Name** | `Refundable` |
| **Description** (if shown) | `Full refund up to 14 days before check-in` |
| **Cancellation policy** | `Moderate` — full refund 14+ days before check-in |
| **Price adjustment** | **+10% markup** on the base/Non-Refundable rate |
| **Cleaning fee** | **Same as the Non-Refundable plan** (the cleaning-fee sync cron keeps these aligned automatically — don't override) |
| **Min stay / Max stay** | Same as the existing Non-Refundable plan |
| **Channels** | Enable for **Booking Engine** (and any others the existing Non-Refundable plan is on) |
| **Status / Active** | Yes / Published |

4. Save.
5. Verify on `dev.portugalactive.com/en/homes/<that-property>` — pick any dates → the booking widget should now show a rate plan selector with both options, with **Refundable** pre-selected.

---

## 3. Settings to match across plans

For each property's two plans (Refundable + Non-Refundable), make sure these are identical so the only differences are price + cancellation:

- Min/max nights
- Guest count limits
- Cleaning fee (the cron sync already enforces this — see `server/services/cleaning-fee-sync.ts`)
- Channel availability (Booking Engine ON for both)
- Booking window (how far in advance bookings can be made)

The ONLY intentional differences should be:
- **Refundable**: +10% price, Moderate cancellation policy
- **Non-Refundable**: base price, Super_strict cancellation policy

---

## 4. Re-run the audit when done

```bash
pnpm tsx scripts/refundable-plan-audit.ts
```

Expected result:
```
Total listings scanned : N
Have Refundable plan   : N
MISSING Refundable     : 0
```

Then on the website, every property page with date selection should show a rate plan selector with **Refundable** pre-selected by default (this is automatic — the code preferring refundable was shipped in commit `82d3704`).

---

## Why we're doing this

The website code (`server/services/guesty-booking.ts`) already prefers the refundable plan as the default selection when both exist. But several properties only have Non-Refundable published in Guesty BE, so customers see "Non-Refundable" with no choice. That's a conversion killer — direct-booking customers expect at least a refundable option, even at a premium.

After this task, every property offers the choice, and the code shows the friendly one first.
