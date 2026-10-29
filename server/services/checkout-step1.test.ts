import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { consentChecked, consentToSend, stayContinueAction } from "@/lib/checkoutStay";
import { PAYMENT_MARKS } from "@/components/booking/PaymentMethodsNote";

/**
 * Passo 1 do checkout e o que o rodeia (auditoria do funil, 29 out 2026,
 * n.º 2, e os "em falta" do crítico: contexto no telemóvel, meios de
 * pagamento antes do portão do email, contacto humano, banner de cookies).
 */

const read = (p: string) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const LANGS = ["en", "pt", "fr", "es", "it", "de", "nl", "sv", "fi"] as const;
const locale = (lang: string) => JSON.parse(read(`client/src/i18n/locales/${lang}.json`));
const placeholders = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
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

describe("os textos do passo 1 não prometem um envio que não sai", () => {
  it("o título deixou de prometer enviar a reserva, nas 9 línguas", () => {
    const old: Record<string, RegExp> = {
      en: /send your booking/i, pt: /enviamos a sua reserva/i, fr: /envoyons-nous votre réservation/i,
      es: /enviamos su reserva/i, it: /inviamo la tua prenotazione/i, de: /senden wir ihre buchung/i,
      nl: /sturen we uw boeking/i, sv: /skickar vi din bokning/i, fi: /lähetämme varauksesi/i,
    };
    for (const lang of LANGS) {
      const title = locale(lang).checkout.emailTitle as string;
      expect(title, lang).toBeTruthy();
      expect(title, lang).not.toMatch(old[lang]);
    }
  });

  it("a nota diz que o preço fica guardado e que pode haver lembretes (spec §4), nas 9 línguas", () => {
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

describe("contexto e contacto humano em todos os passos", () => {
  const page = read("client/src/pages/checkout/CheckoutPage.tsx");

  it("no telemóvel, o nome e a foto da casa no topo de cada passo", () => {
    expect(page).toMatch(/const mobileContext = \(\s*<div className="lg:hidden/);
    expect(page).toMatch(/<section key=\{step\}[^>]*>\s*\{mobileContext\}/);
  });

  it("um WhatsApp discreto no cabeçalho, medido como whatsapp_click com o passo", () => {
    expect(page).toMatch(/href=\{conciergeQuestionHref\}/);
    expect(page).toMatch(/data-track-source=\{`checkout_header_\$\{step\}`\}/);
    // o clique conta pelo listener global de wa.me (installContactClickTracking)
    expect(read("client/src/lib/datalayer.ts")).toMatch(/if \(href\.includes\('wa\.me\/'\)\) \{\s*pushDL\(\{ event: 'whatsapp_click', source \}\);/);
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
