import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { consentChecked, consentToSend, stayContinueAction } from "@/lib/checkoutStay";
import { KLARNA_MAX_EUR, PAYMENT_MARKS, paymentMarksFor } from "@/components/booking/PaymentMethodsNote";

/**
 * Passo 1 do checkout e o que o rodeia (auditoria do funil, 29 out 2026,
 * n.º 2, e os "em falta" do crítico: contexto no telemóvel, meios de
 * pagamento antes do portão do email, contacto humano, banner de cookies).
 */

const read = (p: string) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const LANGS = ["en", "pt", "fr", "es", "it", "de", "nl", "sv", "fi"] as const;
const locale = (lang: string) => JSON.parse(read(`client/src/i18n/locales/${lang}.json`));
// "{{date, al}}" (formatador do artigo italiano) é o mesmo marcador {{date}}.
const placeholders = (s: string) =>
  (s.match(/\{\{\s*\w+\s*(?:,[^}]*)?\}\}/g) ?? []).map((p) => p.replace(/\s/g, "").replace(/,[^}]*/, "")).sort();
const BANNED = /insurance|seguro|assurance|versicherung|assicurazion|verzekering|försäkring|vakuutus|\bhotel|sinal|dep[oó]sito|presta[cç][oõ]es/i;

describe("o Continuar do passo 1 nunca fica parado", () => {
  const base = { emailValid: true, quoteStale: false, datesUnavailable: false, saving: false };

  it("com email válido grava e segue", () => {
    expect(stayContinueAction(base)).toBe("submit");
  });

  it("sem email válido leva ao campo (foco e dica), em vez de não fazer nada", () => {
    expect(stayContinueAction({ ...base, emailValid: false })).toBe("focus_email");
  });

  it("preço expirado ou datas ocupadas levam ao aviso que diz o que fazer", () => {
    expect(stayContinueAction({ ...base, quoteStale: true })).toBe("refresh_price");
    expect(stayContinueAction({ ...base, emailValid: false, quoteStale: true })).toBe("refresh_price");
    expect(stayContinueAction({ ...base, datesUnavailable: true, quoteStale: true })).toBe("dates_unavailable");
  });

  it("durante a gravação, um segundo toque não grava outra vez", () => {
    expect(stayContinueAction({ ...base, saving: true })).toBe("busy");
  });

  it("os dois botões (barra do telemóvel e cartão do email) usam esta regra e nenhum fica desativado pelo email", () => {
    const page = read("client/src/pages/checkout/CheckoutPage.tsx");
    expect(page.match(/onClick=\{continueFromStay\}/g)?.length).toBe(2);
    expect(page).not.toMatch(/disabled=\{!isValidEmail\(email\)/);
    expect(page).toMatch(/focusField\("checkout-email"\)/);
    expect(page).toMatch(/id="checkout-refresh-price"/);
    expect(page).toMatch(/id="checkout-change-dates"/);
  });
});

describe("a caixa de marketing volta como o hóspede a deixou", () => {
  const ana = "ana@example.com";

  it("sem lhe mexer e sem saber como estava, não se envia nada (o servidor não retira o consentimento)", () => {
    expect(consentToSend({ checked: false, touched: false, restoredFor: null, email: ana })).toBeUndefined();
    expect(consentChecked({ checked: false, touched: false, restoredFor: null, email: ana })).toBe(false);
  });

  it("reposta do servidor para este email, envia-se e mostra-se o estado reposto", () => {
    expect(consentToSend({ checked: true, touched: false, restoredFor: ana, email: ana })).toBe(true);
    expect(consentToSend({ checked: false, touched: false, restoredFor: ana, email: ana })).toBe(false);
    expect(consentChecked({ checked: true, touched: false, restoredFor: ana, email: ana })).toBe(true);
    // a BD compara sem maiúsculas: o mesmo endereço escrito de outra forma
    expect(consentToSend({ checked: true, touched: false, restoredFor: ana, email: " Ana@Example.com " })).toBe(true);
  });

  it("com outro email no campo, o consentimento reposto não passa: nada se envia e a caixa aparece desmarcada (revisão do PR #176)", () => {
    // um link de recuperação reencaminhado, um aparelho partilhado: o email muda no passo 1
    const other = { checked: true, touched: false, restoredFor: ana, email: "rui@example.com" };
    expect(consentToSend(other)).toBeUndefined();
    expect(consentChecked(other)).toBe(false);
    // e volta se o email voltar a ser o do consentimento
    expect(consentChecked({ ...other, email: ana })).toBe(true);
  });

  it("mexida pelo hóspede, vence sempre o último estado", () => {
    expect(consentToSend({ checked: false, touched: true, restoredFor: ana, email: ana })).toBe(false);
    expect(consentToSend({ checked: true, touched: true, restoredFor: null, email: ana })).toBe(true);
    expect(consentToSend({ checked: false, touched: true, restoredFor: null, email: ana })).toBe(false);
    // marcada nesta sessão, com o email que está no campo quando carrega em Continuar
    expect(consentToSend({ checked: true, touched: true, restoredFor: ana, email: "rui@example.com" })).toBe(true);
    expect(consentChecked({ checked: true, touched: true, restoredFor: ana, email: "rui@example.com" })).toBe(true);
  });

  it("nunca vem marcada por omissão, e o ecrã usa estas regras", () => {
    const page = read("client/src/pages/checkout/CheckoutPage.tsx");
    expect(page).toMatch(/const \[newsletterOptIn, setNewsletterOptIn\] = useState\(false\);/);
    expect(page).toMatch(/setConsentRestoredFor\(intent\.email\);/);
    expect(page).toMatch(/consentToSend\(\{ checked: newsletterOptIn, touched: newsletterTouched, restoredFor: consentRestoredFor, email \}\)/);
    expect(page).toMatch(/checked=\{consentChecked\(\{ checked: newsletterOptIn, touched: newsletterTouched, restoredFor: consentRestoredFor, email \}\)\}/);
  });
});

describe("os textos do email no passo 1", () => {
  // Revisão do PR #176: o título novo ("O seu email") e a nota dos lembretes
  // esperam o OK do André; o main vai direto para produção, por isso ficam
  // os de produção até lá. As frases da nota já estão prontas nas 9 línguas.
  it("título e rótulo como em produção; a nota ainda não se mostra", () => {
    const page = read("client/src/pages/checkout/CheckoutPage.tsx");
    expect(page).toMatch(/\{t\("checkout\.emailTitle", "Where should we send your booking\?"\)\}/);
    expect(page).toMatch(/<label htmlFor="checkout-email" className="block caption font-medium text-pa-earth">\s*\{t\("checkout\.emailLabel", "Your email"\)\}/);
    expect(page).not.toMatch(/t\("checkout\.(emailHoldNote|emailReminderNote)"/);
    expect(locale("pt").checkout.emailTitle).toBe("Para onde enviamos a sua reserva?");
  });

  it("a nota (por ligar depois do OK do André) diz que o preço fica guardado e que pode haver lembretes, nas 9 línguas", () => {
    const reminder: Record<string, RegExp> = {
      en: /reminder/i, pt: /lembrete/i, fr: /rappel/i, es: /recordatorio/i, it: /promemoria/i,
      de: /erinnerung/i, nl: /herinnering/i, sv: /påminnelse/i, fi: /muistut/i,
    };
    const noSpam = /spam|roskaposti/i;
    for (const lang of LANGS) {
      const c = locale(lang).checkout;
      expect(placeholders(c.emailHoldNote), lang).toEqual(["{{date}}", "{{time}}"]);
      expect(placeholders(c.emailReminderNote), lang).toEqual([]);
      for (const note of [c.emailHoldNote, c.emailReminderNote]) {
        expect(note, lang).toMatch(reminder[lang]);
        expect(note, lang).toMatch(noSpam);
        expect(note, lang).not.toMatch(BANNED);
      }
    }
  });

  it("o resumo de preço só do telemóvel saiu do passo 1 (está em Ver detalhes); o preço garantido fica", () => {
    const page = read("client/src/pages/checkout/CheckoutPage.tsx");
    expect(page).not.toMatch(/<div className="lg:hidden bg-white border border-pa-sand rounded-lg p-5">\{summaryLines\}<\/div>/);
    expect(page).toMatch(/\{guaranteeLabel && \(/);
    // a ordem da spec §4 mantém-se: tarifas antes do email
    expect(page.indexOf("{rateChoice}")).toBeLessThan(page.indexOf('id="checkout-email"'));
  });
});

describe("meios de pagamento e 'ainda não é cobrado' antes do portão do email", () => {
  it("cartões, Apple Pay, Google Pay, PayPal e Klarna, com as marcas oficiais do rodapé", () => {
    expect(PAYMENT_MARKS.map((m) => m.alt)).toEqual(["Visa", "Mastercard", "American Express", "Apple Pay", "Google Pay", "PayPal", "Klarna"]);
    for (const m of PAYMENT_MARKS) {
      expect(fs.existsSync(new URL(`../../client/public${m.src}`, import.meta.url)), m.src).toBe(true);
    }
  });

  it("a Klarna só aparece quando o total cabe no limite dela (país PT: Pay in 3 até 1 000 €; revisão do PR #176)", () => {
    const alts = (total: number | null | undefined) => paymentMarksFor(total).map((m) => m.alt);
    expect(KLARNA_MAX_EUR).toBe(1000);
    expect(alts(850)).toContain("Klarna");
    expect(alts(1000)).toContain("Klarna");
    for (const total of [1000.01, 2700, 12500, 0, null, undefined]) expect(alts(total), String(total)).not.toContain("Klarna");
    // o resto da linha fica sempre
    expect(alts(2700)).toEqual(["Visa", "Mastercard", "American Express", "Apple Pay", "Google Pay", "PayPal"]);
    // o widget e o passo 1 passam o total que a Klarna cobraria
    expect(read("client/src/components/booking/BookingWidget.tsx")).toMatch(/<PaymentMethodsNote align="center" total=\{effectiveQuote\?\.total\} \/>/);
    expect(read("client/src/pages/checkout/CheckoutPage.tsx")).toMatch(/<PaymentMethodsNote [^>]*total=\{todayTotal\} \/>/);
  });

  it("debaixo do Reservar do widget (preso com ele no computador) e no passo 1", () => {
    const widget = read("client/src/components/booking/BookingWidget.tsx");
    const cta = widget.indexOf('<div className="pa-reserve-cta bg-white space-y-2.5">');
    expect(cta).toBeGreaterThan(-1);
    const note = widget.indexOf("<PaymentMethodsNote", cta);
    const close = widget.indexOf("</div>", widget.indexOf("</button>", cta));
    expect(note).toBeGreaterThan(cta);
    expect(note).toBeLessThan(close);
    expect(read("client/src/pages/checkout/CheckoutPage.tsx")).toMatch(/<PaymentMethodsNote /);
  });

  it("as frases existem nas 9 línguas e não usam vocabulário proibido", () => {
    for (const lang of LANGS) {
      const p = locale(lang).payment;
      expect(p.methodsAccepted, lang).toBeTruthy();
      expect(p.notChargedYet, lang).toBeTruthy();
      expect(p.notChargedYet, lang).not.toMatch(BANNED);
    }
  });
});

describe("italiano: os textos novos no registo formal (Lei), como as outras línguas (revisão do PR #176)", () => {
  const it_ = locale("it");
  const get = (k: string) => k.split(".").reduce<any>((o, p) => o?.[p], it_) as string;
  const KEYS = [
    ...["digits", "digitsRange", "leadingZero", "tooShort", "tooLong", "countryCode"].map((k) => `bookingWidget.phoneErrors.${k}`),
    ...["declinedLimit", "declinedGeneric", "cardExpired", "cardNotSupported", "incorrectCvc", "incorrectNumber", "cardDetails",
      "bankUnavailable", "authenticationFailed", "twoPartsUnavailable", "prepareFailed", "priceChanged", "duplicateTransaction",
    ].map((k) => `payment.errors.${k}`),
    "payment.termsHint", "payment.walletsAcceptPrefix", "payment.notChargedYet",
    "checkout.fieldErrors.firstName", "checkout.fieldErrors.lastName", "checkout.nifInvalid",
    "checkout.emailHoldNote", "checkout.emailReminderNote",
  ];
  // "tu": pronomes e imperativos/infinitos com pronome da 2.ª pessoa
  const TU = /\b(ti|tuo|tua|tuoi|tue)\b|\b(controlla|controllalo|inizia|togli|cambia|usa|indica|riprova|completi ora)\b|inviarti|\bnon ti\b/i;

  it.each(KEYS)("%s", (key) => {
    const value = get(key);
    expect(value, key).toBeTruthy();
    expect(value, key).not.toMatch(TU);
  });
});

describe("contexto e contacto humano em todos os passos", () => {
  const page = read("client/src/pages/checkout/CheckoutPage.tsx");

  it("no telemóvel, o nome e a foto da casa no topo de cada passo", () => {
    expect(page).toMatch(/const mobileContext = \(\s*<div className="lg:hidden/);
    // Uma página, três secções (29 out 2026): a faixa vive no topo da coluna de
    // conteúdo, acima de todas as secções, em vez de dentro do passo
    expect(page).toMatch(/<div className="space-y-4">\s*\{mobileContext\}/);
  });

  it("um WhatsApp discreto no cabeçalho, medido como whatsapp_click com o passo", () => {
    expect(page).toMatch(/href=\{conciergeQuestionHref\}/);
    expect(page).toMatch(/data-track-source=\{`checkout_header_\$\{step\}`\}/);
    // o clique conta pelo listener global de wa.me (installContactClickTracking)
    // (o evento pode levar contexto extra dos data-track-*, p. ex. a listagem;
    // desde a 2.ª revisão do PR #175 é montado por contactClickEvent, que
    // repõe esse contexto a cada clique)
    expect(read("client/src/lib/datalayer.ts")).toMatch(/if \(href\.includes\('wa\.me\/'\)\) \{\s*pushDL\((?:\{ event: 'whatsapp_click', source(?:, [^}]*)? \}|contactClickEvent\('whatsapp_click', source(?:, [^)]*)?\))\);/);
    expect(read("client/src/lib/checkoutPayment.ts")).toMatch(/https:\/\/wa\.me\//);
  });

  it("a mensagem do WhatsApp existe nas 9 línguas com a casa e as datas", () => {
    for (const lang of LANGS) {
      const msg = locale(lang).checkout.conciergeMessage as string;
      expect(placeholders(msg), lang).toEqual(["{{checkIn}}", "{{checkOut}}", "{{guests}}", "{{property}}"]);
      expect(msg, lang).not.toMatch(BANNED);
    }
  });

  it("no telemóvel, a barra fixa fica por cima do banner de cookies e não o tapa", () => {
    expect(page).toMatch(/className="lg:hidden fixed inset-x-0 z-40" style=\{\{ bottom: "var\(--cookie-banner-h, 0px\)" \}\}/);
    expect(page).toMatch(/max\(0px, env\(safe-area-inset-bottom, 0px\) - var\(--cookie-banner-h, 0px\)\)/);
    expect(read("client/src/components/layout/CookieBanner.tsx")).toMatch(/setProperty\('--cookie-banner-h'/);
  });
});

describe("caixa de marketing do passo 1: só marketing, nunca o envio da reserva", () => {
  // O Ricardo (29 out 2026) passou sem a marcar e estranhou: o texto antigo
  // ("Autorizo o envio da minha reserva e contacto futuro") dava a entender
  // que o email da reserva dependia da caixa. A confirmação vai sempre; a
  // caixa é só a autorização de marketing, opcional e dita como tal.
  it.each(LANGS)("%s: fala de novidades/ofertas, diz que é opcional e não fala do envio da reserva", (lang) => {
    const label = locale(lang).checkout.newsletterOptIn as string;
    expect(label).toMatch(/optional|opcional|facultatif|facoltativo|optioneel|valfritt|valinnainen/i);
    expect(label).not.toMatch(/reserva|booking|réservation|prenotazione|Buchung|boeking|bokning|varauks/i);
    expect(label).not.toMatch(BANNED);
  });
});
