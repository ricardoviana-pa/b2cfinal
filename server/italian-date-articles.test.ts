/**
 * Verificação em produção, 29 out 2026 (Checkout:P2): o italiano dizia
 * "il 11 novembre" nas duas partes ("Poi 1350 € il 11 novembre 2026.").
 * A regra é a dos emails (#172): o artigo segue a leitura do número, "l'8",
 * "l'11", "il 15", e o dia 1 fica "il 1" ("il primo"). Agora vive em
 * shared/italianDates.ts e o it.json usa-a pelos formatadores do i18next
 * ("{{date, il}}"), para o site, os emails e o mandato dizerem o mesmo.
 */
import fs from "node:fs";
import path from "node:path";
import i18next from "i18next";
import { describe, expect, it } from "vitest";
import { IT_ELIDED, itArt, italianDayTakesElision, type ItalianDateArticle } from "@shared/italianDates";
import { addItalianDateFormats, ITALIAN_DATE_FORMATS } from "@/i18n/italianDateFormats";
import { formatBookingDate } from "@/lib/format";
import { CONFIRMATION_I18N, LEGACY_I18N } from "./services/email-i18n";
import { lisbonWallTimeToUtc } from "./services/payment-plan";
import { renderCardChangeMandate, renderTwoPartsMandate } from "./services/two-parts-mandate";

const ROOT = path.resolve(import.meta.dirname, "..");
const readLocale = (lang: string) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "client/src/i18n/locales", `${lang}.json`), "utf8"));
const IT = readLocale("it");

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const ELIDED_DAYS = new Set([8, 11]);
const PREPS = Object.keys(IT_ELIDED) as ItalianDateArticle[];
/** "8 dicembre 2026": dezembro tem 31 dias. */
const longDate = (day: number) =>
  new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, 11, day, 12)),
  );
/** "08 dic 2026", com zero à esquerda, como o formatBookingDate do site. */
const shortDate = (day: number) => formatBookingDate(`2026-12-${String(day).padStart(2, "0")}`, "it", true);
/** Artigo sem elisão logo antes de 8 ou 11: o erro que não pode voltar. */
const WRONG = /\b(il|al|dal|del)\s+0?(8|11)\b/i;

async function italian() {
  const i = i18next.createInstance();
  await i.init({ lng: "it", fallbackLng: "it", interpolation: { escapeValue: false }, resources: { it: { translation: IT } } });
  addItalianDateFormats(i);
  return i;
}

describe("itArt (shared/italianDates): todos os dias de 1 a 31", () => {
  for (const day of DAYS) {
    it(`dia ${day}`, () => {
      for (const date of [longDate(day), shortDate(day)]) {
        expect(italianDayTakesElision(date)).toBe(ELIDED_DAYS.has(day));
        for (const prep of PREPS) {
          const expected = ELIDED_DAYS.has(day) ? `${IT_ELIDED[prep]}${date}` : `${prep} ${date}`;
          expect(itArt(prep, date)).toBe(expected);
          expect(itArt(prep, date, true)).toBe(expected.charAt(0).toUpperCase() + expected.slice(1));
          expect(itArt(prep, date)).not.toMatch(WRONG);
        }
      }
    });
  }

  it("o dia 1 lê-se «primo»: il 1, nunca l'1", () => {
    expect(itArt("il", "1 dicembre 2026")).toBe("il 1 dicembre 2026");
    expect(itArt("dal", "01 dic 2026")).toBe("dal 01 dic 2026");
    expect(itArt("il", "8 dicembre 2026")).toBe("l'8 dicembre 2026");
    expect(itArt("al", "11 novembre 2026")).toBe("all'11 novembre 2026");
    expect(itArt("dal", "08 nov 2026")).toBe("dall'08 nov 2026");
    expect(itArt("il", "11 novembre 2026", true)).toBe("L'11 novembre 2026");
    // 18, 28 e 80 não começam por vogal na leitura: sem elisão.
    expect(itArt("il", "18 dicembre 2026")).toBe("il 18 dicembre 2026");
    expect(itArt("il", "28 dicembre 2026")).toBe("il 28 dicembre 2026");
  });
});

