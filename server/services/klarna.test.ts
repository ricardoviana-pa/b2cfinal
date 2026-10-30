import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  KLARNA_COUNTRIES,
  KLARNA_DEFAULT_COUNTRY,
  KLARNA_PAY_IN_3_MAX_CENTS,
  countryFromPhone,
  countryFromSiteLanguage,
  isKlarnaCountry,
  klarnaAvailable,
  klarnaBillingCountry,
  klarnaMaxCents,
  klarnaPreferredLocale,
  normalizeCountry,
} from "@shared/klarna";
import { KLARNA_MAX_EUR, paymentMarksFor } from "@/components/booking/PaymentMethodsNote";

/**
 * Klarna com o país de faturação real do hóspede (decisão do Ricardo, 29 out
 * 2026). Uma só regra, partilhada pelo browser e pelo servidor: em que países
 * a Klarna se oferece em euros, até que valor em cada um, que país se manda e
 * em que língua sai a página da Klarna.
 */

const read = (p: string) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("países e tectos (docs.stripe.com/payments/klarna, 29 out 2026)", () => {
  it("só os países da zona euro com Pay in 3; Bélgica e Finlândia (sem Pay in 3) e os países fora do euro ficam fora", () => {
    expect([...KLARNA_COUNTRIES].sort()).toEqual(["AT", "DE", "ES", "FR", "GR", "IE", "IT", "NL", "PT"]);
    for (const c of ["BE", "FI", "GB", "SE", "DK", "NO", "PL", "CZ", "RO", "CH", "US", "CA", "AU", "NZ", "BR", "LU"]) {
      expect(isKlarnaCountry(c), c).toBe(false);
    }
  });

  it("Portugal mantém o tecto de 1 000 € (a regra que existia); os outros, o tecto publicado", () => {
    expect(KLARNA_DEFAULT_COUNTRY).toBe("PT");
    expect(KLARNA_PAY_IN_3_MAX_CENTS).toEqual({
      PT: 100_000, GR: 100_000,
      ES: 300_000, FR: 300_000, IT: 300_000, IE: 300_000,
      DE: 500_000, AT: 500_000, NL: 500_000,
    });
    expect(KLARNA_MAX_EUR).toBe(1000);
    expect(klarnaMaxCents("pt")).toBe(100_000);
    expect(klarnaMaxCents("GB")).toBeNull();
    expect(klarnaMaxCents(null)).toBeNull();
  });

  it("disponível só com país da tabela e total inteiro, positivo e dentro do tecto", () => {
    expect(klarnaAvailable("PT", 100_000)).toBe(true);
    expect(klarnaAvailable("PT", 100_001)).toBe(false);
    expect(klarnaAvailable("DE", 500_000)).toBe(true);
    expect(klarnaAvailable("DE", 500_001)).toBe(false);
    expect(klarnaAvailable("es", 300_000)).toBe(true);
    expect(klarnaAvailable("GB", 1_000)).toBe(false);
    expect(klarnaAvailable("PT", 0)).toBe(false);
    expect(klarnaAvailable("PT", -500)).toBe(false);
    expect(klarnaAvailable("PT", 500.5)).toBe(false);
    expect(klarnaAvailable("PT", null)).toBe(false);
    expect(klarnaAvailable("PT", undefined)).toBe(false);
    expect(klarnaAvailable(undefined, 50_000)).toBe(false);
  });
});

