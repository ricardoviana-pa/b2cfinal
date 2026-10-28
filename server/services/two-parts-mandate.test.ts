import { createHash } from "crypto";
import { describe, it, expect } from "vitest";
import { lisbonWallTimeToUtc, twoPartsInstants, twoPartsSchedule } from "./payment-plan";
import {
  FLEX_IMMEDIATE_CONSENT_VERSION,
  TWO_PARTS_MANDATE_VERSION,
  renderTwoPartsMandate,
  type MandateValues,
} from "./two-parts-mandate";

const NB = "\u00a0";

/** O exemplo da spec 2.3: moderate, check-in a 15 jul 2027 (C = 28 jun, retentativas 29 jun e 1 jul, D = 8 jul). */
function specExample(amountLaterCents = 126_200): MandateValues {
  const i = twoPartsInstants(twoPartsSchedule("moderate", "2027-07-15")!);
  return { amountLaterCents, chargeAt: i.chargeAt, retryAt: i.retryAt, freeCancelDeadlineAt: i.freeCancelDeadlineAt };
}

describe("renderTwoPartsMandate — texto da spec 6.2", () => {
  it("pt-PT: caixa e parágrafo com montante, datas e prazo de Lisboa", () => {
    const m = renderTwoPartsMandate("pt", specExample());
    expect(m.lang).toBe("pt");
    expect(m.version).toBe(TWO_PARTS_MANDATE_VERSION);
    // Espaços não separáveis no montante: agrupado mesmo com 4 algarismos e sem partir a linha.
    expect(m.checkbox).toContain("1\u00a0262,00\u00a0€");
    // Texto fixo, escrito à mão para o espaço não separável ficar visível (NB).
    // Se falhar, o texto mudou e TWO_PARTS_MANDATE_VERSION tem de subir.
    expect(m.checkbox).toBe(
      `Autorizo a Portugal Active a cobrar 1${NB}262,00${NB}€ a 28 de junho de 2027 no cartão que uso agora, ` +
        `como segunda e última parte desta estadia, e, se essa cobrança for recusada, ` +
        `a tentar de novo o mesmo valor até 8 de julho de 2027 às 23:59 (hora de Lisboa).`,
    );
    expect(m.text).toBe(
      `Ao pagar, autoriza a Portugal Active a cobrar 1${NB}262,00${NB}€ a 28 de junho de 2027, no cartão que usar agora, ` +
        `como segunda e última parte desta estadia. Se a cobrança for recusada, avisamos por email, ` +
        `tentamos de novo o mesmo valor em 29 de junho de 2027 e 1 de julho de 2027, e tem 7 dias, contados do aviso, ` +
        `para pagar por outro meio; caso contrário a reserva é cancelada e devolvemos tudo o que pagou. ` +
        `Pode pagar antes, mudar de cartão ou cancelar a qualquer momento, no link da sua confirmação. ` +
        `Cancelamento gratuito até 8 de julho de 2027 às 23:59 (hora de Lisboa).`,
    );
  });

  it("en: tradução fiel, inglês britânico", () => {
    const m = renderTwoPartsMandate("en", specExample());
    expect(m.lang).toBe("en");
    // Como no pt: se o snapshot falhar, o texto mudou e a versão tem de subir.
    expect(m.checkbox).toMatchInlineSnapshot(`"I authorise Portugal Active to charge €1,262.00 on 28 June 2027 to the card I am using now, as the second and final part of this stay, and, if that charge is declined, to retry the same amount until 8 July 2027 at 23:59 (Lisbon time)."`);
    expect(m.text).toMatchInlineSnapshot(`"By paying, you authorise Portugal Active to charge €1,262.00 on 28 June 2027 to the card you are using now, as the second and final part of this stay. If the charge is declined, we will let you know by email, retry the same amount on 29 June 2027 and 1 July 2027, and you will have 7 days from that notice to pay by another method; otherwise the booking is cancelled and we refund everything you paid. You can pay early, change your card or cancel at any time, using the link in your confirmation. Free cancellation until 8 July 2027 at 23:59 (Lisbon time)."`);
  });

  it("o prazo diz a hora de Lisboa, não a UTC (no verão D é 22:59Z)", () => {
    const v = specExample();
    expect(v.freeCancelDeadlineAt.toISOString()).toBe("2027-07-08T22:59:00.000Z");
    expect(renderTwoPartsMandate("en", v).checkbox).toContain("8 July 2027 at 23:59 (Lisbon time)");
  });

  it("no inverno e no dia da mudança de hora de outubro o prazo continua a ser 23:59 desse dia", () => {
    // D = 31 out 2027 (último domingo de outubro): Lisboa já está em UTC+0 às 23:59.
    const v: MandateValues = {
      amountLaterCents: 50_000,
      chargeAt: lisbonWallTimeToUtc("2027-10-21", 10, 0),
      retryAt: [lisbonWallTimeToUtc("2027-10-22", 10, 0), lisbonWallTimeToUtc("2027-10-24", 10, 0)],
      freeCancelDeadlineAt: lisbonWallTimeToUtc("2027-10-31", 23, 59),
    };
    expect(v.freeCancelDeadlineAt.toISOString()).toBe("2027-10-31T23:59:00.000Z");
    const pt = renderTwoPartsMandate("pt", v);
    expect(pt.checkbox).toContain("500,00\u00a0€ a 21 de outubro de 2027");
    expect(pt.text).toContain("em 22 de outubro de 2027 e 24 de outubro de 2027");
    expect(pt.text).toContain("até 31 de outubro de 2027 às 23:59 (hora de Lisboa).");
  });

  it("o dia de cada data é o de Lisboa, mesmo quando em UTC ainda é o dia anterior", () => {
    // 28 jun 2027 23:30Z = 29 jun 00:30 em Lisboa (verão, UTC+1).
    const v: MandateValues = {
      amountLaterCents: 100_000,
      chargeAt: new Date("2027-06-28T23:30:00Z"),
      retryAt: [new Date("2027-06-30T09:00:00Z")],
      freeCancelDeadlineAt: new Date("2027-07-08T22:59:00Z"),
    };
    expect(renderTwoPartsMandate("en", v).checkbox).toContain("on 29 June 2027");
  });

  it("montantes: cêntimos sempre, milhares agrupados nas duas línguas", () => {
    const at = (c: number, l: string) => renderTwoPartsMandate(l, specExample(c)).checkbox;
    expect(at(99_999, "pt")).toContain("cobrar 999,99\u00a0€ a");
    expect(at(99_999, "en")).toContain("charge €999.99 on");
    expect(at(12_345_678, "pt")).toContain("cobrar 123\u00a0456,78\u00a0€ a");
    expect(at(12_345_678, "en")).toContain("charge €123,456.78 on");
    expect(at(100_000, "en")).toContain("charge €1,000.00 on");
  });

  it("uma só retentativa e três retentativas: a lista lê-se bem", () => {
    const base = specExample();
    const one = renderTwoPartsMandate("pt", { ...base, retryAt: base.retryAt.slice(0, 1) });
    expect(one.text).toContain("tentamos de novo o mesmo valor em 29 de junho de 2027, e tem 7 dias");
    const three = renderTwoPartsMandate("en", {
      ...base,
      retryAt: [...base.retryAt, lisbonWallTimeToUtc("2027-07-03", 10, 0)],
    });
    expect(three.text).toContain("retry the same amount on 29 June 2027, 1 July 2027 and 3 July 2027, and");
  });
});