describe("it.json: o artigo antes das datas vem do formatador, nunca escrito à mão", () => {
  type Leaf = { key: string; value: string };
  const leaves = (obj: Record<string, unknown>, prefix = ""): Leaf[] =>
    Object.entries(obj).flatMap(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) return leaves(v as Record<string, unknown>, key);
      return typeof v === "string" ? [{ key, value: v }] : [];
    });
  const DATE_VARS = "date|checkIn|checkOut|deadline|until|day|chargeDate";

  it("nenhuma string escreve «il/al/dal/del {{data}}»", () => {
    const raw = new RegExp(`\\b(il|al|dal|del|nel|sul)\\s+\\{\\{\\s*(${DATE_VARS})\\s*[,}]`, "i");
    expect(leaves(IT).filter((l) => raw.test(l.value)).map((l) => `${l.key}: ${l.value}`)).toEqual([]);
  });

  it("cada formatador usado no it.json existe (um nome errado deixava a data sem artigo)", () => {
    const used = new Set<string>();
    for (const { value } of leaves(IT)) {
      for (const m of value.matchAll(/\{\{\s*[\w.]+\s*,\s*([\w]+)\s*\}\}/g)) used.add(m[1].toLowerCase());
    }
    expect([...used].filter((f) => !ITALIAN_DATE_FORMATS.includes(f))).toEqual([]);
    expect(used.size).toBeGreaterThan(0);
  });

  it("os formatadores italianos só aparecem no it.json", () => {
    for (const lang of ["en", "pt", "fr", "es", "de", "nl", "sv", "fi"]) {
      const hits = leaves(readLocale(lang)).filter((l) => /\{\{\s*[\w.]+\s*,\s*(il|al|dal|del)(_cap)?\s*\}\}/i.test(l.value));
      expect(hits.map((l) => `${lang}:${l.key}`)).toEqual([]);
    }
  });

  it("as duas instâncias do i18next registam os formatadores (browser e servidor)", () => {
    for (const file of ["client/src/i18n/index.ts", "client/src/entry-server.tsx"]) {
      expect(fs.readFileSync(path.join(ROOT, file), "utf8"), file).toMatch(/addItalianDateFormats\((i18n|instance)\)/);
    }
  });
});

describe("as frases do site em italiano, com cada dia de 1 a 31", () => {
  const amount = { amountNow: "1350 €", amountLater: "1350 €" };
  const longKeys: Array<[string, Record<string, unknown>]> = [
    ["bookingWidget.twoPartsHint", {}],
    ["bookingWidget.twoPartsHintPlain", {}],
    ["payment.payNowAfter", amount],
    ["checkout.payPlan.split.sub", amount],
    ["checkout.summary.later", {}],
    ["checkout.bar.laterLabel", amount],
    ["checkout.rate.twoPartsLine", amount],
    ["checkout.rate.twoPartsLinePlain", amount],
    ["paymentThankYou.plan.scheduled", {}],
    ["booking.freeCancellation", {}],
  ];
  const shortKeys: Array<[string, Record<string, unknown>]> = [
    ["checkout.priceGuaranteed", { time: "18:00" }],
    ["checkout.emailHoldNote", { time: "18:00" }],
    ["checkout.flex.copyFlexible", { days: 7 }],
  ];

  for (const day of DAYS) {
    it(`dia ${day}`, async () => {
      const i = await italian();
      for (const [key, vars] of longKeys) {
        const date = longDate(day);
        const out = i.t(key, { ...vars, date });
        expect(out, key).toContain(date);
        expect(out, key).not.toMatch(WRONG);
        expect(out, key).not.toContain("{{");
      }
      for (const [key, vars] of shortKeys) {
        const date = shortDate(day);
        const out = i.t(key, { ...vars, date });
        expect(out, key).toContain(itArt("al", date));
        expect(out, key).not.toMatch(WRONG);
      }
      for (const key of ["payment.errorActions.whatsappMessage", "checkout.conciergeMessage"]) {
        const out = i.t(key, { property: "Casa", checkIn: shortDate(day), checkOut: shortDate(day === 31 ? 1 : day + 1), guests: 4 });
        expect(out, key).toContain(`${itArt("dal", shortDate(day))} ${itArt("al", shortDate(day === 31 ? 1 : day + 1))}`);
        expect(out, key).not.toMatch(WRONG);
      }
    });
  }

  it("as frases da verificação em produção, tal como ficam", async () => {
    const i = await italian();
    const date = "11 novembre 2026";
    expect(i.t("payment.payNowAfter", { amountLater: "1350 €", date })).toBe("Poi 1350 € l'11 novembre 2026.");
    expect(i.t("checkout.rate.twoPartsLinePlain", { amountNow: "1350 €", amountLater: "1350 €", date }))
      .toBe("Può anche pagare in due parti: 1350 € oggi e 1350 € l'11 novembre 2026.");
    expect(i.t("checkout.payPlan.split.sub", { amountNow: "1350 €", amountLater: "1350 €", date }))
      .toBe("1350 € oggi · 1350 € l'11 novembre 2026, sulla stessa carta");
    expect(i.t("checkout.bar.laterLabel", { amountLater: "1350 €", date })).toBe("+ 1350 € l'11 novembre 2026");
    expect(i.t("checkout.summary.later", { date })).toBe("L'11 novembre 2026");
    expect(i.t("checkout.summary.later", { date: "15 novembre 2026" })).toBe("Il 15 novembre 2026");
    expect(i.t("bookingWidget.twoPartsHintPlain", { date: "8 dicembre 2026" }))
      .toBe("Può pagare in due parti: metà oggi, metà l'8 dicembre 2026.");
    expect(i.t("paymentThankYou.plan.scheduled", { date: "1 dicembre 2026" })).toBe("Il 1 dicembre 2026");
  });
});

