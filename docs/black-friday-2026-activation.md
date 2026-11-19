# Portugal Active Black Friday 2026 — activation runbook

## Campaign

- VIP: 15% code `PABF15VIP26`, starting **22 November 2026**. Email grants early access and requests optional benefits through customer support, not automatically at checkout.
- General: 15% code `PABF15GERAL26`, applied automatically to eligible direct bookings between **23 November 00:00** and **30 November 23:59:59**, Europe/Lisbon.
- The booking date (not the check-in date) limits the offer. Stays have no special date restriction.
- Discounts must never stack with each other, other manual coupons, or the abandoned-checkout 5% offer.
- Third-party partner inventory / request-only properties must not receive the offer.
- No payments or real reservations during QA.

## Status

The date guard and the direct-booking Guesty auto-quote path are implemented in this draft branch.
The coupon is disabled by default until `BLACK_FRIDAY_2026_AUTO_COUPON=true`.
**Do NOT merge, activate or advertise as live before CI, real Guesty quote verification, and the scenario tests below.**

## Implementation required before merge

1. **Implemented — verify in QA:** Discounted Guesty quotes feed the booking widget and checkout. Validate every payment method, requote, resumed intent, changed dates, and rate-plan selection. A discounted total must always come from the canonical Guesty quote; never calculate 15% in the browser.
2. **Implemented — verify in QA:** General code only 23–30 November while `BLACK_FRIDAY_2026_AUTO_COUPON=true`, off by default. `false` is the kill switch. VIP code only 22–30 November.
3. **Implemented — verify with two sessions:** The public offer gets a fresh private Guesty quote (no cached anonymous quote). A second visitor must not inherit a mutable quote ID from the first visitor.
4. **Implemented — verify in Guesty:** The entered VIP coupon replaces the public coupon (POST sends one code; supplier quote with multiple coupon records is rejected). Make sure other manual coupons and promotional combinations do not silently reduce a valid benefit.
5. Make Guesty invalid/misconfigured coupons fail closed (do not display 15% while charging full price). Test confirmation before payment.
6. Exclude partner homes, isPortfolio, request-only and otherwise non-bookable listings.
7. **QA blocker:** Verify existing resumed booking intents and recovery coupon quotes around midnight Nov 23, including the 5% recovery offer. The recovery stage-three email currently can still create a 5% offer while the public campaign is 15%; resolve messaging and eligibility before activation.
8. Test on Nov 22, 23, 30, Dec 1 in Lisbon time; tests for VIP+general, general+recovery and failed Guesty; all supported rate plans, split payments, PayPal/Klarna/card, changed dates, checkout resume; no duplicate discounts.
9. Verify both Guesty coupons exist with 15% (and no arrival-date restriction), booking end date **2026-12-01 exclusive**, unlimited uses, and correct direct-booking listing scope.
10. Confirm `CHECKOUT_PROMO` visibility and ad/email CTA routes. Check disabled baseline and website/stay pricing before rollout. Direct-website Guesty coupon validation is still needed using one available 2027 stay, without paying.
11. Test in dev/staging and perform checkout up to pre-payment, with real dated availability, without creating reservations.
12. Publish the change behind the disabled flag only after all gates. Keep flag off in production until successful end-to-end tests. Switch on for 23–30 only.

## Known caveat

The website's 50/50 payment option has additional tariff and cancellation-window eligibility; it is **not** universally available on all 1000 EUR, 4-week advance bookings. Marketing disclaimer must not promise more than the checkout offers.