describe("país de faturação: telefone → língua do site → PT", () => {
  it("normaliza o ISO2 e recusa o resto", () => {
    expect(normalizeCountry("pt")).toBe("PT");
    expect(normalizeCountry(" De ")).toBe("DE");
    for (const bad of ["", "P", "PRT", "1A", null, undefined, 12]) expect(normalizeCountry(bad), String(bad)).toBeNull();
  });

  it("lê o país do indicativo de um telefone internacional (E.164 ou 00)", () => {
    expect(countryFromPhone("+351 912 345 678")).toBe("PT");
    expect(countryFromPhone("00351912345678")).toBe("PT");
    expect(countryFromPhone("+34 600 000 000")).toBe("ES");
    expect(countryFromPhone("+33 6 12 34 56 78")).toBe("FR");
    expect(countryFromPhone("+39 320 000 0000")).toBe("IT");
    expect(countryFromPhone("+353 85 000 0000")).toBe("IE");
    expect(countryFromPhone("+31 6 00000000")).toBe("NL");
    expect(countryFromPhone("+49 170 1234567")).toBe("DE");
    expect(countryFromPhone("+43 660 0000000")).toBe("AT");
    expect(countryFromPhone("+30 690 000 0000")).toBe("GR");
    expect(countryFromPhone("+32 470 00 00 00")).toBe("BE");
    expect(countryFromPhone("+358 40 0000000")).toBe("FI");
    expect(countryFromPhone("+44 7700 900123")).toBe("GB");
    expect(countryFromPhone("+46 70 000 00 00")).toBe("SE");
    expect(countryFromPhone("+1 415 555 0100")).toBe("US");
    expect(countryFromPhone("+55 11 90000 0000")).toBe("BR");
  });

  it("sem telefone, número nacional sem indicativo ou indicativo desconhecido: não se sabe (null)", () => {
    expect(countryFromPhone("")).toBeNull();
    expect(countryFromPhone(null)).toBeNull();
    expect(countryFromPhone(undefined)).toBeNull();
    expect(countryFromPhone("912345678")).toBeNull();
    expect(countryFromPhone("+")).toBeNull();
    expect(countryFromPhone("+999 123")).toBeNull();
  });

  it("a língua do site tem país, menos o inglês", () => {
    expect(countryFromSiteLanguage("pt")).toBe("PT");
    expect(countryFromSiteLanguage("pt-PT")).toBe("PT");
    expect(countryFromSiteLanguage("es")).toBe("ES");
    expect(countryFromSiteLanguage("fr")).toBe("FR");
    expect(countryFromSiteLanguage("de")).toBe("DE");
    expect(countryFromSiteLanguage("it")).toBe("IT");
    expect(countryFromSiteLanguage("nl")).toBe("NL");
    expect(countryFromSiteLanguage("sv")).toBe("SE");
    expect(countryFromSiteLanguage("fi")).toBe("FI");
    expect(countryFromSiteLanguage("en")).toBeNull();
    expect(countryFromSiteLanguage("en-GB")).toBeNull();
    expect(countryFromSiteLanguage("")).toBeNull();
  });

  it("a cadeia: o país do PhoneInput primeiro, depois o indicativo, depois a língua, por fim PT", () => {
    expect(klarnaBillingCountry({ phoneCountry: "gb", phone: "+351 912 345 678", siteLang: "pt" })).toBe("GB");
    expect(klarnaBillingCountry({ phoneCountry: "", phone: "+49 170 1234567", siteLang: "pt" })).toBe("DE");
    expect(klarnaBillingCountry({ phone: "912345678", siteLang: "fr" })).toBe("FR");
    expect(klarnaBillingCountry({ siteLang: "sv" })).toBe("SE");
    expect(klarnaBillingCountry({ siteLang: "en" })).toBe("PT");
    expect(klarnaBillingCountry({})).toBe("PT");
    expect(klarnaBillingCountry({ phoneCountry: null, phone: null, siteLang: null })).toBe("PT");
  });
});

describe("língua da página da Klarna (preferred_locale da Stripe)", () => {
  it("a língua do hóspede no país quando a Stripe aceita o par; senão inglês no país; senão nada", () => {
    expect(klarnaPreferredLocale("pt", "PT")).toBe("pt-PT");
    expect(klarnaPreferredLocale("pt-PT", "PT")).toBe("pt-PT");
    expect(klarnaPreferredLocale("en", "PT")).toBe("en-PT");
    expect(klarnaPreferredLocale("es", "ES")).toBe("es-ES");
    expect(klarnaPreferredLocale("fr", "FR")).toBe("fr-FR");
    expect(klarnaPreferredLocale("it", "IT")).toBe("it-IT");
    expect(klarnaPreferredLocale("de", "DE")).toBe("de-DE");
    expect(klarnaPreferredLocale("de", "AT")).toBe("de-AT");
    expect(klarnaPreferredLocale("nl", "NL")).toBe("nl-NL");
    expect(klarnaPreferredLocale("en", "IE")).toBe("en-IE");
    expect(klarnaPreferredLocale("fr", "BE")).toBe("fr-BE");
    expect(klarnaPreferredLocale("sv", "FI")).toBe("sv-FI");
    // Sem par na Stripe: o inglês nesse país.
    expect(klarnaPreferredLocale("pt", "DE")).toBe("en-DE");
    expect(klarnaPreferredLocale("fi", "GR")).toBe("en-GR");
    expect(klarnaPreferredLocale("", "GR")).toBe("en-GR");
    // País que a Stripe não conhece ou inválido: nada (a Klarna escolhe).
    expect(klarnaPreferredLocale("pt", "BR")).toBeUndefined();
    expect(klarnaPreferredLocale("pt", "")).toBeUndefined();
    expect(klarnaPreferredLocale("pt", null)).toBeUndefined();
  });
});

