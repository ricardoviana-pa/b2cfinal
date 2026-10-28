/**
 * Emails do pagamento em duas partes (spec docs/pagamento_duas_partes.md
 * 2.4, 4.2 e 5.6). Resend simulado: nada sai para a rede.
 *
 * O que se prova aqui:
 * - PAYPLAN_I18N e PAYPLAN_SMS_I18N completos e sem texto vazio nas 9 línguas;
 * - nenhum texto ao hóspede usa sinal/depósito/prestações nem chama seguro
 *   a nada, em nenhuma língua nem em nenhuma variante;
 * - PT e EN são a spec 4.2 palavra por palavra;
 * - os prazos levam hora e "hora de Lisboa"; "amanhã" e "daqui a uma
 *   semana" só saem quando são verdade;
 * - a variante hard nunca diz a causa nem promete nova tentativa;
 * - true só com o envio aceite pelo Resend;
 * - confirmação e manifesto sem plano ficam iguais; com plano mostram-no.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_LANGS, PAYPLAN_I18N, PAYPLAN_SMS_I18N, formatLisbonDay, type EmailLang, type PayPlanStrings } from "./email-i18n";

const fake = vi.hoisted(() => ({
  send: vi.fn(async (_mail: any, _opts?: any): Promise<any> => ({ data: { id: "email_synthetic" }, error: null })),
}));
vi.mock("resend", () => ({ Resend: class { emails = { send: fake.send }; } }));

let email: typeof import("./transactional-email");
beforeAll(async () => {
  vi.stubEnv("RESEND_API_KEY", "synthetic-mocked-email-only");
  vi.stubEnv("BOOKING_ALERT_EMAIL", "cs@checkout.invalid");
  vi.stubEnv("SALES_COPY_EMAIL", "sales@checkout.invalid");
  vi.stubEnv("BOOKING_NOTIFICATION_EMAIL", "booking@checkout.invalid");
  // Ambiente de produção para o guard de preview (o Resend está simulado).
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SITE_URL", "https://www.portugalactive.com");
  vi.stubEnv("RENDER_SERVICE_ID", "");
  vi.stubEnv("RENDER_GIT_BRANCH", "");
  email = await import("./transactional-email");
});
beforeEach(() => {
  fake.send.mockReset();
  fake.send.mockImplementation(async () => ({ data: { id: "email_synthetic" }, error: null }));
});
afterAll(() => vi.unstubAllEnvs());

/** O Intl separa valor e moeda (e milhares) com espaços não separáveis; os
 *  testes comparam com espaços normais. */
const norm = (s: string) => String(s ?? "").replace(/[\u00a0\u202f]/g, " ");
const normMail = (m: any) => (m ? { ...m, html: norm(m.html), subject: norm(m.subject) } : m);
const last = (): any => normMail(fake.send.mock.calls.at(-1)?.[0]);
const sentTo = (to: string): any => normMail((fake.send.mock.calls as any[]).map((c) => c[0]).find((m) => m.to === to));

/** Vocabulário proibido para as partes do preço (spec, cabeçalho e 4.2) e "seguro" para o Flex. */
const BANNED = /sinal|dep[oó]sito|prestaç|deposit|instal+ment|seguro|insurance|acompte|anzahlung|caparra|aanbetaling|handpenning|käsiraha|financiamento/i;
/** A variante hard nunca diz a causa (lost/stolen/fraudulent). */
const CAUSES = /stolen|lost card|fraud|roubad|perdid|vol[ée]e|robad|rubat|gestohlen|gestolen|stulet|varastet|bloquead/i;

const LINK = "https://www.portugalactive.com/pt/booking/balance/3f1c2a9e-8b7d-4c6e-9f00-1234567890ab?t=4102444800.0123456789abcdef0123456789abcdef";
const DEV_LINK = "https://dev.portugalactive.com/pt/booking/balance/x?t=1";
/** Cenário de verão (Lisboa = UTC+1): C 28 jun 10:00, retentativas 29 jun e 1 jul, H 5 jul 12:00, D 8 jul 23:59. */
const C = new Date("2099-06-28T09:00:00Z");
const R1 = new Date("2099-06-29T09:00:00Z");
const R2 = new Date("2099-07-01T09:00:00Z");
const H = new Date("2099-07-05T11:00:00Z");
const D = new Date("2099-07-08T22:59:00Z");
const guest = { email: "guest@checkout.invalid", guestFirstName: "Ana Maria", propertyName: "Casa Sintética" };

/* ── Todas as strings, com valores de exemplo, para os testes de completude e vocabulário ── */
function renderAll(P: PayPlanStrings): Record<string, string[]> {
  const g = P.hello("Ana");
  const g0 = P.hello(null);
  const remind = { greeting: g, date: "28 X 2099", amount: "1 250 €", last4: "4242", house: "Casa", checkIn: "10 X", checkOut: "15 X" };
  const out: Record<keyof PayPlanStrings, string[]> = {
    productName: [P.productName],
    hello: [g, g0],
    deadline: [P.deadline("5 X 2099", "12:00"), P.deadline("5 X 2099", "01:00")],
    amountLabel: [P.amountLabel], chargeDateLabel: [P.chargeDateLabel], cardLabel: [P.cardLabel],
    payByLabel: [P.payByLabel], freeCancelLabel: [P.freeCancelLabel], totalPaidLabel: [P.totalPaidLabel], refundLabel: [P.refundLabel],
    planTitle: [P.planTitle],
    planToday: [P.planToday("1 480 €", "4242"), P.planToday("1 480 €", null)],
    planLater: [P.planLater("28 X 2099", "1 250 €")],
    planDeadline: [P.planDeadline("8 X 2099, 23:59")],
    planNote: [P.planNote], planNoteManage: [P.planNoteManage], planCta: [P.planCta], noWithdrawal: [P.noWithdrawal],
    remind7Subject: [P.remind7Subject("Casa")],
    remindSubjectDated: [P.remindSubjectDated("Casa", "28 X 2099")],
    remind7Headline: [P.remind7Headline("28 X 2099", "1 250 €")],
    remind1Subject: [P.remind1Subject("Casa")],
    remind1Headline: [P.remind1Headline("1 250 €")],
    remindBody: [P.remindBody(remind), P.remindBody({ ...remind, greeting: g0, last4: null })],
    cardExpires: [P.cardExpires("4242", "28 X 2099")],
    limitTip: [P.limitTip],
    failedSubject: [P.failedSubject], failedHeadline: [P.failedHeadline], failedHeadlineAuth: [P.failedHeadlineAuth],
    failedBody: [P.failedBody({ greeting: g, amount: "1 250 €", last4: "4242" }), P.failedBody({ greeting: g0, amount: "1 250 €", last4: null })],
    failedBodyAuth: [P.failedBodyAuth({ greeting: g, amount: "1 250 €", last4: "4242" }), P.failedBodyAuth({ greeting: g0, amount: "1 250 €", last4: null })],
    failedBodyHard: [P.failedBodyHard({ greeting: g, amount: "1 250 €", last4: "4242" }), P.failedBodyHard({ greeting: g0, amount: "1 250 €", last4: null })],
    deadlineSoft: [P.deadlineSoft("5 X", ["29 X"]), P.deadlineSoft("5 X", ["29 X", "1 Y"])],
    deadlineHard: [P.deadlineHard("5 X")],
    consequence: [P.consequence("1 480 €"), P.consequence(null)],
    failedCta: [P.failedCta], failedCtaHard: [P.failedCtaHard],
    failedCtaAuth: [P.failedCtaAuth("4242"), P.failedCtaAuth(null)],
    help: [P.help],
    lastCallSubject: [P.lastCallSubject("Casa")], lastCallHeadline: [P.lastCallHeadline],
    lastCallBody: [P.lastCallBody(g, "1 250 €", "5 X, 12:00")],
    paidSubject: [P.paidSubject("Casa")], paidHeadline: [P.paidHeadline("10 X")],
    paidBody: [P.paidBody({ greeting: g, amount: "1 250 €", last4: "4242", house: "Casa", checkIn: "10 X", checkOut: "15 X", invoiceLine: P.invoiceAfterStay })],
    invoiceAfterStay: [P.invoiceAfterStay], invoiceSeparate: [P.invoiceSeparate],
    cancelledSubject: [P.cancelledSubject("Casa")], cancelledHeadline: [P.cancelledHeadline],
    cancelledBody: [
      P.cancelledBody({ greeting: g, house: "Casa", deadline: "5 X, 12:00", refund: "1 480 €", cards: ["4242"], creditNote: "NC 1/2099" }),
      P.cancelledBody({ greeting: g, house: "Casa", deadline: "5 X, 12:00", refund: "1 480 €", cards: ["4242", "5555"], creditNote: null }),
      P.cancelledBody({ greeting: g0, house: "Casa", deadline: null, refund: null, cards: [], creditNote: null }),
    ],
    rebook: [P.rebook],
    guestCancelledSubject: [P.guestCancelledSubject("Casa")], guestCancelledHeadline: [P.guestCancelledHeadline],
    guestCancelledBody: [
      P.guestCancelledBody({ greeting: g, house: "Casa", checkIn: "10 X", checkOut: "15 X", refund: "1 480 €", cards: ["4242"], creditNote: "NC 1/2099" }),
      P.guestCancelledBody({ greeting: g, house: "Casa", checkIn: "10 X", checkOut: "15 X", refund: "1 480 €", cards: [], creditNote: null }),
      P.guestCancelledBody({ greeting: g0, house: "Casa", checkIn: "10 X", checkOut: "15 X", refund: null, cards: [], creditNote: null }),
    ],
    teamCancelledBody: [
      P.teamCancelledBody({ greeting: g, house: "Casa", checkIn: "10 X", checkOut: "15 X", refund: "2 730 €", cards: ["4242", "5555"], creditNote: "NC 1/2099" }),
      P.teamCancelledBody({ greeting: g, house: "Casa", checkIn: "10 X", checkOut: "15 X", refund: "2 730 €", cards: ["4242"], creditNote: null }),
      P.teamCancelledBody({ greeting: g0, house: "Casa", checkIn: "10 X", checkOut: "15 X", refund: "2 730 €", cards: [], creditNote: null }),
      P.teamCancelledBody({ greeting: g0, house: "Casa", checkIn: "10 X", checkOut: "15 X", refund: null, cards: [], creditNote: null }),
    ],
    cardUpdatedSubject: [P.cardUpdatedSubject], cardUpdatedBody: [P.cardUpdatedBody("4242", "28 X")],
  };
  return out;
}

