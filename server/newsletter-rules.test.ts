import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NEWSLETTER_CONSENT_TEXT,
  NEWSLETTER_CONSENT_VERSION,
  NEWSLETTER_LANGS,
  NEWSLETTER_PRIVACY_LABEL,
  NEWSLETTER_VISIT_ORIGIN_LANGS,
  NL_DESKTOP_DELAY_MS,
  NL_MOBILE_DELAY_MS,
  NL_MOBILE_SCROLL_PCT,
  NL_OVERLAY_SELECTOR,
  NL_STRIP_PX,
  consentRecord,
  hasEmailOrRecoveryUtm,
  hasPopupLinkParam,
  houseSlugFromPath,
  isExcludedPath,
  isExitIntent,
  isNewsletterHouse,
  isWithinCooldown,
  otherOverlayOpen,
  pageKind,
  popupEligibility,
  remainingDelay,
  scrollProgressPct,
  stripFits,
  type OverlayProbeElement,
  type PopupEligibilityInput,
} from "@shared/newsletter";

const NOW = Date.parse("2026-10-05T10:00:00Z");
const DAY = 86_400_000;
const base = (over: Partial<PopupEligibilityInput> = {}): PopupEligibilityInput => ({
  enabled: true,
  locales: ["pt"],
  lang: "pt",
  path: "/homes",
  subscribed: null,
  lastShownAt: null,
  skipSession: null,
  cookieChoice: "essential",
  visible: true,
  now: NOW,
  ...over,
});

describe("pop-up: when it may show", () => {
  it("shows to a new visitor who answered the cookie banner (either answer)", () => {
    expect(popupEligibility(base())).toEqual({ eligible: true });
    expect(popupEligibility(base({ cookieChoice: "all" }))).toEqual({ eligible: true });
  });

  it("never before the cookie banner has an answer", () => {
    expect(popupEligibility(base({ cookieChoice: null }))).toEqual({ eligible: false, reason: "cookie_banner" });
    // Not even from an ad link: two overlays at once is what we avoid.
    expect(popupEligibility(base({ cookieChoice: null, forced: true }))).toEqual({ eligible: false, reason: "cookie_banner" });
  });

  it("never on the checkout, the booking pages or the legal pages", () => {
    for (const path of ["/checkout/abc", "/booking/thank-you/1", "/booking/klarna-return", "/legal/privacy", "/legal/cookies", "/legal/terms", "/legal/cancellation-policy", "/admin", "/login", "/account", "/newsletter", "/contact", "/owners", "/owners-portal", "/careers"]) {
      expect(isExcludedPath(path), path).toBe(true);
      expect(popupEligibility(base({ path })).reason, path).toBe("path");
    }
    for (const path of ["/", "/homes", "/homes/casa-x", "/blog/um-artigo", "/destinations/minho", "/legalities-not-a-route", "/contacts-not-a-route"]) {
      expect(isExcludedPath(path), path).toBe(false);
    }
  });

  it("never to someone who subscribed, on any surface", () => {
    expect(popupEligibility(base({ subscribed: "1" })).reason).toBe("subscribed");
    expect(popupEligibility(base({ subscribed: "1", forced: true })).reason).toBe("subscribed");
  });

  it("never to someone who saw it (and closed it) in the last 30 days", () => {
    expect(popupEligibility(base({ lastShownAt: String(NOW - 29 * DAY) })).reason).toBe("cooldown");
    expect(popupEligibility(base({ lastShownAt: String(NOW - 31 * DAY) }))).toEqual({ eligible: true });
    expect(isWithinCooldown("garbage", NOW)).toBe(false);
  });

  it("never in a visit that came from one of our emails", () => {
    expect(hasEmailOrRecoveryUtm("?utm_source=email&utm_campaign=2026-10_o1_pt")).toBe(true);
    expect(hasEmailOrRecoveryUtm("?utm_medium=recovery")).toBe(true);
    expect(hasEmailOrRecoveryUtm("?utm_source=google&utm_medium=cpc")).toBe(false);
    expect(popupEligibility(base({ skipSession: "1" })).reason).toBe("utm");
  });

  it("only in the languages the server allows, only in a visible tab, only when switched on", () => {
    expect(popupEligibility(base({ lang: "es" })).reason).toBe("locale");
    expect(popupEligibility(base({ lang: "es", locales: ["pt", "es"] }))).toEqual({ eligible: true });
    expect(popupEligibility(base({ visible: false })).reason).toBe("hidden");
    expect(popupEligibility(base({ enabled: false })).reason).toBe("disabled");
  });

  it("never for 180 days to someone we already know (email visit, booking, checkout box); an ad link still opens it", () => {
    expect(popupEligibility(base({ knownAt: String(NOW - 10 * DAY) })).reason).toBe("known");
    expect(popupEligibility(base({ knownAt: String(NOW - 179 * DAY) })).reason).toBe("known");
    expect(popupEligibility(base({ knownAt: String(NOW - 181 * DAY) }))).toEqual({ eligible: true });
    expect(popupEligibility(base({ knownAt: "garbage" }))).toEqual({ eligible: true });
    expect(popupEligibility(base({ knownAt: String(NOW - DAY), forced: true }))).toEqual({ eligible: true });
  });

  it("?nl=1 from an ad opens it despite the 30-day rule, never for a subscriber", () => {
    expect(hasPopupLinkParam("?nl=1&utm_source=meta")).toBe(true);
    expect(hasPopupLinkParam("?nl=open")).toBe(true);
    expect(hasPopupLinkParam("?nl=0")).toBe(false);
    expect(popupEligibility(base({ forced: true, lastShownAt: String(NOW - DAY) }))).toEqual({ eligible: true });
  });
});

