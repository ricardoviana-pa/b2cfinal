# Portugal Active Black Friday 2026 — activation runbook

## Campaign

- VIP: 15% code `PABF15VIP26`, starting **22 November 2026**. Email grants early access and requests optional benefits through customer support, not automatically at checkout.
- General: 15% code `PABF15GERAL26`, applied automatically to eligible direct bookings between **23 November 00:00** and **30 November 23:59:59**, Europe/Lisbon.
- The booking date (not the check-in date) limits the offer. Stays have no special date restriction.
- Discounts must never stack with each other, other manual coupons, or the abandoned-checkout 5% offer.
- Third-party partner inventory / request-only properties must not receive the offer.
- No payments or real reservations during QA.

## Status

The pure date guard and its tests are implemented in this draft branch.
**The public auto-application is NOT yet implemented and must not be deployed or advertised as live.**

## Implementation required before merge

1. Make the Guesty quote carry the coupon consistently through the entire booking checkout, including requote, resumed intents, changed dates, rate-plan switching, and all payment methods. A discounted total must always come from the canonical Guesty quote; never calculate 15% in the browser.
2. Apply the general code only in the window and only when `BLACK_FRIDAY_2026_AUTO_COUPON=true`. Off by default. `false` is a kill switch. No 15% general promotion must appear on 22 November.
3. Ensure anonymous quote caching never shares a mutable `quoteId` with one visitor's changed coupon. Guesty's POST coupon endpoint mutates a quote; the current caches in `guesty-booking.ts` and `guesty.ts` can otherwise expose another visitor's discounts.
4. A manually entered VIP coupon must *replace* the public general coupon on the quote, never stack or silently revert. A manually entered other coupon must have an explicit conflict policy.
5. Make Guesty invalid/misconfigured coupons fail closed (do not display 15% while charging full price). Test confirmation before payment.
6. Exclude partner homes, isPortfolio, request-only and otherwise non-bookable listings.
7. Handle existing resumed booking intents and recovery coupon quotes deterministically, including the 5% recovery offer; never silently overwrite a higher existing discount.
8. Test on Nov 22, 23, 30, Dec 1 in Lisbon time; tests for VIP+general, general+recovery and failed Guesty; all supported rate plans, split payments, PayPal/Klarna/card, changed dates, checkout resume; no duplicate discounts.
9. Verify both Guesty coupons exist with 15% (and no arrival-date restriction), booking end date **2026-12-01 exclusive**, unlimited uses, and correct direct-booking listing scope.
10. Confirm `CHECKOUT_PROMO` visibility and ad/email CTA routes. Check disabled baseline and website/stay pricing before rollout.
11. Test in dev/staging and perform checkout up to pre-payment, with real dated availability, without creating reservations.
12. Publish the change behind the disabled flag only after all gates. Keep flag off in production until successful end-to-end tests. Switch on for 23–30 only.

## Known caveat

The website's 50/50 payment option has additional tariff and cancellation-window eligibility; it is **not** universally available on all 1000 EUR, 4-week advance bookings. Marketing disclaimer must not promise more than the checkout offers.