describe("PAYPLAN_I18N e PAYPLAN_SMS_I18N: completos nas 9 línguas", () => {
  it("as 9 línguas e mais nenhuma", () => {
    expect(Object.keys(PAYPLAN_I18N).sort()).toEqual([...EMAIL_LANGS].sort());
    expect(Object.keys(PAYPLAN_SMS_I18N).sort()).toEqual([...EMAIL_LANGS].sort());
  });

  it.each(EMAIL_LANGS)("%s: todas as chaves presentes, renderizadas e não vazias", (lang) => {
    const P = PAYPLAN_I18N[lang];
    expect(Object.keys(P).sort()).toEqual(Object.keys(PAYPLAN_I18N.pt).sort());
    const all = renderAll(P);
    // O teste cobre todas as chaves (uma chave nova sem exemplo falha aqui).
    expect(Object.keys(all).sort()).toEqual(Object.keys(P).sort());
    for (const [key, values] of Object.entries(all)) {
      for (const v of values) {
        expect(typeof v, `${lang}.${key}`).toBe("string");
        expect(v.trim().length, `${lang}.${key}`).toBeGreaterThan(0);
        expect(v, `${lang}.${key}`).not.toMatch(/\bundefined\b|\bnull\b|\bNaN\b|\[object|\$\{/);
      }
    }
    const S = PAYPLAN_SMS_I18N[lang];
    for (const v of [S.deadline("5 X", "12:00"), S.failed("Casa", "5 X", LINK), S.failed(null, "5 X", LINK), S.lastCall("Casa", "12:00", LINK), S.lastCall(null, "12:00", LINK)]) {
      expect(v.trim().length).toBeGreaterThan(0);
      expect(v).not.toMatch(/\bundefined\b|\bnull\b|\bNaN\b|\$\{/);
    }
  });

  it.each(EMAIL_LANGS)("%s: nenhum texto usa sinal/depósito/prestações nem 'seguro'", (lang) => {
    for (const [key, values] of Object.entries(renderAll(PAYPLAN_I18N[lang]))) {
      for (const v of values) expect(v, `${lang}.${key}`).not.toMatch(BANNED);
    }
    const S = PAYPLAN_SMS_I18N[lang];
    expect(`${S.failed("Casa", "5 X", LINK)} ${S.lastCall("Casa", "12:00", LINK)}`).not.toMatch(BANNED);
  });

  it.each(EMAIL_LANGS)("%s: as variantes hard e auth nunca prometem nova tentativa nem dizem a causa", (lang) => {
    const P = PAYPLAN_I18N[lang];
    const hard = P.failedBodyHard({ greeting: P.hello("Ana"), amount: "1 250 €", last4: "4242" });
    expect(hard).not.toMatch(CAUSES);
    // O texto de prazo das variantes hard/auth é o deadlineHard, que não tem datas de retentativa.
    expect(P.deadlineHard("5 X")).not.toContain("29 X");
  });
});

describe("PT e EN: as strings da spec 4.2, palavra por palavra", () => {
  /** Substitui {{chave}} como a spec escreve os modelos. */
  const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => v[k]);
  const v = {
    name: "Ana", date: "28 de junho de 2027", amountLater: "1250 €", amountNow: "1480 €", last4: "1234",
    house: "Casa X", checkIn: "15 de julho", checkOut: "22 de julho", deadline: "5 de julho de 2027 às 12:00, hora de Lisboa",
    retry1: "29 de junho de 2027", retry2: "1 de julho de 2027", refund: "1480 €", link: LINK,
  };
  const pt = PAYPLAN_I18N.pt;
  const en = PAYPLAN_I18N.en;

  it("pt", () => {
    const g = pt.hello(v.name);
    expect(pt.planTitle).toBe("O seu plano de pagamento");
    expect(pt.planToday(v.amountNow, v.last4)).toBe(fill("Hoje, pago: {{amountNow}} no cartão ••••{{last4}}", v));
    expect(pt.planLater(v.date, v.amountLater)).toBe(fill("A {{date}}: {{amountLater}}, cobrado automaticamente no mesmo cartão", v));
    expect(`${pt.planNote} ${pt.planNoteManage}`).toBe("Nada a fazer até lá. Lembramos uma semana antes e na véspera. Se preferir pagar antes, usar outro cartão ou cancelar, basta um clique.");
    expect(pt.planCta).toBe("Gerir o pagamento");
    expect(pt.remind7Subject(v.house)).toBe(fill("A segunda parte da sua estadia em {{house}}, daqui a uma semana", v));
    expect(pt.remindBody({ greeting: g, date: v.date, amount: v.amountLater, last4: v.last4, house: v.house, checkIn: v.checkIn, checkOut: v.checkOut })).toBe(fill(
      "Olá {{name}}. Tal como combinado, a {{date}} cobramos {{amountLater}} no cartão ••••{{last4}}, a segunda e última parte da sua estadia em {{house}}, de {{checkIn}} a {{checkOut}}. Não precisa de fazer nada. Se preferir usar outro cartão, ou pagar já, basta um clique.", v));
    expect(pt.cardExpires(v.last4, v.date)).toBe(fill("O cartão ••••{{last4}} expira antes de {{date}}. Atualize-o num minuto para a cobrança correr sem sobressaltos.", v));
    expect(pt.remind1Subject(v.house)).toBe(fill("Amanhã cobramos a segunda parte da sua estadia em {{house}}", v));
    expect(pt.remind1Headline(v.amountLater)).toBe(fill("Amanhã, {{amountLater}}.", v));
    expect(pt.failedSubject).toBe("Não conseguimos cobrar a segunda parte da sua estadia");
    expect(pt.failedBody({ greeting: g, amount: v.amountLater, last4: v.last4 })).toBe(fill(
      "Olá {{name}}. Hoje tentámos cobrar {{amountLater}} no cartão ••••{{last4}} e o banco não aceitou. Acontece com frequência por limite do cartão, validade ou um pedido de confirmação do banco. Pode pagar com o mesmo cartão ou com outro no botão abaixo, sem precisar de iniciar sessão.", v));
    expect(pt.failedBodyAuth({ greeting: g, amount: v.amountLater, last4: v.last4 })).toBe(fill(
      "Olá {{name}}. O seu banco pede-lhe uma confirmação para a cobrança de {{amountLater}} no cartão ••••{{last4}}. Basta confirmar com o mesmo cartão no botão abaixo. Demora um minuto.", v));
    expect(pt.deadlineSoft(v.deadline, [v.retry1, v.retry2])).toBe(fill(
      "Para manter a reserva, o pagamento tem de estar feito até {{deadline}}. Vamos também tentar de novo a {{retry1}} e a {{retry2}}.", v));
    expect(pt.deadlineHard(v.deadline)).toBe(fill(
      "Para manter a reserva, o pagamento tem de estar feito até {{deadline}}. Neste caso só o seu clique resolve: não vamos tentar de novo sozinhos.", v));
    expect(pt.consequence(v.amountNow)).toBe(fill(
      "Se até lá não for possível, a reserva é cancelada e devolvemos os {{amountNow}} que já pagou, porque ainda está dentro do prazo de cancelamento gratuito.", v));
    expect(pt.failedCta).toBe("Pagar ou mudar de cartão");
    expect(pt.help).toBe("Se precisar de ajuda, use o botão “Preciso de ajuda” na mesma página. Por segurança, nunca envie dados do cartão por email ou mensagem.");
    expect(pt.lastCallBody(g, v.amountLater, v.deadline)).toBe(fill(
      "Olá {{name}}. Ainda não recebemos {{amountLater}} e o prazo termina amanhã, {{deadline}}. Pagar demora dois minutos. Se já não puder vir, não precisa de fazer nada: a reserva é cancelada e devolvemos o que pagou.", v));
    expect(pt.paidSubject(v.house)).toBe(fill("A sua estadia em {{house}} está paga na totalidade", v));
    expect(pt.paidBody({ greeting: g, amount: v.amountLater, last4: v.last4, house: v.house, checkIn: v.checkIn, checkOut: v.checkOut, invoiceLine: pt.invoiceAfterStay })).toBe(fill(
      "Olá {{name}}. Recebemos a segunda parte, {{amountLater}}, no cartão ••••{{last4}}. A sua estadia em {{house}}, de {{checkIn}} a {{checkOut}}, está paga na totalidade. A fatura é emitida após a estadia. Até lá, o seu concierge está a uma mensagem de distância.", v));
    expect(pt.cancelledSubject(v.house)).toBe(fill("A sua reserva em {{house}} foi cancelada", v));
    // Desvio assumido: sem anexo não se diz "Junto segue"; diz-se o número.
    expect(pt.cancelledBody({ greeting: g, house: v.house, deadline: v.deadline, refund: v.amountNow, cards: [v.last4], creditNote: "NC 7" })).toBe(fill(
      "Olá {{name}}. Não recebemos a segunda parte da sua estadia em {{house}} até {{deadline}}, por isso a reserva foi cancelada, como explicámos. Os {{amountNow}} que pagou voltam ao cartão ••••{{last4}} dentro de 5 a 10 dias úteis, conforme o banco. Referência da nota de crédito: NC 7. Não há mais nada a pagar.", v));
    expect(pt.rebook).toBe("Se ainda quiser vir, as datas podem continuar livres. Reserve de novo ou fale com o seu concierge.");
    expect(pt.guestCancelledSubject(v.house)).toBe(fill("Cancelamento confirmado: {{house}}", v));
    expect(pt.guestCancelledBody({ greeting: g, house: v.house, checkIn: v.checkIn, checkOut: v.checkOut, refund: v.refund, cards: [v.last4], creditNote: null })).toBe(fill(
      "Olá {{name}}. Cancelámos a sua reserva em {{house}}, de {{checkIn}} a {{checkOut}}, como pediu, dentro do prazo de cancelamento gratuito. Devolvemos {{refund}} ao cartão ••••{{last4}} em 5 a 10 dias úteis. Não há mais nada a pagar e nenhuma outra cobrança será feita.", v));
    expect(pt.cardUpdatedBody(v.last4, v.date)).toBe(fill("Cartão atualizado. A segunda parte será cobrada no cartão ••••{{last4}} a {{date}}.", v));
    expect(pt.deadline("5 de julho de 2027", "12:00")).toBe("5 de julho de 2027 às 12:00, hora de Lisboa");
    expect(pt.deadline("5 de julho de 2027", "01:00")).toBe("5 de julho de 2027 à 01:00, hora de Lisboa");
    expect(PAYPLAN_SMS_I18N.pt.failed(v.house, v.deadline, v.link)).toBe(fill(
      "Portugal Active: não conseguimos cobrar a 2.ª parte da sua estadia em {{house}}. Pague ou mude de cartão até {{deadline}}: {{link}}", v));
    expect(PAYPLAN_SMS_I18N.pt.lastCall(v.house, "12:00", v.link)).toBe(fill(
      "Portugal Active: amanhã às 12:00 (Lisboa) termina o prazo da 2.ª parte da sua estadia em {{house}}. Pagar demora 2 minutos: {{link}}", v));
  });

  it("en", () => {
    const w = { ...v, date: "28 June 2027", amountLater: "€1,250", amountNow: "€1,480", refund: "€1,480", checkIn: "15 July", checkOut: "22 July", deadline: "5 July 2027 at 12:00, Lisbon time", retry1: "29 June 2027", retry2: "1 July 2027" };
    const g = en.hello(w.name);
    expect(en.planToday(w.amountNow, w.last4)).toBe(fill("Paid today: {{amountNow}} on card ••••{{last4}}", w));
    expect(en.planLater(w.date, w.amountLater)).toBe(fill("On {{date}}: {{amountLater}}, charged automatically to the same card", w));
    expect(`${en.planNote} ${en.planNoteManage}`).toBe("Nothing to do until then. We will remind you a week before and the day before. If you would rather pay earlier, use another card or cancel, it takes one click.");
    expect(en.remindBody({ greeting: g, date: w.date, amount: w.amountLater, last4: w.last4, house: w.house, checkIn: w.checkIn, checkOut: w.checkOut })).toBe(fill(
      "Hello {{name}}. As agreed, on {{date}} we will charge {{amountLater}} to card ••••{{last4}}, the second and final part of your stay at {{house}}, from {{checkIn}} to {{checkOut}}. There is nothing you need to do. If you would rather use another card, or pay now, it takes one click.", w));
    expect(en.failedBody({ greeting: g, amount: w.amountLater, last4: w.last4 })).toBe(fill(
      "Hello {{name}}. Today we tried to charge {{amountLater}} to card ••••{{last4}} and your bank did not accept it. This often happens because of a card limit, an expiry date or a confirmation your bank wants from you. You can pay with the same card or another one using the button below, no sign-in needed.", w));
    expect(en.deadlineSoft(w.deadline, [w.retry1, w.retry2])).toBe(fill(
      "To keep your booking, the payment needs to be made by {{deadline}}. We will also try again on {{retry1}} and {{retry2}}.", w));
    expect(en.deadlineHard(w.deadline)).toBe(fill(
      "To keep your booking, the payment needs to be made by {{deadline}}. In this case only your click fixes it: we will not retry on our own.", w));
    expect(en.consequence(w.amountNow)).toBe(fill(
      "If it is not possible by then, the booking is cancelled and we refund the {{amountNow}} you already paid, because you are still within the free cancellation period.", w));
    expect(en.lastCallBody(g, w.amountLater, w.deadline)).toBe(fill(
      "Hello {{name}}. We have not yet received {{amountLater}} and the deadline is tomorrow, {{deadline}}. Paying takes two minutes. If you can no longer come, there is nothing you need to do: the booking is cancelled and we refund what you paid.", w));
    expect(en.paidBody({ greeting: g, amount: w.amountLater, last4: w.last4, house: w.house, checkIn: w.checkIn, checkOut: w.checkOut, invoiceLine: en.invoiceAfterStay })).toBe(fill(
      "Hello {{name}}. We received the second part, {{amountLater}}, on card ••••{{last4}}. Your stay at {{house}}, from {{checkIn}} to {{checkOut}}, is paid in full. The invoice is issued after your stay. Until then, your concierge is one message away.", w));
    expect(en.guestCancelledBody({ greeting: g, house: w.house, checkIn: w.checkIn, checkOut: w.checkOut, refund: w.refund, cards: [w.last4], creditNote: null })).toBe(fill(
      "Hello {{name}}. We cancelled your booking at {{house}}, from {{checkIn}} to {{checkOut}}, as requested, within the free cancellation period. We are refunding {{refund}} to card ••••{{last4}} within 5 to 10 working days. There is nothing more to pay and no further charge will be made.", w));
    expect(PAYPLAN_SMS_I18N.en.failed(w.house, w.deadline, w.link)).toBe(fill(
      "Portugal Active: we could not charge the 2nd part of your stay at {{house}}. Pay or change card by {{deadline}}: {{link}}", w));
  });
});

describe("datas escritas como cada língua as escreve", () => {
  it("dia 1 com ordinal em francês e italiano; as outras línguas sem", () => {
    const first = new Date("2099-07-01T09:00:00Z");
    expect(norm(formatLisbonDay(first, "fr"))).toBe("1er juillet 2099");
    expect(norm(formatLisbonDay(first, "it"))).toBe("1º luglio 2099");
    expect(norm(formatLisbonDay(first, "pt"))).toBe("1 de julho de 2099");
    expect(norm(formatLisbonDay(first, "en", false))).toBe("1 July");
  });

  it("italiano: elisão antes de 8 e 11 (all'8, dall'11, l'8)", () => {
    const it = PAYPLAN_I18N.it;
    expect(it.planDeadline("8 luglio 2099 alle 23:59, ora di Lisbona")).toBe("Può cancellare senza costi fino all'8 luglio 2099 alle 23:59, ora di Lisbona.");
    expect(it.planLater("11 luglio 2099", "1250 €")).toBe("L'11 luglio 2099: 1250 €, addebitati automaticamente sulla stessa carta");
    expect(it.planLater("28 giugno 2099", "1250 €")).toBe("Il 28 giugno 2099: 1250 €, addebitati automaticamente sulla stessa carta");
    expect(it.remindBody({ greeting: it.hello("Ana"), date: "8 luglio 2099", amount: "1250 €", last4: "4242", house: "Casa", checkIn: "11 luglio", checkOut: "18 luglio" }))
      .toContain("come concordato, l'8 luglio 2099 addebiteremo 1250 € sulla carta ••••4242, la seconda e ultima parte del suo soggiorno a Casa, dall'11 luglio al 18 luglio.");
    expect(it.deadlineSoft("5 luglio", ["8 luglio", "11 luglio"])).toContain("Proveremo anche di nuovo l'8 luglio e l'11 luglio.");
  });
});

/* ── Os emails, de ponta a ponta ── */

const reminder = (stage: 1 | 2, now: Date, extra: Record<string, unknown> = {}) =>
  email.sendBalanceReminder({
    stage, ...guest, locale: "pt", checkIn: "2099-07-15", checkOut: "2099-07-22",
    amountCents: 125_000, chargeAt: C, cardBrand: "visa", cardLast4: "4242",
    cardExpiresBeforeCharge: false, link: LINK, now, ...extra,
  });

describe("sendBalanceReminder (E1 e E2)", () => {
  it("E1 a 7 dias: assunto da spec, corpo, dica de limite, cartão e link; true", async () => {
    expect(await reminder(1, new Date("2099-06-21T08:00:00Z"))).toBe(true);
    const m = last();
    expect(m.to).toBe("guest@checkout.invalid");
    expect(m.replyTo).toBe("booking@checkout.invalid");
    expect(m.subject).toBe("A segunda parte da sua estadia em Casa Sintética, daqui a uma semana");
    expect(m.html).toContain("Olá Ana. Tal como combinado, a 28 de junho de 2099 cobramos 1250 € no cartão ••••4242");
    expect(m.html).toContain("de 15 de julho a 22 de julho");
    expect(m.html).toContain(PAYPLAN_I18N.pt.limitTip);
    expect(m.html).toContain("Visa ••••4242");
    expect(m.html).toContain(`href="${LINK}"`);
    expect(m.html).toContain(">Gerir o pagamento<");
    expect(m.html).toContain('<html lang="pt">');
  });

  it("E1 atrasado (4 dias): assunto com a data, sem 'daqui a uma semana'", async () => {
    expect(await reminder(1, new Date("2099-06-24T08:00:00Z"))).toBe(true);
    expect(last().subject).toBe("A segunda parte da sua estadia em Casa Sintética, a 28 de junho de 2099");
  });

  it("E1 na véspera não sai (o lembrete certo é o E2)", async () => {
    expect(await reminder(1, new Date("2099-06-27T07:00:00Z"))).toBe(false);
    expect(fake.send).not.toHaveBeenCalled();
  });

  it("E2 na véspera: 'Amanhã cobramos…' e 'Amanhã, 1250 €.'", async () => {
    expect(await reminder(2, new Date("2099-06-27T08:00:00Z"))).toBe(true);
    expect(last().subject).toBe("Amanhã cobramos a segunda parte da sua estadia em Casa Sintética");
    expect(last().html).toContain("Amanhã, 1250 €.");
    expect(last().html).not.toContain(PAYPLAN_I18N.pt.limitTip);
  });

  it("E2 no próprio dia ou a 3 dias não sai: 'amanhã' seria falso", async () => {
    expect(await reminder(2, new Date("2099-06-28T07:00:00Z"))).toBe(false);
    expect(await reminder(2, new Date("2099-06-25T08:00:00Z"))).toBe(false);
    expect(fake.send).not.toHaveBeenCalled();
  });

  it("cartão a expirar: pede para o atualizar", async () => {
    await reminder(1, new Date("2099-06-21T08:00:00Z"), { cardExpiresBeforeCharge: true });
    expect(last().html).toContain("O cartão ••••4242 expira antes de 28 de junho de 2099.");
  });

  it("link fora da origem de produção, valor ou data inválidos: não envia", async () => {
    expect(await reminder(1, new Date("2099-06-21T08:00:00Z"), { link: DEV_LINK })).toBe(false);
    expect(await reminder(1, new Date("2099-06-21T08:00:00Z"), { amountCents: 0 })).toBe(false);
    expect(await reminder(1, new Date("2099-06-21T08:00:00Z"), { chargeAt: new Date("x") })).toBe(false);
    expect(fake.send).not.toHaveBeenCalled();
  });

  it("nome e casa vindos de fora são escapados no HTML", async () => {
    await reminder(1, new Date("2099-06-21T08:00:00Z"), { guestFirstName: "<img src=x onerror=alert(1)>", propertyName: "Casa <b>X</b>" });
    expect(last().html).not.toContain("<img src=x");
    expect(last().html).not.toContain("<b>X</b>");
    expect(last().html).toContain("Casa &lt;b&gt;X&lt;/b&gt;");
  });
});

const failed = (variant: "soft" | "auth" | "hard", extra: Record<string, unknown> = {}) =>
  email.sendBalanceFailed({
    variant, ...guest, locale: "pt", checkIn: "2099-07-15", amountCents: 125_000,
    nextRetryAt: variant === "soft" ? R1 : null, retryAts: variant === "soft" ? [R1, R2] : null,
    hardStopAt: H, freeCancelDeadlineAt: D, cardLast4: "4242", link: LINK, amountPaidCents: 148_000,
    now: new Date("2099-06-28T09:05:00Z"), ...extra,
  } as any);

describe("sendBalanceFailed (E3)", () => {
  it("soft: retentativas, prazo com hora de Lisboa, consequência com o valor pago", async () => {
    expect(await failed("soft")).toBe(true);
    const m = last();
    expect(m.subject).toBe("Não conseguimos cobrar a segunda parte da sua estadia");
    expect(m.html).toContain("Hoje tentámos cobrar 1250 € no cartão ••••4242 e o banco não aceitou.");
    expect(m.html).toContain("o pagamento tem de estar feito até 5 de julho de 2099 às 12:00, hora de Lisboa. Vamos também tentar de novo a 29 de junho de 2099 e a 1 de julho de 2099.");
    expect(m.html).toContain("devolvemos os 1480 € que já pagou");
    expect(m.html).toContain("8 de julho de 2099 às 23:59, hora de Lisboa");
    expect(m.html).toContain(">Pagar ou mudar de cartão<");
    expect(m.html).toContain(PAYPLAN_I18N.pt.help);
  });

  it("soft só com nextRetryAt: uma retentativa", async () => {
    await failed("soft", { retryAts: null });
    expect(last().html).toContain("Vamos também tentar de novo a 29 de junho de 2099.");
  });

  it("soft nunca promete uma retentativa depois de H nem no passado", async () => {
    await failed("soft", { retryAts: [new Date("2099-06-27T09:00:00Z"), new Date("2099-07-06T09:00:00Z")], nextRetryAt: null });
    expect(last().html).not.toContain("Vamos também tentar de novo");
    expect(last().html).toContain("não vamos tentar de novo sozinhos");
  });

  it("auth: confirmação no mesmo cartão, sem promessa de nova tentativa", async () => {
    expect(await failed("auth")).toBe(true);
    const html = last().html;
    expect(html).toContain("O seu banco pede-lhe uma confirmação para a cobrança de 1250 € no cartão ••••4242.");
    expect(html).toContain("O seu banco pede uma confirmação.");
    expect(html).toContain(">Confirmar com o cartão ••••4242<");
    expect(html).not.toContain("Vamos também tentar de novo");
    expect(html).toContain("não vamos tentar de novo sozinhos");
  });

  it.each(EMAIL_LANGS)("%s, hard: outro cartão, sem causa, sem nova tentativa, sem vocabulário proibido", async (lang) => {
    expect(await failed("hard", { locale: lang })).toBe(true);
    const html = last().html;
    const P = PAYPLAN_I18N[lang];
    expect(html).toContain(P.failedCtaHard);
    expect(html).toContain(escapeQuotes(P.deadlineHard(fmtDeadline(lang))));
    expect(html).not.toMatch(CAUSES);
    expect(html).not.toMatch(BANNED);
  });

  it("H já passado: não envia (o aviso não daria os 7 dias)", async () => {
    expect(await failed("soft", { now: new Date("2099-07-06T00:00:00Z") })).toBe(false);
    expect(fake.send).not.toHaveBeenCalled();
  });

  it("sem valor pago: 'devolvemos o que já pagou'", async () => {
    await failed("hard", { amountPaidCents: null });
    expect(last().html).toContain("devolvemos o que já pagou");
  });
});

/** O prazo como o email o escreve, para comparar com o texto da língua. */
function fmtDeadline(lang: EmailLang): string {
  const tag = { pt: "pt-PT", en: "en-GB", fr: "fr-FR", es: "es-ES", it: "it-IT", de: "de-DE", nl: "nl-NL", sv: "sv-SE", fi: "fi-FI" }[lang];
  const day = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Lisbon" }).format(H);
  const time = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Lisbon" }).format(H);
  return PAYPLAN_I18N[lang].deadline(day, time);
}
const escapeQuotes = (s: string) => s.replace(/"/g, "&quot;");

describe("sendBalanceLastCall (E3b)", () => {
  const call = (now: Date) => email.sendBalanceLastCall({ ...guest, locale: "pt", checkIn: "2099-07-15", amountCents: 125_000, hardStopAt: H, link: LINK, now });

  it("na véspera de H: 'o prazo termina amanhã, …' com hora de Lisboa", async () => {
    expect(await call(new Date("2099-07-04T09:00:00Z"))).toBe(true);
    expect(last().subject).toBe("Amanhã termina o prazo da segunda parte da sua estadia em Casa Sintética");
    expect(last().html).toContain("Ainda não recebemos 1250 € e o prazo termina amanhã, 5 de julho de 2099 às 12:00, hora de Lisboa.");
  });

  it("fora da véspera (antes ou no próprio dia) não sai", async () => {
    expect(await call(new Date("2099-07-02T09:00:00Z"))).toBe(false);
    expect(await call(new Date("2099-07-05T08:00:00Z"))).toBe(false);
    expect(fake.send).not.toHaveBeenCalled();
  });
});

describe("sendBalancePaid (E4)", () => {
  const paid = (extra: Record<string, unknown> = {}) => email.sendBalancePaid({
    ...guest, locale: "pt", checkIn: "2099-07-15", checkOut: "2099-07-22", amountCents: 125_000,
    totalPaidCents: 273_000, cardLast4: "4242", confirmationCode: "GY-SYNTH", ...extra,
  });

  it("paga na totalidade, total pago, código e fatura após a estadia", async () => {
    expect(await paid()).toBe(true);
    const m = last();
    expect(m.subject).toBe("A sua estadia em Casa Sintética está paga na totalidade");
    expect(m.html).toContain("Está tudo pago. Até 15 de julho.");
    expect(m.html).toContain("Recebemos a segunda parte, 1250 €, no cartão ••••4242.");
    expect(m.html).toContain("A fatura é emitida após a estadia.");
    expect(m.html).toContain("2730 €");
    expect(m.html).toContain("GY-SYNTH");
  });

  it("com a emissão confirmada: 'A fatura segue em email separado.'", async () => {
    await paid({ invoiceBySeparateEmail: true });
    expect(last().html).toContain("A fatura segue em email separado.");
  });

  it("total pago menor do que a 2.ª parte: dados incoerentes, não envia", async () => {
    expect(await paid({ totalPaidCents: 100 })).toBe(false);
  });
});

describe("sendBalanceCancelled (E5 e E7)", () => {
  const cancelled = (kind: "unpaid" | "guest" | "team", extra: Record<string, unknown> = {}) => email.sendBalanceCancelled({
    kind, ...guest, locale: "pt", checkIn: "2099-07-15", checkOut: "2099-07-22", refundCents: 148_000,
    confirmationCode: "GY-SYNTH", ...extra,
  } as any);

  it("E5 com prazo, cartão e nota de crédito", async () => {
    expect(await cancelled("unpaid", { deadlineAt: H, refundCardsLast4: ["4242"], creditNoteRef: "NC 2099/7" })).toBe(true);
    const m = last();
    expect(m.subject).toBe("A sua reserva em Casa Sintética foi cancelada");
    expect(m.html).toContain("Não recebemos a segunda parte da sua estadia em Casa Sintética até 5 de julho de 2099 às 12:00, hora de Lisboa, por isso a reserva foi cancelada, como explicámos.");
    expect(m.html).toContain("Os 1480 € que pagou voltam ao cartão ••••4242 dentro de 5 a 10 dias úteis, conforme o banco.");
    expect(m.html).toContain("Referência da nota de crédito: NC 2099/7.");
    expect(m.html).toContain(PAYPLAN_I18N.pt.rebook);
  });

  it("E5 só com os campos do contrato: frases sem data, sem dígitos e sem NC", async () => {
    expect(await cancelled("unpaid")).toBe(true);
    const html = last().html;
    expect(html).toContain("dentro do prazo, por isso a reserva foi cancelada");
    expect(html).toContain("voltam ao cartão com que pagou");
    expect(html).not.toContain("nota de crédito");
  });

  it("E7: cancelamento confirmado, nenhuma outra cobrança", async () => {
    expect(await cancelled("guest", { refundCardsLast4: ["4242"] })).toBe(true);
    expect(last().subject).toBe("Cancelamento confirmado: Casa Sintética");
    expect(last().html).toContain("Cancelámos a sua reserva em Casa Sintética, de 15 de julho a 22 de julho, como pediu, dentro do prazo de cancelamento gratuito. Devolvemos 1480 € ao cartão ••••4242 em 5 a 10 dias úteis.");
    expect(last().html).toContain("nenhuma outra cobrança será feita");
  });

  it("sem devolução (0 €): não promete reembolso", async () => {
    await cancelled("guest", { refundCents: 0 });
    expect(last().html).not.toContain("Devolvemos");
    await cancelled("team", { refundCents: 0 });
    expect(last().html).not.toContain("devolvemos");
  });

  it("dois cartões (1.ª parte e 2.ª parte noutro cartão): ambos, pela ordem dada", async () => {
    expect(await cancelled("unpaid", { refundCardsLast4: ["4242", "5555"] })).toBe(true);
    expect(last().html).toContain("voltam aos cartões ••••4242 e ••••5555 dentro de 5 a 10 dias úteis");
    expect(await cancelled("guest", { refundCardsLast4: ["5555", "4242"] })).toBe(true);
    expect(last().html).toContain("Devolvemos 1480 € aos cartões ••••5555 e ••••4242 em 5 a 10 dias úteis.");
  });

  it("cartões: só 4 dígitos, sem repetidos; o que sobra decide singular, plural ou sem dígitos", async () => {
    await cancelled("guest", { refundCardsLast4: ["4242", "4242"] });
    expect(last().html).toContain("Devolvemos 1480 € ao cartão ••••4242 em");
    await cancelled("guest", { refundCardsLast4: ["42", "abcd", null, "4242 "] });
    expect(last().html).toContain("Devolvemos 1480 € ao cartão ••••4242 em");
    await cancelled("guest", { refundCardsLast4: ["12345"] });
    expect(last().html).toContain("Devolvemos 1480 € ao cartão com que pagou em");
    await cancelled("guest", { refundCardsLast4: null });
    expect(last().html).toContain("ao cartão com que pagou");
  });

  it("equipa ('Devolver tudo'): assunto do E5, texto neutro, nunca 'como pediu', prazo nem falta de pagamento", async () => {
    expect(await cancelled("team", { refundCents: 273_000, refundCardsLast4: ["4242", "5555"], creditNoteRef: "NC 9" })).toBe(true);
    const m = last();
    expect(m.subject).toBe("A sua reserva em Casa Sintética foi cancelada");
    expect(m.html).toContain(PAYPLAN_I18N.pt.cancelledHeadline);
    expect(m.html).toContain("Cancelámos a sua reserva em Casa Sintética, de 15 de julho a 22 de julho, e devolvemos 2730 € aos cartões ••••4242 e ••••5555, em 5 a 10 dias úteis, conforme o banco.");
    expect(m.html).toContain("Referência da nota de crédito: NC 9.");
    expect(m.html).toContain("nenhuma outra cobrança será feita");
    expect(m.html).not.toMatch(/como pediu|prazo|não recebemos|segunda parte/i);
    expect(m.html).not.toContain(PAYPLAN_I18N.pt.rebook);
  });

  it.each(EMAIL_LANGS)("%s: o texto da equipa nunca diz 'a seu pedido' nem 'dentro do prazo'", (lang) => {
    const P = PAYPLAN_I18N[lang];
    const slots = { greeting: P.hello("Ana"), house: "Casa", checkIn: "10 X", checkOut: "15 X", refund: "2 730 €", cards: ["4242"], creditNote: null };
    const team = P.teamCancelledBody(slots);
    expect(team).toContain("••••4242");
    expect(team).toContain("2 730 €");
    expect(team).not.toMatch(/as requested|como pediu|comme demandé|tal como pidió|come richiesto|wie gewünscht|op uw verzoek|enligt din begäran|pyyntösi mukaisesti/i);
    expect(team).not.toMatch(/free cancellation|cancelamento gratuito|annulation gratuite|cancelación gratuita|cancellazione gratuita|kostenlosen Stornierung|gratis annuleren|gratis avbokning|maksuttoman peruutuksen/i);
  });
});

describe("todas as variantes ao hóspede, nas 9 línguas", () => {
  it.each(EMAIL_LANGS)("%s: saem, na língua, sem vocabulário proibido e sem buracos", async (lang) => {
    const base = { ...guest, locale: lang };
    const sends = [
      () => email.sendBalanceReminder({ ...base, stage: 1, checkIn: "2099-07-15", checkOut: "2099-07-22", amountCents: 125_000, chargeAt: C, cardBrand: "mastercard", cardLast4: "4242", cardExpiresBeforeCharge: true, link: LINK, now: new Date("2099-06-21T08:00:00Z") }),
      () => email.sendBalanceReminder({ ...base, stage: 2, checkIn: "2099-07-15", checkOut: "2099-07-22", amountCents: 125_000, chargeAt: C, cardLast4: null, cardExpiresBeforeCharge: false, link: LINK, now: new Date("2099-06-27T08:00:00Z") }),
      () => failed("soft", { locale: lang }),
      () => failed("auth", { locale: lang, cardLast4: null }),
      () => failed("hard", { locale: lang }),
      () => email.sendBalanceLastCall({ ...base, checkIn: "2099-07-15", amountCents: 125_000, hardStopAt: H, link: LINK, now: new Date("2099-07-04T09:00:00Z") }),
      () => email.sendBalancePaid({ ...base, checkIn: "2099-07-15", checkOut: "2099-07-22", amountCents: 125_000, totalPaidCents: 273_000, cardLast4: "4242", confirmationCode: "GY-1" }),
      () => email.sendBalanceCancelled({ ...base, kind: "unpaid", checkIn: "2099-07-15", checkOut: "2099-07-22", refundCents: 148_000, confirmationCode: "GY-1", deadlineAt: H, refundCardsLast4: ["4242"], creditNoteRef: "NC 1" }),
      () => email.sendBalanceCancelled({ ...base, kind: "guest", checkIn: "2099-07-15", checkOut: "2099-07-22", refundCents: 148_000, confirmationCode: "GY-1" }),
      () => email.sendBalanceCancelled({ ...base, kind: "guest", checkIn: "2099-07-15", checkOut: "2099-07-22", refundCents: 148_000, refundCardsLast4: ["4242", "5555"] }),
      () => email.sendBalanceCancelled({ ...base, kind: "team", checkIn: "2099-07-15", checkOut: "2099-07-22", refundCents: 273_000, confirmationCode: "GY-1", refundCardsLast4: ["4242", "5555"], creditNoteRef: "NC 1" }),
      () => email.sendBalanceCancelled({ ...base, kind: "team", checkIn: "2099-07-15", checkOut: "2099-07-22", refundCents: 0 }),
      () => email.sendBalanceCardUpdated({ ...base, checkIn: "2099-07-15", amountCents: 125_000, chargeAt: C, cardLast4: "5555", link: LINK }),
    ];
    for (const send of sends) {
      fake.send.mockClear();
      expect(await send()).toBe(true);
      const m = last();
      expect(m.html).toContain(`<html lang="${lang}">`);
      expect(m.subject).not.toMatch(BANNED);
      expect(m.html).not.toMatch(BANNED);
      expect(m.html).not.toMatch(/\bundefined\b|\bnull\b|\bNaN\b|\[object/);
      if (lang !== "en") expect(m.html).not.toMatch(/privacy of a home|Your payment plan|second part/i);
    }
  });
});

describe("entrega: true só com o envio aceite", () => {
  const send = () => email.sendBalancePaid({ ...guest, locale: "pt", checkIn: "2099-07-15", checkOut: "2099-07-22", amountCents: 125_000, totalPaidCents: 273_000 });

  it("erro do Resend → false", async () => {
    fake.send.mockResolvedValue({ data: null, error: { message: "synthetic" } });
    expect(await send()).toBe(false);
  });

  it("resposta sem id → false", async () => {
    fake.send.mockResolvedValue({ data: {}, error: null });
    expect(await send()).toBe(false);
  });

  it("exceção do cliente → false, nunca lança", async () => {
    fake.send.mockRejectedValue(new Error("network"));
    await expect(send()).resolves.toBe(false);
  });

  it("preview/DEV → false sem chamar o Resend", async () => {
    vi.stubEnv("APP_ENV", "preview");
    try {
      expect(await send()).toBe(false);
      expect(fake.send).not.toHaveBeenCalled();
    } finally {
      vi.stubEnv("APP_ENV", "production");
    }
  });

  it("sem email válido → false", async () => {
    expect(await email.sendBalancePaid({ ...guest, email: "not-an-email", locale: "pt", checkIn: "2099-07-15", checkOut: "2099-07-22", amountCents: 1, totalPaidCents: 2 })).toBe(false);
    expect(fake.send).not.toHaveBeenCalled();
  });

  it("sem RESEND_API_KEY (modo dev) → false: um aviso que não saiu nunca conta como enviado", async () => {
    vi.resetModules();
    vi.stubEnv("RESEND_API_KEY", "");
    try {
      const fresh = await import("./transactional-email");
      expect(await fresh.sendBalancePaid({ ...guest, locale: "pt", checkIn: "2099-07-15", checkOut: "2099-07-22", amountCents: 125_000, totalPaidCents: 273_000 })).toBe(false);
      expect(fake.send).not.toHaveBeenCalled();
    } finally {
      vi.stubEnv("RESEND_API_KEY", "synthetic-mocked-email-only");
    }
  });
});

/* ── Confirmação e manifesto ── */

const PLAN = {
  amountTodayCents: 148_000, amountLaterCents: 125_000, chargeAt: C, freeCancelDeadlineAt: D,
  cardLast4: "4242", manageUrl: LINK,
};
const confirmationBase = {
  email: "guest@checkout.invalid", guestFirstName: "Ana", propertyName: "Casa Sintética", destination: "minho",
  checkIn: "2099-07-15", checkOut: "2099-07-22", guests: 4, confirmationCode: "GY-SYNTH",
  canonical: { lines: [], receptionCents: 0, flexCents: 0, totalCents: 273_000 },
  quote: { nights: 7, totalNights: 2600, cleaningFee: 100, taxesAndFees: 30, total: 2730 },
  cancellation: { policy: "MODERATE" }, intentId: "3f1c2a9e-8b7d-4c6e-9f00-1234567890ab",
};

describe("confirmação ao hóspede com o plano (E0)", () => {
  it("sem plano e com plan: null o email é exatamente o mesmo, sem nenhuma linha do plano", async () => {
    await email.sendCheckoutGuestConfirmation({ ...confirmationBase, locale: "pt" });
    const without = last().html;
    await email.sendCheckoutGuestConfirmation({ ...confirmationBase, locale: "pt", plan: null });
    expect(last().html).toBe(without);
    expect(without).not.toContain(PAYPLAN_I18N.pt.planTitle);
    expect(without).not.toContain(PAYPLAN_I18N.pt.noWithdrawal);
  });

  it("com plano: hoje, a data, o cartão, o prazo com hora de Lisboa, o botão e a livre resolução", async () => {
    await email.sendCheckoutGuestConfirmation({ ...confirmationBase, locale: "pt", plan: PLAN });
    const html = last().html;
    expect(html).toContain("O seu plano de pagamento");
    expect(html).toContain("Hoje, pago: 1480 € no cartão ••••4242");
    expect(html).toContain("A 28 de junho de 2099: 1250 €, cobrado automaticamente no mesmo cartão");
    expect(html).toContain("Pode cancelar sem custos até 8 de julho de 2099 às 23:59, hora de Lisboa.");
    expect(html).toContain(PAYPLAN_I18N.pt.planNoteManage);
    expect(html).toContain(`href="${LINK}"`);
    expect(html).toContain(">Gerir o pagamento<");
    expect(html).toContain(PAYPLAN_I18N.pt.noWithdrawal);
    // O total continua a ser o preço apresentado.
    expect(html).toContain("2730 €");
  });

  it("sem link de gestão (ou com um link de DEV): nem botão nem 'basta um clique'", async () => {
    for (const manageUrl of [null, DEV_LINK]) {
      await email.sendCheckoutGuestConfirmation({ ...confirmationBase, locale: "pt", plan: { ...PLAN, manageUrl } });
      const html = last().html;
      expect(html).toContain("O seu plano de pagamento");
      expect(html).not.toContain(PAYPLAN_I18N.pt.planNoteManage);
      expect(html).not.toContain(">Gerir o pagamento<");
      expect(html).not.toContain("dev.portugalactive.com");
    }
  });

  it("sem últimos 4 dígitos: 'Hoje, pago: X' sem cartão", async () => {
    await email.sendCheckoutGuestConfirmation({ ...confirmationBase, locale: "pt", plan: { ...PLAN, cardLast4: null } });
    expect(last().html).toContain("Hoje, pago: 1480 €</p>");
  });

  it("plano inválido: o bloco sai, a confirmação não", async () => {
    await email.sendCheckoutGuestConfirmation({ ...confirmationBase, locale: "pt", plan: { ...PLAN, amountLaterCents: 0 } });
    expect(fake.send).toHaveBeenCalledOnce();
    expect(last().html).not.toContain("O seu plano de pagamento");
  });

  it.each(EMAIL_LANGS)("%s: bloco do plano na língua, sem vocabulário proibido", async (lang) => {
    await email.sendCheckoutGuestConfirmation({ ...confirmationBase, locale: lang, plan: PLAN });
    const html = last().html;
    expect(html).toContain(PAYPLAN_I18N[lang].planTitle);
    expect(html).toContain(PAYPLAN_I18N[lang].productName);
    expect(html).not.toMatch(BANNED);
  });
});

describe("manifesto do CS com o plano", () => {
  const manifestBase = {
    confirmationCode: "GY-SYNTH", reservationId: "synthetic-reservation", propertyName: "Casa Sintética",
    checkIn: "2099-07-15", checkOut: "2099-07-22", guests: 4, email: "guest@checkout.invalid",
    guestName: "Ana Teste", guestPhone: "+351900000000", reception: { type: "self" },
    intentId: "3f1c2a9e-8b7d-4c6e-9f00-1234567890ab",
    canonical: { lines: [{ sku: "private-chef", cents: 25_000 }], receptionCents: 0, flexCents: 0, totalCents: 273_000 },
    extras: [{ sku: "private-chef", amount: 250, people: 4 }],
  };

  it("sem plano: 'Total pago' como antes e nada de duas partes", async () => {
    await email.sendCheckoutOpsManifest(manifestBase);
    const cs = sentTo("cs@checkout.invalid");
    expect(cs.subject).toBe("[CS] Reserva GY-SYNTH · Casa Sintética");
    expect(cs.html).toContain(">Total pago</td>");
    expect(cs.html).toContain("2730.00 EUR");
    expect(cs.html).not.toContain("DUAS PARTES");
  });

  it("com plano: destaque NÃO cobrar, 'Pago hoje' com o valor do PI e a 2.ª parte agendada", async () => {
    await email.sendCheckoutOpsManifest({ ...manifestBase, plan: PLAN });
    const cs = sentTo("cs@checkout.invalid");
    expect(cs.subject).toBe("[CS] Reserva GY-SYNTH · Casa Sintética · DUAS PARTES, NAO COBRAR");
    expect(cs.html).toContain("PAGAMENTO EM DUAS PARTES: pago 1480.00 EUR; 1250.00 EUR agendado para 28/06/2099, cobrado AUTOMATICAMENTE pela plataforma. NÃO cobrar.");
    expect(cs.html).toContain("NÃO cobrar no Guesty");
    expect(cs.html).toContain("Cancelamento gratuito até 08/07/2099 às 23:59 (Lisboa)");
    expect(cs.html).toContain(">Pago hoje</td>");
    expect(cs.html).toContain("<strong>1480.00 EUR</strong> (estadia 1230.00 + servicos 250.00)");
    expect(cs.html).toContain(">2.ª parte</td>");
    expect(cs.html).toContain("1250.00 EUR a 28/06/2099, cobrada automaticamente pela plataforma");
    expect(cs.html).toContain(">Total da reserva</td>");
    expect(cs.html).not.toContain(">Total pago</td>");
    // A cópia de vendas leva o mesmo destaque.
    expect(sentTo("sales@checkout.invalid").html).toContain("PAGAMENTO EM DUAS PARTES");
  });
});

/* ── Digest ── */

describe("sendBalanceDigest", () => {
  const now = new Date("2099-06-28T08:00:00Z"); // 09:00 de Lisboa
  const row = (over: Record<string, unknown>) => ({
    id: `row-${Math.random().toString(36).slice(2, 8)}`, intentId: "intent-1", confirmationCode: "GY-1",
    propertyName: "Casa <Sintética>", checkIn: "2099-07-15", balanceCents: 125_000, ...over,
  });

  it("assunto da spec 3.3, os blocos por ordem, booking@ e cópia à gestão", async () => {
    const ok = await email.sendBalanceDigest({
      now, livemode: true, siteOrigin: "https://www.portugalactive.com",
      counts: { scheduled: 3, retry: 1, needs_review: 1 },
      upcoming7d: [row({ status: "scheduled", chargeAt: new Date("2099-06-28T09:00:00Z"), nextAttemptAt: new Date("2099-06-28T09:00:00Z") }),
        row({ status: "scheduled", chargeAt: new Date("2099-07-02T09:00:00Z"), nextAttemptAt: new Date("2099-07-02T09:00:00Z"), balanceCents: 100_000 })],
      failing: [row({ status: "retry", lastDeclineCode: "insufficient_funds", nextAttemptAt: new Date("2099-06-29T09:00:00Z"), hardStopAt: new Date("2099-06-29T11:00:00Z"), failureNoticeSentAt: new Date("2099-06-22T09:00:00Z"), failureNoticeStage: 1, smsStage: 1 })],
      review: [row({ status: "needs_review", reviewReason: "pagamento parcial por fora", reviewDueAt: new Date("2099-07-01T11:00:00Z"), updatedAt: new Date("2099-06-25T08:00:00Z") })],
      cancelled24h: [row({ status: "cancelled_unpaid", refundStatus: "failed", refundCents: 148_000, refundId: "re_1" })],
      postChargeIncomplete: [row({ status: "succeeded", guestyBalanceRecordedAt: null, noteClaimedAt: new Date(), emailPaidClaimedAt: new Date() })],
      stuckCharging: [],
      heartbeatAt: new Date("2099-06-28T07:55:00Z"),
      chargesEnabled: true,
    } as any);
    expect(ok).toBe(true);
    const cs = sentTo("cs@checkout.invalid");
    expect(cs.subject).toBe("[OPS] Duas partes · HOJE: 1 cobrança(s) (1 250 €) · A RESOLVER POR NÓS: 3 · CANCELAM AMANHÃ: 1");
    const html: string = cs.html;
    const order = ["A RESOLVER POR NÓS", "A RESOLVER PELO HÓSPEDE", "CANCELAM AUTOMATICAMENTE NAS PRÓXIMAS 48 H", "COBRAM HOJE", "CANCELADAS NAS ÚLTIMAS 24 H", "PRÓXIMOS 7 DIAS", "SAÚDE"];
    const positions = order.map((t) => html.indexOf(t));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain("saldo insuficiente");
    expect(html).toContain("pagamento parcial por fora");
    expect(html).toContain("há 3 dia(s)");
    expect(html).toContain("REEMBOLSO por confirmar");
    expect(html).toContain("falta: registo no Guesty");
    expect(html).toContain("2 cobrança(s), 2 250 €");
    expect(html).toContain("Casa &lt;Sintética&gt;");
    expect(html).not.toContain("Casa <Sintética>");
    expect(html).toContain("avisos enviados: email 1/2, SMS 1/2");
    expect(html).toContain("motor LIGADO");
    expect(html).not.toContain("MOTOR DESLIGADO");
    expect(sentTo("sales@checkout.invalid")).toBeTruthy();
  });

  const empty = { counts: {}, upcoming7d: [], failing: [], review: [], cancelled24h: [], postChargeIncomplete: [], stuckCharging: [] };

  it("REEMBOLSOS POR RESOLVER: falhas de qualquer data contam em A RESOLVER POR NÓS, sem repetir a linha do dia", async () => {
    const old = row({ id: "rf-old", status: "cancelled_unpaid", refundStatus: "failed", refundCents: 148_000, refundId: "re_old", cancelledAt: new Date("2099-06-01T11:00:00Z") });
    const today = row({ id: "rf-today", status: "cancelled_by_guest", refundStatus: "failed", refundCents: 50_000, refundId: "re_today" });
    await email.sendBalanceDigest({ ...empty, now, refundFailures: [old, today], cancelled24h: [today] } as any);
    const cs = sentTo("cs@checkout.invalid");
    expect(cs.subject).toContain("A RESOLVER POR NÓS: 2 ·");
    const html: string = cs.html;
    expect(html).toContain("A RESOLVER POR NÓS (2)");
    expect(html).toContain("REEMBOLSOS POR RESOLVER (2)");
    expect(html).toContain("re_old");
    expect(html).toContain("cancelado por falta de pagamento · reembolso 1480.00 EUR FALHOU (failed, re_old)");
    // A linha do dia não aparece também como "REEMBOLSO por confirmar".
    expect(html).not.toContain("REEMBOLSO por confirmar");
    expect(html.indexOf("A RESOLVER POR NÓS")).toBeLessThan(html.indexOf("REEMBOLSOS POR RESOLVER"));
    expect(html.indexOf("REEMBOLSOS POR RESOLVER")).toBeLessThan(html.indexOf("A RESOLVER PELO HÓSPEDE"));
  });

  it("refund_status 'manual' (resolvido à mão) já não é reembolso por confirmar", async () => {
    await email.sendBalanceDigest({ ...empty, now, cancelled24h: [row({ status: "cancelled_unpaid", refundStatus: "manual", refundCents: 1 })] } as any);
    const cs = sentTo("cs@checkout.invalid");
    expect(cs.subject).toContain("A RESOLVER POR NÓS: 0 ·");
    expect(cs.html).not.toContain("REEMBOLSO");
  });

  it("aviso de 7 dias que não cabe antes de H: fora de 'cancelam', em DECISÃO HUMANA ANTES DE D e contada por nós", async () => {
    const H1 = new Date("2099-06-29T11:00:00Z"); // amanhã 12:00 de Lisboa
    const fits = row({ id: "fits", status: "needs_action", hardStopAt: H1, failureNoticeSentAt: new Date("2099-06-22T09:00:00Z"), failureNoticeStage: 2, smsStage: 2 });
    const short = row({ id: "short", confirmationCode: "GY-SHORT", status: "needs_action", hardStopAt: H1, failureNoticeSentAt: new Date("2099-06-25T09:00:00Z"), freeCancelDeadline: new Date("2099-06-30T22:59:00Z"), failureNoticeStage: 1 });
    const noNotice = row({ id: "none", confirmationCode: "GY-NONE", status: "retry", hardStopAt: H1, failureNoticeSentAt: null, failureNoticeStage: 0 });
    await email.sendBalanceDigest({ ...empty, now, failing: [fits, short, noNotice] } as any);
    const cs = sentTo("cs@checkout.invalid");
    expect(cs.subject).toContain("A RESOLVER POR NÓS: 2 · CANCELAM AMANHÃ: 1");
    const html: string = cs.html;
    expect(html).toContain("CANCELAM AUTOMATICAMENTE NAS PRÓXIMAS 48 H (1)");
    expect(html).toContain("DECISÃO HUMANA ANTES DE D (2)");
    expect(html).toContain("aviso 25/06/2099");
    expect(html).toContain("aviso por enviar");
    expect(html).toContain("decidir antes de 30/06/2099, 23:59");
    const auto = html.slice(html.indexOf("CANCELAM AUTOMATICAMENTE"));
    expect(auto.slice(0, auto.indexOf("COBRAM HOJE"))).not.toContain("GY-SHORT");
    expect(html).toContain("NÃO cancela sozinha, H 29/06/2099");
    expect(html).toContain("avisos enviados: email 2/2, SMS 2/2");
  });

  it("CANCELAM AMANHÃ: só H no dia de Lisboa de amanhã (H de hoje às 12:00 não conta)", async () => {
    const notice = new Date("2099-06-10T09:00:00Z");
    const todayH = row({ status: "needs_action", hardStopAt: new Date("2099-06-28T11:00:00Z"), failureNoticeSentAt: notice });
    const tomorrowH = row({ status: "needs_action", hardStopAt: new Date("2099-06-29T11:00:00Z"), failureNoticeSentAt: notice });
    const later = row({ status: "needs_action", hardStopAt: new Date("2099-06-30T11:00:00Z"), failureNoticeSentAt: notice });
    await email.sendBalanceDigest({ ...empty, now, failing: [todayH, tomorrowH, later] } as any);
    const cs = sentTo("cs@checkout.invalid");
    expect(cs.subject).toContain("CANCELAM AMANHÃ: 1");
    expect(cs.html).toContain("CANCELAM AUTOMATICAMENTE NAS PRÓXIMAS 48 H (2)");
  });

  it("estágio 3 (véspera fechada sem E3b): não conta como 2/2", async () => {
    const r = row({ status: "needs_action", hardStopAt: new Date("2099-06-29T11:00:00Z"), failureNoticeSentAt: new Date("2099-06-20T09:00:00Z"), failureNoticeStage: 3, smsStage: 1 });
    await email.sendBalanceDigest({ ...empty, now, failing: [r] } as any);
    const html = sentTo("cs@checkout.invalid").html;
    expect(html).toContain("avisos enviados: email 1/2 (véspera sem email), SMS 1/2");
    expect(html).not.toContain("email 2/2");
  });

  it("motor desligado: abre com MOTOR DESLIGADO e as linhas abertas, também no assunto", async () => {
    await email.sendBalanceDigest({
      ...empty, now, chargesEnabled: false,
      counts: { scheduled: 4, retry: 1, needs_review: 2, succeeded: 9, cancelled_unpaid: 3 },
    } as any);
    const cs = sentTo("cs@checkout.invalid");
    expect(cs.subject).toContain("Duas partes · MOTOR DESLIGADO · 7 linha(s) aberta(s) · A RESOLVER POR NÓS:");
    expect(cs.subject).not.toContain("CANCELAM AMANHÃ");
    const html: string = cs.html;
    expect(html).toContain("MOTOR DESLIGADO: nada é cobrado nem cancelado automaticamente; 7 linhas abertas.");
    expect(html.indexOf("MOTOR DESLIGADO")).toBeLessThan(html.indexOf("A RESOLVER POR NÓS"));
    expect(html).toContain("motor DESLIGADO (CHECKOUT_BALANCE)");
  });

  it("motor desligado: nada promete cobrar nem cancelar sozinho", async () => {
    const H1 = new Date("2099-06-29T11:00:00Z"); // amanhã 12:00 de Lisboa
    const fits = row({ id: "fits", status: "retry", nextAttemptAt: new Date("2099-06-28T09:00:00Z"), hardStopAt: H1, failureNoticeSentAt: new Date("2099-06-20T09:00:00Z"), failureNoticeStage: 1 });
    const today = row({ id: "today", confirmationCode: "GY-TODAY", status: "scheduled", chargeAt: new Date("2099-06-28T09:00:00Z") });
    await email.sendBalanceDigest({ ...empty, now, chargesEnabled: false, counts: { retry: 1, scheduled: 1 }, failing: [fits], upcoming7d: [today] } as any);
    const cs = sentTo("cs@checkout.invalid");
    expect(cs.subject).toContain("PREVISTAS HOJE (não cobradas): 2 · H AMANHÃ: 1");
    const html: string = cs.html;
    expect(html).not.toContain("CANCELAM AUTOMATICAMENTE");
    expect(html).not.toContain("cancela e devolve");
    expect(html).not.toContain("COBRAM HOJE");
    expect(html).toContain("H NAS PRÓXIMAS 48 H (motor desligado: NÃO cancelam sozinhas, decidir à mão) (1)");
    expect(html).toContain("PREVISTAS PARA HOJE (motor desligado: NÃO são cobradas) (2)");
    expect(html).toContain("NÃO cancela sozinha (motor desligado), H 29/06/2099");
    expect(html).toContain("(parada)");
  });

  it("vazio também sai (se não chegar, o sweep está parado)", async () => {
    const ok = await email.sendBalanceDigest({ now, counts: {}, upcoming7d: [], failing: [], review: [], cancelled24h: [], postChargeIncomplete: [], stuckCharging: [] } as any);
    expect(ok).toBe(true);
    const cs = sentTo("cs@checkout.invalid");
    expect(cs.subject).toBe("[OPS] Duas partes · HOJE: 0 cobrança(s) (0 €) · A RESOLVER POR NÓS: 0 · CANCELAM AMANHÃ: 0");
    expect(cs.html).toContain("último sweep: sem registo");
  });

  it("aceita o instante como generatedAt; só livemode=false marca TESTE", async () => {
    await email.sendBalanceDigest({ generatedAt: now, counts: {}, upcoming7d: [], failing: [], review: [], cancelled24h: [], postChargeIncomplete: [], stuckCharging: [] } as any);
    expect(sentTo("cs@checkout.invalid").subject).not.toContain("TESTE");
    fake.send.mockClear();
    await email.sendBalanceDigest({ now, livemode: false, counts: {}, upcoming7d: [], failing: [], review: [], cancelled24h: [], postChargeIncomplete: [], stuckCharging: [] } as any);
    expect(sentTo("cs@checkout.invalid").subject).toContain("Duas partes (TESTE)");
  });

  it("no dia 1 do mês lembra a verificação das automações do Guesty", async () => {
    await email.sendBalanceDigest({ now: new Date("2099-07-01T08:00:00Z"), counts: {}, upcoming7d: [], failing: [], review: [], cancelled24h: [], postChargeIncomplete: [], stuckCharging: [] } as any);
    expect(sentTo("cs@checkout.invalid").html).toContain("website-checkout, website-paypal e website-klarna");
  });
});
