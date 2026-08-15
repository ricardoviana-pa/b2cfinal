# Checkout 2.0 — Pending Work (complete)

Companion to `docs/HANDOVER.md`. English mirror of `docs/checkout_pendentes.md`.
**Done and on `dev`:** Phases 0, 1, 2 (all UI), 2.1 (configurator direction), polish blocks A/C/D, Flex UI, promo code, breakfast box, baby/pet catalog items, compact widget, CS ops manifest, premium guest confirmation, cart-recovery emails (1h/20h), tracking doc, 43-agent funnel audit + fixes. **The prototype is complete — what remains is wiring the money and tuning values.**

---

## A · CRITICAL PATH TO GO LIVE — only Ricardo can do these (in order)
> **DECISION (12 Jul 2026, Ricardo): extras revenue must NEVER enter the Guesty reservation** — Guesty totals feed owner revenue splits and extras are Portugal Active's own revenue ("bolo à parte"). This kills path A (invoice items) for business reasons and settles Phase 2b on **path B: single platform charge**. Mechanics: guest pays ONE charge (stay+extras) on our platform Stripe; reservation created via Open API with the STAY amount only + `recordExternalPayment` — exactly the existing Klarna/PayPal rails, extended to card. `needs_confirmation` failures = partial refund on our PI. Bonus: Apple/Google Pay become straightforward (platform account, no Guesty domain dependency). Accepted trade-offs: card fees + chargebacks on our account; Guesty shows the stay as externally paid.
1. ~~Spike invoice-items~~ **SETTLED by the decision above** — the spike script stays in the repo for reference only. Do NOT implement invoice items for extras.
2. **Accountant/Hostkit question (changed)** — the stay keeps its Hostkit invoice as today; extras need a SEPARATE services invoice (ours). Ask: emit via Hostkit API as a second document, or another invoicing tool? VAT per extra category; intra-EU B2B reverse charge.
3. **End-to-end test booking** on dev (cheap house, real card, then refund) — validates funnel, CS email, Guesty note, confirmation email, lead row. Bonus: cross-device resume (open the checkout link on a phone).
4. **GTM** (container GTM-TRPCDT3): create the tags from `docs/marketing-tracking.md` (without them the new events never reach GA4/Meta).
5. **Guesty**: request domain registration for Apple Pay on the connected Stripe accounts (dev. and www.).
6. **Test coupon** in Guesty Revenue Management (letters/numbers only) to validate the real promo.
7. **Render envs**: confirm `EMAIL_FROM` (booking@) · `CHECKOUT_PROMO=false` hides the promo field · `CHECKOUT_RECOVERY=false` silences recovery.
8. *(Optional)* Slack ops webhook — replaces/duplicates the CS email.

## B · PRODUCT & PRICE DECISIONS — Ricardo's ("values last")
9. Chef: pre-booking base price per person (placeholder 95€).
10. Hosted reception: 50€ / 90€ after 21h (validate vs real team travel cost).
11. Prices of ALL extras with Susana and Diogo (incl. interim Lisbon transfers 280/350€, breakfast 25€, pet 45€).
12. ~~Flex legal validation~~ **DONE 12 Jul 2026: André Feiteiro approved the Flex copy and terms** (dynamic 10% pricing included). The rule stands forever: never call it insurance, in any language. Remaining tunables: 1500€ threshold / 7-day window / 18-month validity.
13. Arrival bundle (D5): define the discount — model is built and inactive in code.
14. Early check-in gated to the calendar (spec 15.10): yes or no.
15. Deposit waiver (spec 15.11): request the 2025 incident history from operations before deciding.
16. Who confirms the `needs_confirmation` items and in which tool (destination of the 24h tasks).
17. Social proof (D3): when GA4 accumulates real data, swap the brand facts for true stats (slot is ready).
18. Email footers show info@ as contact — keep or switch to booking@?

## C · ENGINEERING — the owner's queue, in order (dependencies noted)
19. **PHASE 2B — real single charge** ⚠️ top priority (path DECIDED, see banner in section A): move the card flow onto the Klarna/PayPal rails — one platform PaymentIntent for stay+extras, Open API reservation with the stay amount only, `recordExternalPayment`, partial-refund path tested. TODAY the card charges only the stay while the copy already promises a single charge — do not open real traffic with paid extras before this.
20. **BLOCK B**: B1 per-house-type pricing (housekeeping/linen resolved from the listing bedroom count) · B2 distance-based transfer engine with airport selector (replaces the interim region filter) · B3 private chauffeur · B8 The table chapter before The home.
21. **Children field** in the guest selector (widget+intent+quote) → curation promotes crib/high-chair/babysitter.
22. **Phase 3** complete: `flex_credits` ledger + events, Flex inside the real charged total (with 2b).
23. **Phase 4** remaining: pre-arrival email 10 days out (sell before arrival) + `prearrival_addon_purchase`.
24. Purchase event with full `items[]` (extras/flex/reception) in GA4 — coupon already threads.
25. CRM emails in all 9 languages (today PT/EN only).
26. Multibanco (Stripe-native, Klarna pattern) and MB Way (Portuguese PSP) — when prioritized.
27. Bókun V2: real-time availability/purchase on experiences.
28. Hostkit: integration per the A2 test result (if the sync doesn't itemize → invoice extras via the Hostkit API).
29. Meta CAPI server-side (emission point already identified: the paid hook).
30. **GO-LIVE**: merge `dev`→`main` (clean; production stays legacy behind the flag), then `CHECKOUT_V2=true` when Ricardo says go.

## D · RULES THAT ARE NEVER VIOLATED (project memory)
Flex is never "insurance" · before payment we promise the PRICE, never the dates · voice: no em-dash-as-comma, hyphens inside words stay · no stock images · max 2 protections in the funnel · within the free-cancellation window we refund money, never credit.