describe("renderTwoPartsMandate — língua", () => {
  it.each(["pt", "PT", "pt-PT", "pt-BR", " pt "])("%s → pt", (l) => {
    expect(renderTwoPartsMandate(l, specExample()).lang).toBe("pt");
  });

  it.each(["en", "en-GB", "xx", "", null, undefined])("%s → en", (l) => {
    const m = renderTwoPartsMandate(l, specExample());
    expect(m.lang).toBe("en");
    expect(m).toEqual(renderTwoPartsMandate("en", specExample()));
  });

  // v2 (28 out 2026): as 9 línguas do site, com montante, data e prazo de
  // Lisboa na língua do hóspede. Traduções por rever por nativos.
  it.each([
    ["fr", "1\u00a0262,00\u00a0€", "28 juin 2027", "8 juillet 2027 à 23:59 (heure de Lisbonne)"],
    ["es", "1.262,00\u00a0€", "28 de junio de 2027", "8 de julio de 2027 a las 23:59 (hora de Lisboa)"],
    ["it", "1.262,00\u00a0€", "28 giugno 2027", "8 luglio 2027 alle 23:59 (ora di Lisbona)"],
    ["de", "1.262,00\u00a0€", "28. Juni 2027", "8. Juli 2027 um 23:59 Uhr (Lissabonner Zeit)"],
    ["nl", "€\u00a01.262,00", "28 juni 2027", "8 juli 2027 om 23:59 (Lissabonse tijd)"],
    ["sv", "1\u00a0262,00\u00a0€", "28 juni 2027", "8 juli 2027 kl. 23:59 (Lissabontid)"],
    ["fi", "1\u00a0262,00\u00a0€", "28. kesäkuuta 2027", "8. heinäkuuta 2027 klo 23:59 (Lissabonin aikaa)"],
  ])("%s: texto na língua do hóspede, com os valores do motor", (l, amount, date, deadline) => {
    const m = renderTwoPartsMandate(l, specExample());
    expect(m.lang).toBe(l);
    expect(m.checkbox).toContain(date);
    expect(m.checkbox).toContain(deadline);
    expect(`${m.checkbox} ${m.text}`).toMatch(/Portugal Active/);
    expect(m.text).toContain("7");
    expect(m.checkbox.replace(/\s/g, " ")).toContain(amount.replace(/\s/g, " "));
  });

  it("nunca chama seguro ao que quer que seja, nem promete SMS, em nenhuma língua", () => {
    for (const l of ["pt", "en", "fr", "es", "it", "de", "nl", "sv", "fi"]) {
      const m = renderTwoPartsMandate(l, specExample());
      expect(`${m.checkbox} ${m.text}`).not.toMatch(/segur|insur|assur|versicher|verzeker|försäkr|vakuut/i);
      expect(`${m.checkbox} ${m.text}`).not.toMatch(/SMS/);
    }
  });
});

