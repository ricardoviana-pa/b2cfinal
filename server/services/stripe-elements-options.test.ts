import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKOUT_SETUP_FUTURE_USAGE } from "@shared/stripeSetupFutureUsage";
import {
  EXPRESS_CHECKOUT_ELEMENT_OPTIONS,
  STRIPE_BUSINESS,
  STRIPE_CARD_APPEARANCE,
  STRIPE_FONTS,
  STRIPE_FONT_FAMILY,
  STRIPE_LABEL_FONT_SIZE,
  cardElementsOptions,
  expressCheckoutElementsOptions,
  paymentElementOptions,
} from "@/components/booking/stripeElementsOptions";
import { renderCardChangeMandate, renderTwoPartsMandate } from "./two-parts-mandate";

const ROOT = path.resolve(import.meta.dirname, "../..");
const readSrc = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

/**
 * Verificação em produção, 29 out 2026 (CK-STRIPE-MERCHANT-NAME): o texto do
 * cartão em carteira da Stripe dizia "you allow Ricardo Torres Viana, Lda to
 * charge your card for future payments", o nome da conta Stripe, que o site
 * nunca mostra; logo abaixo, a nossa autorização das duas partes diz
 * "I authorise Portugal Active to charge…". Duas partes diferentes para a
 * mesma cobrança futura. O nome mostrado passa a ser o da marca, num só sítio.
 */