describe("a marca da Klarna antes do email (PaymentMethodsNote)", () => {
  const alts = (total: number | null | undefined, country?: string | null) => paymentMarksFor(total, country).map((m) => m.alt);
  it("sem país: Portugal (a regra de sempre, 1 000 €)", () => {
    expect(alts(850)).toContain("Klarna");
    expect(alts(1000)).toContain("Klarna");
    for (const total of [1000.01, 2700, 0, null, undefined]) expect(alts(total), String(total)).not.toContain("Klarna");
  });
  it("com país: o tecto do país; fora da tabela, nunca", () => {
    expect(alts(2700, "DE")).toContain("Klarna");
    expect(alts(5000.01, "DE")).not.toContain("Klarna");
    expect(alts(2700, "fr")).toContain("Klarna");
    expect(alts(2700, "PT")).not.toContain("Klarna");
    expect(alts(850, "GB")).not.toContain("Klarna");
    expect(alts(850, "SE")).not.toContain("Klarna");
    expect(alts(2700, "GB")).toEqual(["Visa", "Mastercard", "American Express", "Apple Pay", "Google Pay", "PayPal"]);
  });
  it("a nota sem país decide pela língua do site; o passo 1 passa o país do telefone", () => {
    const note = read("client/src/components/booking/PaymentMethodsNote.tsx");
    expect(note).toMatch(/const klarnaCountry = country \?\? klarnaBillingCountry\(\{ siteLang: i18n\.language \}\);/);
    expect(note).toMatch(/paymentMarksFor\(total, klarnaCountry\)/);
    expect(read("client/src/pages/checkout/CheckoutPage.tsx")).toMatch(/<PaymentMethodsNote [^>]*country=\{klarnaCountry\} total=\{todayTotal\} \/>/);
  });
});

describe("o checkout manda o país real e confirma com o país que o servidor devolve", () => {
  it("o PhoneInput sobe o país do campo e o CheckoutPage calcula o país de faturação com ele", () => {
    const phoneInput = read("client/src/components/booking/PhoneInput.tsx");
    expect(phoneInput).toMatch(/onCountryChange\?: \(iso2: string\) => void;/);
    expect(phoneInput).toMatch(/onCountryChangeRef\.current\?\.\(country\.iso2\);/);
    const page = read("client/src/pages/checkout/CheckoutPage.tsx");
    expect(page).toMatch(/const klarnaCountry = klarnaBillingCountry\(\{ phoneCountry, phone, siteLang: lang \}\);/);
    expect(page).toMatch(/onCountryChange=\{setPhoneCountry\}/);
    expect(page).toMatch(/klarnaCountry=\{klarnaCountry\}/);
  });

  it("o separador da Klarna só aparece quando a Klarna se oferece no país e no valor; se deixar de se oferecer, volta ao cartão", () => {
    const form = read("client/src/components/booking/CheckoutPaymentForm.tsx");
    expect(form).toMatch(/const klarnaOk = klarnaAvailable\(klarnaCountry, Math\.round\(\(props\.otherMethodsTotal \?\? props\.total\) \* 100\)\);/);
    expect(form).toMatch(/if \(!klarnaOk && paymentMethod === "klarna"\) setPaymentMethod\("card"\);/);
    expect(form).toMatch(/id !== "googlepay" && \(id !== "klarna" \|\| klarnaOk\)/);
    expect(form).toMatch(/\{paymentMethod === "klarna" && !twoParts && klarnaOk && \(/);
    expect(form).toMatch(/billingCountry=\{klarnaCountry\}/);
  });

  it("o botão da Klarna já não força PT: manda o país e a língua ao servidor e confirma com o país devolvido", () => {
    const button = read("client/src/components/booking/KlarnaCheckoutButton.tsx");
    expect(button).not.toMatch(/country: "PT"/);
    expect(button).toMatch(/billingCountry,\s*locale: i18n\.language,/);
    expect(button).toMatch(/address: \{ country: confirmCountry \}/);
    expect(button).toMatch(/const confirmCountry = \(created as \{ billingCountry\?: string \}\)\.billingCountry \|\| billingCountry;/);
  });
});