describe("renderTwoPartsMandate — hash", () => {
  it("é o sha256 de versão, língua, caixa e parágrafo, e é determinístico", () => {
    const m = renderTwoPartsMandate("pt", specExample());
    const expected = createHash("sha256")
      .update(`${m.version}\n${m.lang}\n${m.checkbox}\n${m.text}`, "utf8")
      .digest("hex");
    expect(m.hash).toBe(expected);
    expect(m.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(renderTwoPartsMandate("pt", specExample()).hash).toBe(m.hash);
  });

  it("muda com o montante, com a data, com o prazo e com a língua", () => {
    const base = specExample();
    const h = renderTwoPartsMandate("pt", base).hash;
    expect(renderTwoPartsMandate("pt", { ...base, amountLaterCents: 126_201 }).hash).not.toBe(h);
    expect(renderTwoPartsMandate("pt", { ...base, chargeAt: lisbonWallTimeToUtc("2027-06-27", 10, 0) }).hash).not.toBe(h);
    expect(renderTwoPartsMandate("pt", { ...base, freeCancelDeadlineAt: lisbonWallTimeToUtc("2027-07-09", 23, 59) }).hash).not.toBe(h);
    expect(renderTwoPartsMandate("pt", { ...base, retryAt: [base.retryAt[0], lisbonWallTimeToUtc("2027-07-02", 10, 0)] }).hash).not.toBe(h);
    expect(renderTwoPartsMandate("en", base).hash).not.toBe(h);
  });
});

describe("renderTwoPartsMandate — valores incoerentes não dão mandato", () => {
  const base = specExample();
  it.each<[string, Partial<MandateValues>]>([
    ["montante zero", { amountLaterCents: 0 }],
    ["montante negativo", { amountLaterCents: -100 }],
    ["montante com fração de cêntimo", { amountLaterCents: 1262.5 }],
    ["montante NaN", { amountLaterCents: Number.NaN }],
    ["data de cobrança inválida", { chargeAt: new Date("x") }],
    ["prazo inválido", { freeCancelDeadlineAt: new Date(Number.NaN) }],
    ["sem retentativas", { retryAt: [] }],
    ["retentativa inválida", { retryAt: [new Date("x")] }],
    ["retentativa antes da cobrança", { retryAt: [lisbonWallTimeToUtc("2027-06-27", 10, 0)] }],
    ["retentativas fora de ordem", { retryAt: [base.retryAt[1], base.retryAt[0]] }],
    ["prazo antes da última retentativa", { freeCancelDeadlineAt: lisbonWallTimeToUtc("2027-06-30", 23, 59) }],
  ])("%s", (_name, patch) => {
    expect(() => renderTwoPartsMandate("pt", { ...base, ...patch })).toThrow(/mandato/);
  });
});

describe("versões de consentimento", () => {
  it("têm o formato data.versão", () => {
    expect(TWO_PARTS_MANDATE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/);
    expect(FLEX_IMMEDIATE_CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/);
    // Cabem nas colunas mandate_version / flex_consent_version (varchar(40)).
    expect(TWO_PARTS_MANDATE_VERSION.length).toBeLessThanOrEqual(40);
    expect(FLEX_IMMEDIATE_CONSENT_VERSION.length).toBeLessThanOrEqual(40);
  });
});
