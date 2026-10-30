import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  COMPANY_ADDRESS,
  COMPANY_LEGAL_NAME,
  COMPANY_NIPC,
  companyAddressLine,
  companyIdentityLine,
  companyLegalLine,
} from "@shared/company";
import { paymentPlanLine } from "@/pages/checkout/PreContractualBlock";

/**
 * Identidade legal numa só fonte (shared/company.ts) e o bloco pré-contratual
 * do checkout (DL 24/2014, arts. 4.º e 5.º): empresa e NIPC, preço total, o
 * plano de pagamento numa linha, a frase da política (a única do ecrã) e a
 * nota de que não há livre resolução. Também no rodapé do site e dos emails.
 */
const read = (p: string) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const LANGS = ["en", "pt", "fr", "es", "it", "de", "nl", "sv", "fi"] as const;
const locale = (lang: string) => JSON.parse(read(`client/src/i18n/locales/${lang}.json`));
const placeholders = (s: string) =>
  (s.match(/\{\{\s*\w+\s*(?:,[^}]*)?\}\}/g) ?? []).map((p) => p.replace(/\s/g, "").replace(/,[^}]*/, "")).sort();
const BANNED = /insurance|seguro|assurance|versicherung|assicurazion|verzekering|försäkring|vakuutus|\bhotel|sinal|dep[oó]sito|presta[cç][oõ]es/i;

