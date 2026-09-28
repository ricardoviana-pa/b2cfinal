import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import en from "../client/src/i18n/locales/en.json";
import pt from "../client/src/i18n/locales/pt.json";
import es from "../client/src/i18n/locales/es.json";
import fr from "../client/src/i18n/locales/fr.json";
import de from "../client/src/i18n/locales/de.json";
import it_ from "../client/src/i18n/locales/it.json";
import nl from "../client/src/i18n/locales/nl.json";
import fi from "../client/src/i18n/locales/fi.json";
import sv from "../client/src/i18n/locales/sv.json";
import { NEWSLETTER_LANGS } from "@shared/newsletter";
import { CONFIRM_EMAIL_COPY, NEWSLETTER_PAGE_COPY } from "./services/newsletter-copy";

const LOCALES: Record<string, any> = { en, pt, es, fr, de, it: it_, nl, fi, sv };

function leaves(obj: unknown, prefix = ""): Array<[string, string]> {
  if (typeof obj === "string") return [[prefix, obj]];
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

// "promoções exclusivas" and the like stay out until Ricardo decides an offer.
const EXCLUSIVE = /exclusiv|exklusiv|esclusiv|exclusief/i;

describe("newsletter texts in the nine site languages", () => {
  it("every UI key exists in every language, none left in English by accident", () => {
    const keys = leaves(en.newsletter).map(([k]) => k);
    expect(keys.length).toBeGreaterThan(25);
    for (const lang of NEWSLETTER_LANGS) {
      const own = new Map(leaves(LOCALES[lang].newsletter));
      for (const key of keys) {
        expect(own.get(key), `${lang} newsletter.${key}`).toBeTruthy();
        if (lang !== "en" && !["form.email"].includes(key)) {
          // A text identical to English in another language is a missing translation.
          const enText = new Map(leaves(en.newsletter)).get(key);
          if (enText && enText.length > 12) expect(own.get(key), `${lang} newsletter.${key}`).not.toBe(enText);
        }
      }
    }
  });

  it("the server texts (confirmation email and pages) exist in every language", () => {
    for (const lang of NEWSLETTER_LANGS) {
      const email = CONFIRM_EMAIL_COPY[lang];
      const page = NEWSLETTER_PAGE_COPY[lang];
      for (const [key, value] of Object.entries(email)) {
        const text = typeof value === "function" ? value("Casa X") : value;
        expect(text.length, `${lang} email.${key}`).toBeGreaterThan(3);
      }
      for (const [key, value] of Object.entries(page)) expect(value.length, `${lang} page.${key}`).toBeGreaterThan(3);
      expect(email.validity, lang).toContain("7");
    }
  });

  it("no exclusive-offer promise anywhere, in any language", () => {
    for (const lang of NEWSLETTER_LANGS) {
      for (const [key, text] of leaves(LOCALES[lang].newsletter)) expect(text, `${lang} ${key}`).not.toMatch(EXCLUSIVE);
      for (const text of Object.values(NEWSLETTER_PAGE_COPY[lang])) expect(text, lang).not.toMatch(EXCLUSIVE);
      for (const value of Object.values(CONFIRM_EMAIL_COPY[lang])) {
        expect(typeof value === "function" ? value("Casa X") : value, lang).not.toMatch(EXCLUSIVE);
      }
    }
  });

  it("Portuguese uses no hyphens or dashes as punctuation", () => {
    const pts = [
      ...leaves(pt.newsletter).map(([, v]) => v),
      ...Object.values(NEWSLETTER_PAGE_COPY.pt),
      ...Object.values(CONFIRM_EMAIL_COPY.pt).map((v) => (typeof v === "function" ? v("Casa X") : v)),
      pt.privacy.s2OriginBody,
    ];
    for (const text of pts) expect(text).not.toMatch(/[–—]| - /);
  });

  it("the old footer texts that promised a monthly send and exclusive offers are gone", () => {
    for (const lang of NEWSLETTER_LANGS) {
      const footer = LOCALES[lang].footer as Record<string, string>;
      for (const key of ["nlHeadline", "nlSub", "welcomeInbox", "newsletterHint", "emailPlaceholder", "nlError", "subscribe"]) {
        expect(footer[key], `${lang} footer.${key}`).toBeUndefined();
      }
    }
  });

  it("the PT privacy policy says the visit origin is also kept with a newsletter sign-up", () => {
    expect(pt.privacy.s2OriginBody).toContain("ou da sua subscrição da newsletter");
    expect(pt.privacy.s2OriginBody).toContain("Aceitar tudo");
  });

  it("the pop-up is mounted once, lazily, and the house page keeps its booking bar visible", () => {
    const app = fs.readFileSync("client/src/App.tsx", "utf8");
    expect(app).toMatch(/lazy\(\(\) => import\("\.\/components\/marketing\/NewsletterPopupGate"\)\)/);
    const pdp = fs.readFileSync("client/src/pages/PropertyDetail.tsx", "utf8");
    expect(pdp).toContain("data-nl-bottom-bar");
    expect(pdp).toContain('<NewsletterBlock origin="house"');
    expect(fs.readFileSync("client/src/pages/BlogArticle.tsx", "utf8")).toContain('<NewsletterBlock origin="article"');
    expect(fs.readFileSync("client/src/components/layout/Footer.tsx", "utf8")).toContain('<NewsletterForm origin="footer"');
  });

  it("the sign-up is a generate_lead in the dataLayer, like every other form, with the origin and no address", () => {
    const form = fs.readFileSync("client/src/components/marketing/NewsletterForm.tsx", "utf8");
    const push = form.slice(form.indexOf("pushDL({"), form.indexOf("});", form.indexOf("pushDL({")));
    expect(push).toContain("event: 'generate_lead'");
    expect(push).toContain("lead_type: 'newsletter'");
    expect(push).toContain("newsletter_origin: origin");
    expect(push).not.toMatch(/email|value|hash/i);
    // pushDL is the consent-gated helper (only with "Aceitar tudo").
    expect(form).toContain("import { pushDL } from '@/lib/datalayer'");
    expect(form).not.toMatch(/dataLayer\.push/);
  });

  it("phones and touch tablets get the small bottom sheet, never the centred dialog", () => {
    const gate = fs.readFileSync("client/src/components/marketing/NewsletterPopupGate.tsx", "utf8");
    expect(gate).toContain("const MOBILE_QUERY = '(max-width: 767px), (hover: none) and (pointer: coarse)';");
    const popup = fs.readFileSync("client/src/components/marketing/NewsletterPopup.tsx", "utf8");
    expect(popup).toContain('aria-modal="false"');
    expect(popup).toContain("maxHeight: '45vh'");
    expect(popup).toContain("focus({ preventScroll: true })");
  });
});

describe("confirmation email", () => {
  const logs: string[] = [];
  beforeEach(() => {
    logs.length = 0;
    vi.stubEnv("RESEND_API_KEY", "");
    for (const level of ["info", "log", "warn", "error"] as const) {
      vi.spyOn(console, level).mockImplementation((...a) => { logs.push(a.map(String).join(" ")); });
    }
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("has the button, the plain link, the 7 days, the 'ignore it' line and the house; never logs the address", async () => {
    vi.resetModules();
    const { sendNewsletterConfirmation } = await import("./services/transactional-email");
    const url = "https://www.portugalactive.com/api/newsletter/confirm?lead=91&e=1790000000&t=0123456789abcdef0123456789abcdef&lang=pt";
    await sendNewsletterConfirmation({ email: "guest@example.test", locale: "pt", confirmUrl: url, leadId: 91, houseName: "Casa X" });
    const out = logs.join("\n");
    expect(out).toContain("Subject: Confirme a sua subscrição da Portugal Active");
    expect(out).toContain("Confirmar subscrição");
    expect(out).toContain("Registámos o seu interesse nesta casa: Casa X.");
    expect(out).toContain("O link é válido durante 7 dias.");
    expect(out).toContain("Sem o clique, a subscrição não fica ativa.");
    expect(out).toContain("Travessa da Estrada Nova 187, 4935-336 Viana do Castelo");
    expect(out).toContain(url.replace(/&/g, "&amp;"));
    expect(out).toContain("(newsletter confirmation, lead #91)");
    expect(out).not.toContain("guest@example.test");
  });
});