describe("pop-up: triggers", () => {
  it("computer at 8 s or exit intent, phone at 15 s or 40% of the page", () => {
    expect(NL_DESKTOP_DELAY_MS).toBe(8_000);
    expect(NL_MOBILE_DELAY_MS).toBe(15_000);
    expect(NL_MOBILE_SCROLL_PCT).toBe(40);
  });

  it("counts time on the site, not per page", () => {
    expect(remainingDelay(8_000, NOW - 5_000, NOW)).toBe(3_000);
    expect(remainingDelay(8_000, NOW - 20_000, NOW)).toBe(0);
    expect(remainingDelay(8_000, NOW, NOW)).toBe(8_000);
  });

  it("scroll progress is measured on the scrollable height; a page that does not scroll never triggers", () => {
    expect(scrollProgressPct(400, 800, 1800)).toBe(40);
    expect(scrollProgressPct(0, 800, 1800)).toBe(0);
    expect(scrollProgressPct(0, 800, 700)).toBe(0);
    expect(scrollProgressPct(5000, 800, 1800)).toBe(100);
  });

  it("exit intent is the pointer leaving through the top, after 2 s on the page", () => {
    expect(isExitIntent({ clientY: -1, relatedTarget: null }, 3_000)).toBe(true);
    expect(isExitIntent({ clientY: 0, relatedTarget: null }, 3_000)).toBe(true);
    expect(isExitIntent({ clientY: 300, relatedTarget: null }, 3_000)).toBe(false);
    expect(isExitIntent({ clientY: -1, relatedTarget: {} }, 3_000)).toBe(false);
    expect(isExitIntent({ clientY: -1, relatedTarget: null }, 500)).toBe(false);
  });
});

describe("page context", () => {
  it("classifies the routes the learning reports use", () => {
    expect(pageKind("/")).toBe("home");
    expect(pageKind("/homes")).toBe("homes");
    expect(pageKind("/homes/casa-x")).toBe("house");
    expect(pageKind("/destinations/minho")).toBe("destination");
    expect(pageKind("/blog/um-artigo")).toBe("article");
    expect(pageKind("/blog")).toBe("blog");
    expect(pageKind("/experiences/surf")).toBe("experience");
    expect(pageKind("/about")).toBe("other");
    expect(houseSlugFromPath("/homes/casa-x")).toBe("casa-x");
    expect(houseSlugFromPath("/homes")).toBeUndefined();
  });

  it("a house interest only for houses the PA manages (not partner homes)", () => {
    expect(isNewsletterHouse({ guestyId: "abc" })).toBe(true);
    expect(isNewsletterHouse({ guestyId: "abc", source: "tripwix" })).toBe(false);
    expect(isNewsletterHouse({ guestyId: "" })).toBe(false);
    expect(isNewsletterHouse(null)).toBe(false);
  });
});

