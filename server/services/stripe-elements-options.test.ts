import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKOUT_SETUP_FUTURE_USAGE } from "@shared/stripeSetupFutureUsage";
import {
  STRIPE_CARD_APPEARANCE,
  STRIPE_FONTS,
  STRIPE_FONT_FAMILY,
  cardElementsOptions,
  expressCheckoutElementsOptions,
} from "@/components/booking/stripeElementsOptions";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("Elements das wallets (Apple Pay / Google Pay)", () => {
  // A Stripe recusa o confirm quando o setupFutureUsage do Elements não é o
  // setup_future_usage do PaymentIntent; as wallets ficaram assim de 29 ago a
  // 29 out 2026 (o servidor cria sempre com CHECKOUT_SETUP_FUTURE_USAGE).
  it("espelha o setup_future_usage do PaymentIntent", () => {
    expect(CHECKOUT_SETUP_FUTURE_USAGE).toBe("off_session");
    expect(expressCheckoutElementsOptions(2700, "EUR", "pt")).toMatchObject({
      mode: "payment",
      amount: 270000,
      currency: "eur",
      locale: "pt",
      setupFutureUsage: CHECKOUT_SETUP_FUTURE_USAGE,
    });
  });

  it("arredonda ao cêntimo e usa eur sem moeda", () => {
    expect(expressCheckoutElementsOptions(1234.565, undefined, "en")).toMatchObject({ amount: 123457, currency: "eur" });
  });
});

/**
 * Verificação em produção, 29 out 2026 (Real:CK-I18N-1): os campos do cartão
 * saíam em Times em todas as línguas. O fontFamily era
 * "var(--font-body), Arial, sans-serif"; dentro do iframe da Stripe a
 * variável não existe, o valor fica vazio e a declaração cai inteira.
 */
describe("Elements do cartão: a letra do site dentro do iframe da Stripe", () => {
  it("o fontFamily é a DM Sans por extenso, nunca uma var()", () => {
    const o = cardElementsOptions(2700, "EUR", "pt");
    expect(STRIPE_FONT_FAMILY).toBe('"DM Sans", system-ui, sans-serif');
    expect(o.appearance.variables.fontFamily).toBe(STRIPE_FONT_FAMILY);
    expect(o.appearance.variables.fontFamily).not.toMatch(/var\(/);
  });

  it("carrega a DM Sans em `fonts`, do Google Fonts (CORS), com as espessuras do site", () => {
    const o = cardElementsOptions(2700, "EUR", "pt");
    expect(o.fonts).toEqual([{ cssSrc: expect.stringMatching(/^https:\/\/fonts\.googleapis\.com\/css2\?/) }]);
    const url = new URL(STRIPE_FONTS[0].cssSrc);
    expect(url.searchParams.get("family")).toBe("DM Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600");
    expect(url.searchParams.get("display")).toBe("swap");
    // As mesmas espessuras que a página carrega (client/index.html).
    expect(fs.readFileSync(path.join(ROOT, "client/index.html"), "utf8")).toContain(
      "family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600",
    );
  });

  it("`fonts` é sempre o mesmo objeto: o react-stripe-js não deixa mudá-lo depois de montar", () => {
    const a = cardElementsOptions(2700, "EUR", "pt");
    const b = cardElementsOptions(1350, "eur", "it");
    expect(a.fonts).toBe(STRIPE_FONTS);
    expect(b.fonts).toBe(a.fonts);
  });

  it("o resto das opções do cartão fica igual", () => {
    expect(cardElementsOptions(1234.565, undefined, "en")).toMatchObject({
      mode: "payment",
      amount: 123457,
      currency: "eur",
      paymentMethodCreation: "manual",
      locale: "en",
      setupFutureUsage: CHECKOUT_SETUP_FUTURE_USAGE,
      paymentMethodTypes: ["card"],
      appearance: {
        theme: "stripe",
        variables: { colorPrimary: "#1A1A18", colorBackground: "#ffffff", colorText: "#1A1A18", borderRadius: "4px" },
        rules: { ".p-PaymentMethodSelector": { display: "none" } },
      },
    });
  });

  it("a página do saldo usa a mesma aparência e as mesmas letras no cartão novo", () => {
    const src = fs.readFileSync(path.join(ROOT, "client/src/pages/booking/BalancePage.tsx"), "utf8");
    expect(src).toContain("appearance: STRIPE_CARD_APPEARANCE, fonts: STRIPE_FONTS");
    expect(STRIPE_CARD_APPEARANCE.variables.fontFamily).toBe(STRIPE_FONT_FAMILY);
  });

  it("nenhuma aparência da Stripe no cliente volta a usar var() no fontFamily", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
      }
    };
    walk(path.join(ROOT, "client/src"));
    const offenders = files.filter((f) => {
      const src = fs.readFileSync(f, "utf8");
      return /@stripe\/|stripeElementsOptions/.test(src) && /fontFamily:\s*["'`][^"'`]*var\(/.test(src);
    });
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});