describe("shared/company.ts: uma só fonte", () => {
  it("denominação e NIPC do Ricardo; a sede fica vazia até ele a confirmar", () => {
    expect(COMPANY_LEGAL_NAME).toBe("Ricardo Torres Viana LDA");
    expect(COMPANY_NIPC).toBe("515363685");
    expect(COMPANY_NIPC).toMatch(/^\d{9}$/);
    expect(COMPANY_ADDRESS).toBe("");
    expect(companyAddressLine()).toBeNull();
    expect(companyIdentityLine()).toBe("Ricardo Torres Viana LDA · NIPC 515363685");
    // sem sede confirmada a linha legal não inventa morada nenhuma
    expect(companyLegalLine()).toBe(companyIdentityLine());
  });

  it("o rodapé do site, o rodapé dos emails e o checkout leem daqui (nunca escrevem a empresa à mão)", () => {
    const footer = read("client/src/components/layout/Footer.tsx");
    expect(footer).toMatch(/from '@shared\/company'/);
    expect(footer).toMatch(/t\('legalFooter\.operatedBy', \{ company: COMPANY_LEGAL_NAME, nipc: COMPANY_NIPC \}\)/);
    expect(footer).toMatch(/companyAddressLine\(\) \? ` · \$\{companyAddressLine\(\)\}` : ''/);
    const email = read("server/services/transactional-email.ts");
    expect(email).toMatch(/import \{ companyLegalLine \} from "@shared\/company"/);
    expect(email).toMatch(/\$\{companyLegalLine\(\)\}<\/p>\s*\n<\/td><\/tr>`;\s*\n\}/);
    const block = read("client/src/pages/checkout/PreContractualBlock.tsx");
    expect(block).toMatch(/from "@shared\/company"/);
    const form = read("client/src/components/booking/CheckoutPaymentForm.tsx");
    expect(form).toMatch(/from "@shared\/company"/);
    for (const src of [footer, email, block, form, read("client/src/pages/checkout/CheckoutPage.tsx")]) {
      expect(src).not.toMatch(/515363685/);
      expect(src).not.toMatch(/Torres Viana/);
    }
  });
});

describe("bloco pré-contratual acima do botão de pagar", () => {
  const page = read("client/src/pages/checkout/CheckoutPage.tsx");
  const block = read("client/src/pages/checkout/PreContractualBlock.tsx");

  it("vive no consent (todos os planos e métodos), antes da caixa dos Termos, e leva a única frase de política do passo", () => {
    const consent = page.slice(page.indexOf("const consentBlock = ("), page.indexOf('id="checkout-terms"'));
    expect(consent).toMatch(/<PreContractualBlock\s/);
    expect(consent).toMatch(/total=\{twoParts \? todayTotal : payTotal\}/);
    expect(consent).toMatch(/amountNow=\{payTotal\}/);
    expect(consent).toMatch(/amountLater=\{twoParts && offer \? offer\.balanceCents \/ 100 : null\}/);
    expect(consent).toMatch(/laterDate=\{twoParts && offer \? planLaterDate : null\}/);
    // a frase da política saiu do consent (vive dentro do bloco: uma por ecrã)
    const afterTerms = page.slice(page.indexOf('id="checkout-terms"'), page.indexOf("const conciergeHref"));
    expect(afterTerms).not.toMatch(/<CancellationPolicyLine/);
    expect(block).toMatch(/<CancellationPolicyLine code=\{policyCode\} checkIn=\{checkIn\} lang=\{lang\}/);
    // o cartão (prop `consent` do formulário, real e demo), o PayPal e o Klarna recebem o mesmo consent
    expect(page).toMatch(/consent=\{consentBlock\}/);
    const form = read("client/src/components/booking/CheckoutPaymentForm.tsx");
    expect(form).toMatch(/consent=\{props\.consent\}/);
    expect(form).toMatch(/paymentMethod === "paypal" && !twoParts && \(\s*<div className="space-y-3">[\s\S]{0,160}?\{props\.consent\}\s*<PayPalCheckoutButton/);
    expect(form).toMatch(/paymentMethod === "klarna" && !twoParts && \(\s*<div className="space-y-3">[\s\S]{0,160}?\{props\.consent\}\s*<KlarnaCheckoutButton/);
  });

  it("as wallets (à cabeça do ecrã, pagam tudo hoje) levam os mesmos factos na sua linha dos Termos: empresa, NIPC e total", () => {
    const form = read("client/src/components/booking/CheckoutPaymentForm.tsx");
    const line = form.slice(form.indexOf("function WalletsAcceptLine("), form.indexOf("/** Policy acceptance object"));
    expect(line).toMatch(/t\("checkout\.legal\.operator", \{ company: COMPANY_LEGAL_NAME, nipc: COMPANY_NIPC \}\)/);
    expect(line).toMatch(/\{address \? ` · \$\{address\}` : ""\}/);
    expect(line).toMatch(/t\("checkout\.legal\.total", \{ total: amount \}\)/);
    expect(line).toMatch(/t\("checkout\.legal\.payFull", \{ amount \}\)/);
    expect(line).toMatch(/payment\.walletsAcceptPrefix/);
    expect(line).toMatch(/\/legal\/terms[\s\S]*\/legal\/cancellation-policy/);
    // a frase da política e a nota da livre resolução ficam no bloco (uma vez por ecrã)
    expect(line).not.toMatch(/CancellationPolicyLine|noWithdrawal/);
    expect(line).not.toMatch(/text-\[#9E9A90\]|text-\[#8B7355\]|text-pa-gold["\s]/);
    // a linha recebe o total que a wallet cobra, na Stripe e na demo
    expect(form).toMatch(/<WalletsAcceptLine lang=\{i18n\.language\} total=\{total\} \/>/);
    expect(form).toMatch(/<WalletsAcceptLine lang=\{i18n\.language\} total=\{props\.total\} \/>/);
  });

  it("empresa e NIPC, total, plano numa linha e a nota da livre resolução, em letra pequena", () => {
    expect(block).toMatch(/t\("checkout\.legal\.operator", \{ company: COMPANY_LEGAL_NAME, nipc: COMPANY_NIPC \}\)/);
    expect(block).toMatch(/\{address \? ` · \$\{address\}` : ""\}/);
    expect(block).toMatch(/t\("checkout\.legal\.total", \{ total: formatQuotedEur\(total, lang\) \}\)/);
    expect(block).toMatch(/t\("checkout\.legal\.noWithdrawal"\)/);
    expect(block).toMatch(/className="caption text-pa-stone-aa leading-snug"/);
    expect(block).not.toMatch(/text-\[#9E9A90\]|text-\[#8B7355\]|text-pa-gold["\s]/);
  });

  it("a linha do plano: 'X hoje' ou 'X hoje · Y em <data>'", () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const t = (key: string, options?: Record<string, unknown>) => { calls.push([key, options]); return key; };
    expect(paymentPlanLine(t, { lang: "pt", amountNow: 2700 })).toBe("checkout.legal.payFull");
    expect(calls[0][1]).toEqual({ amount: expect.stringMatching(/2700|2\s?700/) });
    expect(paymentPlanLine(t, { lang: "en", amountNow: 1350, amountLater: 1350, laterDate: "28 June 2027" })).toBe("checkout.legal.paySplit");
    expect(calls[1][1]).toEqual({ amountNow: expect.stringContaining("1,350"), amountLater: expect.stringContaining("1,350"), date: "28 June 2027" });
    // sem 2.ª parte (0 ou sem data) é "tudo hoje"
    expect(paymentPlanLine(t, { lang: "en", amountNow: 2700, amountLater: 0, laterDate: "x" })).toBe("checkout.legal.payFull");
    expect(paymentPlanLine(t, { lang: "en", amountNow: 2700, amountLater: 1350, laterDate: null })).toBe("checkout.legal.payFull");
  });
});

describe("as frases nas 9 línguas (formais, sem vocabulário proibido)", () => {
  it.each(LANGS)("%s", (lang) => {
    const l = locale(lang);
    const legal = l.checkout.legal;
    expect(placeholders(legal.operator)).toEqual(["{{company}}", "{{nipc}}"]);
    expect(legal.operator).toContain("Portugal Active");
    expect(placeholders(legal.total)).toEqual(["{{total}}"]);
    expect(placeholders(legal.payFull)).toEqual(["{{amount}}"]);
    expect(placeholders(legal.paySplit)).toEqual(["{{amountLater}}", "{{amountNow}}", "{{date}}"]);
    expect(legal.noWithdrawal).toMatch(/14/);
    expect(placeholders(legal.noWithdrawal)).toEqual([]);
    expect(l.legalFooter.operatedBy).toBe(legal.operator);
    for (const s of [legal.operator, legal.total, legal.payFull, legal.paySplit, legal.noWithdrawal, l.payment.walletsAcceptPrefix]) {
      expect(s, s).not.toMatch(BANNED);
    }
    // a linha das wallets compõe-se com os links já traduzidos dos Termos e da política
    expect(l.payment.walletsAcceptPrefix).toBeTruthy();
    expect(l.payment.walletsHint).toBeUndefined();
    expect(l.bookingWidget.termsLink).toBeTruthy();
    expect(l.bookingWidget.termsAnd).toBeTruthy();
    expect(l.bookingWidget.cancellationPolicyLink).toBeTruthy();
  });

  it("italiano no registo formal (Lei); português europeu", () => {
    const it_ = locale("it").checkout.legal;
    for (const s of [it_.operator, it_.noWithdrawal, locale("it").payment.walletsAcceptPrefix]) {
      expect(s).not.toMatch(/\b(tuo|tua|ti|accetti)\b/i);
    }
    expect(locale("pt").checkout.legal.noWithdrawal).toMatch(/livre resolução/);
    expect(locale("pt").payment.walletsAcceptPrefix).toBe("Ao pagar, aceita os");
  });
});