describe("consent text", () => {
  it("exists in the nine site languages with the privacy link label", () => {
    for (const lang of NEWSLETTER_LANGS) {
      expect(NEWSLETTER_CONSENT_TEXT[lang].length, lang).toBeGreaterThan(60);
      expect(NEWSLETTER_PRIVACY_LABEL[lang].length, lang).toBeGreaterThan(5);
    }
  });

  it("is recorded word for word, with its version and the policy it linked to", () => {
    const pt = consentRecord("pt-PT");
    expect(pt.lang).toBe("pt");
    expect(pt.version).toBe(NEWSLETTER_CONSENT_VERSION);
    expect(pt.text).toBe(
      "Ao subscrever, aceita receber emails da Portugal Active com novidades e promoções das nossas casas. Enviamos um email para confirmar e pode sair em qualquer altura. Política de privacidade: https://www.portugalactive.com/pt/legal/privacy",
    );
    expect(consentRecord("xx").lang).toBe("en");
  });

  it("promises nothing that does not exist yet and uses no dashes as punctuation in PT", () => {
    for (const lang of NEWSLETTER_LANGS) {
      expect(NEWSLETTER_CONSENT_TEXT[lang], lang).not.toMatch(/exclusiv|exklusiv|esclusiv|exclusief|eksklusiiv|exklusiv/i);
    }
    expect(NEWSLETTER_CONSENT_TEXT.pt).not.toMatch(/[–—]| - /);
  });
});

describe("phone sheet: how much of the screen, and giving way to other overlays", () => {
  it("the unrequested strip and the booking bar together fit in 30% of the visible height", () => {
    expect(NL_STRIP_PX).toBeLessThanOrEqual(72);
    // iPhone 14 in Safari with its bars (664 px): generic page and house page with the booking bar.
    expect(stripFits(664, 0)).toBe(true);
    expect(stripFits(664, 110)).toBe(true);
    // iPhone SE in Safari (553 px): generic page yes; house page waits (the house block on the page is there).
    expect(stripFits(553, 0)).toBe(true);
    expect(stripFits(553, 110)).toBe(false);
    // Landscape phones: a large one yes, a small one (or any with a bar) waits.
    expect(stripFits(360, 0)).toBe(true);
    expect(stripFits(300, 0)).toBe(false);
    expect(stripFits(360, 60)).toBe(false);
    expect(stripFits(0, 0)).toBe(false);
  });

  type Stub = OverlayProbeElement & { style: { display: string; visibility: string } };
  const el = (over: { inside?: string[]; w?: number; h?: number; display?: string; visibility?: string } = {}): Stub => ({
    closest: (selector: string) => ((over.inside ?? []).includes(selector) ? {} : null),
    getBoundingClientRect: () => ({ width: over.w ?? 390, height: over.h ?? 500 }),
    style: { display: over.display ?? "block", visibility: over.visibility ?? "visible" },
  });
  const doc = (nodes: Stub[], pointerEvents = "") => ({
    body: { style: { pointerEvents } },
    querySelectorAll: (selector: string) => {
      expect(selector).toBe(NL_OVERLAY_SELECTOR);
      return nodes;
    },
  });
  const styleOf = (node: OverlayProbeElement) => (node as Stub).style;

  it("an open drawer or dialog (Radix sets pointer-events:none on the body) makes the sheet give way", () => {
    // The booking drawer opened from the bar under the sheet: the sheet was visible and dead to taps.
    expect(otherOverlayOpen(doc([el({ inside: ["[data-nl-popup]"] })], "none"), styleOf)).toBe(true);
    // A visible dialog, the header menu (aria-modal) or the cookie banner (data-nl-suppress).
    expect(otherOverlayOpen(doc([el({ inside: ["[data-nl-popup]"] }), el()]), styleOf)).toBe(true);
  });

  it("the sheet itself, and closed or hidden overlays, do not count", () => {
    expect(otherOverlayOpen(doc([el({ inside: ["[data-nl-popup]"] })]), styleOf)).toBe(false);
    // The header menu stays in the DOM, invisible, when closed.
    expect(otherOverlayOpen(doc([el({ visibility: "hidden" })]), styleOf)).toBe(false);
    expect(otherOverlayOpen(doc([el({ display: "none" })]), styleOf)).toBe(false);
    expect(otherOverlayOpen(doc([el({ w: 0, h: 0 })]), styleOf)).toBe(false);
    expect(otherOverlayOpen(doc([el({ inside: ['[aria-hidden="true"]'] }), el({ inside: ["[inert]"] })]), styleOf)).toBe(false);
    expect(otherOverlayOpen(doc([]), styleOf)).toBe(false);
  });
});

describe("visit origin: only where the privacy policy announces it", () => {
  it("the languages that keep it are exactly those whose policy has privacy.s2OriginBody", () => {
    for (const lang of NEWSLETTER_LANGS) {
      const json = JSON.parse(readFileSync(path.resolve(__dirname, "../client/src/i18n/locales", `${lang}.json`), "utf8"));
      const hasLine = typeof json?.privacy?.s2OriginBody === "string" && json.privacy.s2OriginBody.length > 0;
      expect(NEWSLETTER_VISIT_ORIGIN_LANGS.includes(lang), lang).toBe(hasLine);
    }
  });
});