describe("o servidor diz o mesmo: mandato das duas partes e emails", () => {
  /** C num dia 8, retentativas a 11 e 13, prazo a 18 (Lisboa). */
  const values = (chargeDay: string, retries: string[]) => ({
    amountLaterCents: 135_000,
    chargeAt: lisbonWallTimeToUtc(chargeDay, 10, 0),
    retryAt: retries.map((d) => lisbonWallTimeToUtc(d, 10, 0)),
    freeCancelDeadlineAt: lisbonWallTimeToUtc("2026-12-20", 23, 59),
  });

  it("mandato em italiano: «l'8», «l'11» e o artigo em cada retentativa", () => {
    const m = renderTwoPartsMandate("it", values("2026-12-08", ["2026-12-11", "2026-12-13"]));
    expect(m.checkbox).toContain("ad addebitare 1.350,00 € l'8 dicembre 2026 sulla carta che uso ora");
    expect(m.text).toContain("ad addebitare 1.350,00 € l'8 dicembre 2026 sulla carta che usa ora");
    expect(m.text).toContain("riproviamo lo stesso importo l'11 dicembre 2026 e il 13 dicembre 2026, e ha");
    expect(`${m.checkbox} ${m.text}`).not.toMatch(WRONG);
  });

  it("mandato em italiano: cobrança em qualquer dia de 1 a 17 de dezembro", () => {
    for (let day = 1; day <= 17; day++) {
      const d = (n: number) => `2026-12-${String(n).padStart(2, "0")}`;
      const m = renderTwoPartsMandate("it", values(d(day), [d(day + 1), d(day + 3)]));
      expect(m.checkbox).toContain(`ad addebitare 1.350,00 € ${itArt("il", longDate(day))} sulla carta`);
      expect(`${m.checkbox} ${m.text}`).not.toMatch(WRONG);
    }
  });

  it("autorização de um cartão novo (página do saldo)", () => {
    const m = renderCardChangeMandate("it", {
      amountLaterCents: 135_000,
      chargeAt: lisbonWallTimeToUtc("2026-11-11", 10, 0),
      freeCancelDeadlineAt: lisbonWallTimeToUtc("2026-11-20", 23, 59),
      now: new Date("2026-10-29T12:00:00Z"),
    });
    expect(m.text).toContain("ad addebitare 1.350,00 € l'11 novembre 2026 su questa nuova carta");
  });

  it("os outros idiomas do mandato não mudam de forma", () => {
    const m = renderTwoPartsMandate("pt", values("2026-12-08", ["2026-12-11", "2026-12-13"]));
    expect(m.text).toContain("tentamos de novo o mesmo valor em 11 de dezembro de 2026 e 13 de dezembro de 2026, e tem");
  });

  it("email de confirmação e de chegada", () => {
    expect(CONFIRMATION_I18N.it.headline("Casa Aura", "8 novembre", "11 novembre"))
      .toBe("È confermato. Casa Aura è sua dall'8 novembre all'11 novembre.");
    expect(CONFIRMATION_I18N.it.headline("Casa Aura", "15 novembre", "22 novembre"))
      .toBe("È confermato. Casa Aura è sua dal 15 novembre al 22 novembre.");
    expect(LEGACY_I18N.it.arrivalIntro("Giulia", "Casa Aura", "11 novembre"))
      .toBe("Giulia, il suo soggiorno a Casa Aura inizia l'11 novembre. Il nostro team sta preparando tutto per il suo arrivo.");
  });
});