describe("o nome do negócio que a Stripe mostra é o da marca, Portugal Active", () => {
  const LANGS = ["pt", "en", "fr", "es", "it", "de", "nl", "sv", "fi"];
  const form = readSrc("client/src/components/booking/CheckoutPaymentForm.tsx");
  const balance = readSrc("client/src/pages/booking/BalancePage.tsx");

  it("um só nome, o da marca, nunca o da conta", () => {
    expect(STRIPE_BUSINESS).toEqual({ name: "Portugal Active" });
    expect(readSrc("client/src/components/booking/stripeElementsOptions.ts")).toMatch(/export const STRIPE_BUSINESS = \{ name: "Portugal Active" \} as const;/);
  });

  it("o PaymentElement do checkout leva o nome, com o resto das opções como estava", () => {
    expect(paymentElementOptions({ legacyApplePay: false })).toEqual({
      layout: "tabs",
      wallets: { googlePay: "never", applePay: "never" },
      fields: { billingDetails: { address: { country: "never", postalCode: "never" } } },
      business: { name: "Portugal Active" },
    });
    // Legacy (sem intentId): o Apple Pay volta como aba; o Google Pay nunca.
    expect(paymentElementOptions({ legacyApplePay: true }).wallets).toEqual({ googlePay: "never", applePay: "auto" });
    expect(paymentElementOptions({ legacyApplePay: true }).business).toBe(STRIPE_BUSINESS);
  });

  it("o ExpressCheckoutElement (Apple Pay / Google Pay) leva o mesmo nome e continua só com wallets", () => {
    expect(EXPRESS_CHECKOUT_ELEMENT_OPTIONS.business).toBe(STRIPE_BUSINESS);
    expect(EXPRESS_CHECKOUT_ELEMENT_OPTIONS.paymentMethods).toEqual({
      applePay: "auto", googlePay: "auto", link: "never", klarna: "never", paypal: "never", amazonPay: "never",
    });
    expect(EXPRESS_CHECKOUT_ELEMENT_OPTIONS.layout).toEqual({ maxColumns: 2, maxRows: 1 });
  });

  /**
   * Revisão do #188 (R1): segundo a documentação da Stripe, passar `business`
   * (ou allowedShippingCountries, phoneNumberRequired, shippingAddressRequired,
   * emailRequired, applePay ou lineItems) ao criar o Express Checkout Element
   * faz o `billingAddressRequired` passar de true (o que o main tinha, só com
   * paymentMethods e layout) para false. A folha do Apple Pay / Google Pay
   * deixava de pedir a morada de faturação e a Stripe perdia a verificação de
   * morada e os sinais do Radar. Fica explícito, para só mudar o nome mostrado.
   */
  it("a folha das wallets continua a pedir a morada de faturação (a Stripe desliga-a quando se passa `business`)", () => {
    expect(EXPRESS_CHECKOUT_ELEMENT_OPTIONS.billingAddressRequired).toBe(true);
    // As únicas chaves: as duas do main, o nome e a morada que o nome desligaria.
    expect(Object.keys(EXPRESS_CHECKOUT_ELEMENT_OPTIONS).sort()).toEqual(["billingAddressRequired", "business", "layout", "paymentMethods"]);
  });

  /**
   * Revisão do #188 (RISK-ECE-CLICK-RESOLVE): o nome vai só pela opção de
   * criação do Element (a que a Stripe documenta); o `business` no resolve do
   * clique está deprecado no stripe-js 10.2 e registar um handler de clique
   * mete a Stripe à espera do resolve antes de abrir a folha, no caminho do
   * dinheiro das wallets, que não se exercita localmente. Sem handler de
   * clique, sem segundo caminho.
   */
  it("sem handler de clique nas wallets: o nome vai só pela opção de criação", () => {
    const options = readSrc("client/src/components/booking/stripeElementsOptions.ts");
    expect(options).not.toMatch(/EXPRESS_CHECKOUT_CLICK_DETAILS|ClickResolveDetails|\bresolve\(/);
    const ece = form.match(/<ExpressCheckoutElement\b([\s\S]*?)\/>/);
    expect(ece, "o checkout monta o ExpressCheckoutElement").not.toBeNull();
    expect(ece![1]).not.toMatch(/onClick|resolve\(/);
    expect(form).not.toMatch(/EXPRESS_CHECKOUT_CLICK_DETAILS/);
  });

  it("o checkout monta os dois Elements com estas opções (não com literais próprios)", () => {
    expect(form).toMatch(/const paymentOptions = useMemo\(\(\) => paymentElementOptions\(\{ legacyApplePay: !intentId \}\), \[intentId\]\);/);
    expect(form).toMatch(/<PaymentElement options=\{paymentOptions\} \/>/);
    expect(form).toMatch(/<ExpressCheckoutElement\s+options=\{EXPRESS_CHECKOUT_ELEMENT_OPTIONS\}\s+onReady=/);
    expect(form).not.toMatch(/options=\{\{\s*layout: "tabs"/);
    expect(form).not.toMatch(/paymentMethods: \{ applePay/);
  });

  it("o checkout NÃO esconde o texto da Stripe: no plano «tudo agora» é o único aviso de cartão em carteira", () => {
    expect(form).not.toMatch(/terms:\s*\{\s*card:\s*"never"/);
  });

  it("o cartão novo da página do saldo leva o mesmo nome", () => {
    expect(balance).toMatch(/<PaymentElement\s+options=\{\{[\s\S]{0,600}?business: STRIPE_BUSINESS,[\s\S]{0,200}?\}\}/);
  });

  it("o mandato das duas partes e o do cartão novo nomeiam a mesma parte, nas 9 línguas", () => {
    const v = {
      amountLaterCents: 126_200,
      chargeAt: new Date("2027-07-01T09:00:00.000Z"),
      retryAt: [new Date("2027-07-02T09:00:00.000Z"), new Date("2027-07-04T09:00:00.000Z")],
      freeCancelDeadlineAt: new Date("2027-07-08T22:59:00.000Z"),
    };
    for (const lang of LANGS) {
      const m = renderTwoPartsMandate(lang, v);
      expect(m.checkbox, lang).toContain(STRIPE_BUSINESS.name);
      expect(m.text, lang).toContain(STRIPE_BUSINESS.name);
      expect(renderCardChangeMandate(lang, v).text, lang).toContain(STRIPE_BUSINESS.name);
    }
  });
});

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
        rules: { ".p-PaymentMethodSelector": { display: "none" }, ".Label": { fontSize: STRIPE_LABEL_FONT_SIZE } },
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

/**
 * Revisão do #181 (B1): com a DM Sans aos 14,88 px que a Stripe dá às
 * etiquetas, a validade e o código de segurança deixavam de caber lado a lado
 * nos telemóveis e empilhavam-se (o cartão crescia até 99 px e empurrava os
 * Termos e o Pagar). A Stripe decide pela largura do que está escrito em cada
 * coluna e, uma vez empilhado, não volta atrás quando o espaço aumenta.
 *
 * Largura mínima (px) do sítio onde o PaymentElement monta que ainda põe os
 * dois campos lado a lado, por língua e tamanho das etiquetas (o iframe da
 * Stripe tem mais 8 px, 4 de cada lado). Medida a 29 out 2026 no checkout real
 * (Chrome, telemóvel, conta e Stripe.js de produção), cada leitura num
 * Payment Element novo, com os textos da própria Stripe. "times" é a produção
 * antes do #181 (a letra caía para Times). No checkout e no cartão novo da
 * página do saldo esse sítio tem viewport − 108 px: 252, 267, 282 e 306 px a
 * 360, 375, 390 e 414 (medido no checkout; o saldo tem as mesmas margens).
 */
const SIDE_BY_SIDE_MIN_WIDTH: Record<string, Record<string, number>> = {
  times: { pt: 262, en: 270, es: 259, fr: 348, de: 281, it: 256, nl: 276, sv: 232, fi: 301 },
  "14.88px": { pt: 305, en: 277, es: 299, fr: 374, de: 310, it: 280, nl: 306, sv: 264, fi: 320 },
  "14px": { pt: 288, en: 262, es: 282, fr: 354, de: 293, it: 264, nl: 289, sv: 252, fi: 302 },
  "13.5px": { pt: 279, en: 254, es: 273, fr: 343, de: 283, it: 257, nl: 279, sv: 244, fi: 292 },
  "13px": { pt: 270, en: 246, es: 265, fr: 333, de: 274, it: 249, nl: 271, sv: 237, fi: 281 },
  "12.5px": { pt: 262, en: 235, es: 254, fr: 317, de: 263, it: 238, nl: 260, sv: 229, fi: 271 },
  "12px": { pt: 253, en: 226, es: 244, fr: 304, de: 253, it: 229, nl: 250, sv: 222, fi: 261 },
};
/** Folga mínima sobre o Times: as letras não medem igual em todos os aparelhos. */
const MARGIN_PX = 5;
/** Línguas cujo cartão precisa de mais largura do que no Times (menos a folga). */
const regressions = (size: string) =>
  Object.keys(SIDE_BY_SIDE_MIN_WIDTH.times).filter((l) => SIDE_BY_SIDE_MIN_WIDTH[size][l] > SIDE_BY_SIDE_MIN_WIDTH.times[l] - MARGIN_PX);
/** Telemóveis (360–414 px) onde o Times punha os dois campos lado a lado e este tamanho não. */
function lostOnPhones(size: string): string[] {
  const lost: string[] = [];
  for (const vw of [360, 375, 390, 414]) {
    const w = vw - 108;
    for (const [lang, times] of Object.entries(SIDE_BY_SIDE_MIN_WIDTH.times)) {
      if (w >= times && w < SIDE_BY_SIDE_MIN_WIDTH[size][lang]) lost.push(`${vw} ${lang}`);
    }
  }
  return lost;
}

describe("Elements do cartão: validade e código de segurança lado a lado nos telemóveis", () => {
  it("as etiquetas têm um tamanho medido que nunca empilha onde o Times ficava lado a lado (com folga)", () => {
    const size = STRIPE_CARD_APPEARANCE.rules[".Label"].fontSize;
    expect(size).toBe(STRIPE_LABEL_FONT_SIZE);
    expect(SIDE_BY_SIDE_MIN_WIDTH[size], `${size} nunca foi medido no checkout real`).toBeDefined();
    expect(regressions(size)).toEqual([]);
  });

  it("nos telemóveis (360–414 px) o cartão do checkout e o da página do saldo ficam lado a lado onde ficavam", () => {
    expect(lostOnPhones(STRIPE_LABEL_FONT_SIZE)).toEqual([]);
  });

  it("os outros tamanhos não chegavam: 14,88 px (o PR antes da revisão), 13 px (a sugestão da revisão) e 12,5 px (sem folga)", () => {
    expect(regressions("14.88px")).toEqual(["pt", "en", "es", "fr", "de", "it", "nl", "sv", "fi"]);
    // O que a revisão viu a 390 px (pt, es, de, nl) e o resto dos telemóveis.
    expect(lostOnPhones("14.88px")).toEqual(["360 sv", "375 pt", "375 es", "375 it", "390 pt", "390 es", "390 de", "390 nl", "414 de", "414 fi"]);
    expect(lostOnPhones("13px")).toEqual(["375 pt"]);
    expect(lostOnPhones("12.5px")).toEqual([]);
    expect(regressions("12.5px")).toEqual(["pt", "sv"]);
  });

  it("o checkout e a página do saldo usam a mesma regra; o texto dos campos fica nos 16 px (zoom do iPhone)", () => {
    expect(cardElementsOptions(2700, "EUR", "pt").appearance.rules[".Label"]).toEqual({ fontSize: STRIPE_LABEL_FONT_SIZE });
    expect(STRIPE_CARD_APPEARANCE.variables).not.toHaveProperty("fontSizeBase");
    expect(STRIPE_CARD_APPEARANCE.rules).not.toHaveProperty(".Input");
  });
});
