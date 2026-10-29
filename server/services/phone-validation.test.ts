import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { defaultPhoneCountry, phoneEntry, phoneIssue, phoneIssueMessage, regionOf } from "@/lib/phone";
import { isValidPhone } from "@/lib/validation";
import { guestDetailsIssues } from "@/lib/checkoutPayment";

/**
 * Telefone do hóspede (auditoria do funil, 29 out 2026, n.º 7): o indicativo
 * abria em +351 para quem está em inglês e qualquer sequência de 7 caracteres
 * passava ("+351 912" incluído).
 */

const read = (p: string) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const LANGS = ["en", "pt", "fr", "es", "it", "de", "nl", "sv", "fi"] as const;
const locale = (lang: string) => JSON.parse(read(`client/src/i18n/locales/${lang}.json`));

describe("validação: algarismos depois do indicativo onde a regra é fixa", () => {
  it.each([
    "+351 912 345 678",
    "+351912345678",
    "+44 7700 900123",
    "+44 20 7946 0958",
    "+1 (415) 555-0123",
    "+353 87 123 4567",
    "+33 6 12 34 56 78",
    "+34 612 34 56 78",
    "+31 6 12345678",
    "+32 470 12 34 56",
    "+41 79 123 45 67",
    "+45 20 12 34 56",
    "+55 11 91234 5678",
    "+238 991 23 45",
  ])("aceita %s", (n) => {
    expect(phoneIssue(n)).toBeNull();
    expect(isValidPhone(n)).toBe(true);
  });

  it("recusa os exemplos da auditoria, com a razão", () => {
    // um número inglês com o indicativo errado
    expect(phoneIssue("+351 7700 900123")).toEqual({ kind: "length", dialCode: "+351", min: 9, max: 9 });
    // incompleto
    expect(phoneIssue("+351 912")).toEqual({ kind: "length", dialCode: "+351", min: 9, max: 9 });
    expect(isValidPhone("+351 912")).toBe(false);
  });

  it("o 0 do prefixo nacional depois do indicativo explica-se à parte", () => {
    expect(phoneIssue("+44 07700 900123")).toEqual({ kind: "leading_zero", dialCode: "+44" });
    expect(phoneIssue("+33 06 12 34 56 78")).toEqual({ kind: "leading_zero", dialCode: "+33" });
  });

  it("intervalos: Reino Unido 9 ou 10, Bélgica 8 ou 9, Irlanda 7 a 9", () => {
    expect(phoneIssue("+44 7700 9001")).toEqual({ kind: "length", dialCode: "+44", min: 9, max: 10 });
    expect(phoneIssue("+44 7700 900123 4")).toEqual({ kind: "length", dialCode: "+44", min: 9, max: 10 });
    expect(phoneIssue("+32 2 123 45 67")).toBeNull();
    expect(phoneIssue("+353 1 234 5678")).toBeNull();
  });

  it("só o indicativo (o campo vazio) conta como vazio", () => {
    for (const n of ["", "+", "+351", "+44", "+1", "+43", "  "]) expect(phoneIssue(n)).toEqual({ kind: "empty" });
  });

  it("'+0…' (apagou o indicativo e escreveu o número nacional): pede o indicativo", () => {
    expect(phoneIssue("+07700 900123")).toEqual({ kind: "country_code" });
    expect(phoneIssue("+0912345678")).toEqual({ kind: "country_code" });
    // um número nacional português lido como indiano (+91) também se explica
    expect(phoneIssue("+91 2345678")).toEqual({ kind: "length", dialCode: "+91", min: 10, max: 10 });
  });

  it("outros países: só o comprimento E.164 (8 a 15 algarismos com o indicativo), para nunca recusar um número raro", () => {
    expect(phoneIssue("+49 151 23456789")).toBeNull(); // Alemanha, comprimentos variáveis
    expect(phoneIssue("+39 06 1234 5678")).toBeNull(); // Itália: o 0 faz parte do número fixo
    expect(phoneIssue("+43 664 1234567")).toBeNull(); // Áustria
    expect(phoneIssue("+298 123456")).toBeNull(); // Faroé, 6 algarismos
    expect(phoneIssue("+43 66")).toEqual({ kind: "too_short" });
    expect(phoneIssue("+49 1512 3456 7890 1234")).toEqual({ kind: "too_long" });
  });

  it("o passo do pagamento usa esta validação", () => {
    const ok = { firstName: "Ana", lastName: "Silva", email: "ana@example.com" };
    expect(guestDetailsIssues({ ...ok, phone: "+351 912 345 678" })).toEqual([]);
    expect(guestDetailsIssues({ ...ok, phone: "+351 912" })).toEqual(["phone"]);
    expect(guestDetailsIssues({ ...ok, phone: "+351 7700 900123" })).toEqual(["phone"]);
  });
});

describe("a mensagem junto ao campo", () => {
  const t = (key: string, opts?: Record<string, unknown>) => `${key}${opts ? ` ${JSON.stringify(opts)}` : ""}`;

  it("escolhe a frase e os valores certos", () => {
    expect(phoneIssueMessage(phoneIssue("+351 912"), t)).toBe('bookingWidget.phoneErrors.digits {"dialCode":"+351","digits":9}');
    expect(phoneIssueMessage(phoneIssue("+44 7700"), t)).toBe('bookingWidget.phoneErrors.digitsRange {"dialCode":"+44","min":9,"max":10}');
    expect(phoneIssueMessage(phoneIssue("+44 07700 900123"), t)).toBe('bookingWidget.phoneErrors.leadingZero {"dialCode":"+44"}');
    expect(phoneIssueMessage(phoneIssue("+43 66"), t)).toBe("bookingWidget.phoneErrors.tooShort");
    expect(phoneIssueMessage(phoneIssue("+49 1512 3456 7890 1234"), t)).toBe("bookingWidget.phoneErrors.tooLong");
    expect(phoneIssueMessage(phoneIssue("+07700 900123"), t)).toBe("bookingWidget.phoneErrors.countryCode");
    expect(phoneIssueMessage(phoneIssue("+351"), t)).toMatch(/^bookingWidget\.invalidPhone/);
    expect(phoneIssueMessage(null, t)).toBe("");
  });

  it("as frases existem nas 9 línguas, com os mesmos marcadores do inglês", () => {
    const en = locale("en").bookingWidget.phoneErrors as Record<string, string>;
    const placeholders = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
    expect(Object.keys(en).sort()).toEqual(["countryCode", "digits", "digitsRange", "leadingZero", "tooLong", "tooShort"]);
    for (const lang of LANGS) {
      const strings = locale(lang).bookingWidget.phoneErrors as Record<string, string>;
      for (const key of Object.keys(en)) {
        expect(strings?.[key], `${lang}.${key}`).toBeTruthy();
        expect(placeholders(strings[key]), `${lang}.${key}`).toEqual(placeholders(en[key]));
      }
    }
  });
});

describe("país por omissão: a região do browser, depois a língua do site; nunca +351 por o site estar em inglês", () => {
  const supported = (c: string) => c !== "xx";
  const pick = (languages: string[], siteLang: string) => defaultPhoneCountry({ languages, siteLang, supported });

  it("a região do browser manda", () => {
    expect(pick(["en-GB"], "en")).toBe("gb");
    expect(pick(["en-US", "en"], "en")).toBe("us");
    expect(pick(["en-IE"], "en")).toBe("ie");
    expect(pick(["pt-BR"], "pt")).toBe("br");
    expect(pick(["de-AT", "de"], "de")).toBe("at");
    expect(pick(["fr-CA"], "fr")).toBe("ca");
    expect(pick(["zh-Hans-CN"], "en")).toBe("cn");
    expect(pick(["en-GB"], "pt")).toBe("gb");
    expect(pick(["pt-PT"], "en")).toBe("pt"); // um português no site em inglês
  });

  it("sem região na primeira língua, a mesma língua com região mais abaixo", () => {
    expect(pick(["en", "en-GB"], "en")).toBe("gb");
    expect(pick(["fr", "en-US"], "fr")).toBe("fr"); // a região de outra língua não conta
  });

  it("sem região: a língua do site para as línguas que não o inglês", () => {
    expect(pick([], "pt")).toBe("pt");
    expect(pick(["es-419"], "es")).toBe("es"); // 419 não é um país
    expect(pick([], "sv")).toBe("se");
    expect(pick(["de"], "fi")).toBe("fi");
  });

  it("em inglês sem região: a língua do browser, senão gb, nunca pt", () => {
    expect(pick([], "en")).toBe("gb");
    expect(pick(["en"], "en")).toBe("gb");
    expect(pick(["nl"], "en")).toBe("nl");
    expect(pick(["en-XX"], "en")).toBe("gb"); // região que o campo não conhece
    for (const languages of [[], ["en"], ["en-150"], ["en-xx"]]) expect(pick(languages, "en")).not.toBe("pt");
  });

  it("lê a região de qualquer etiqueta", () => {
    expect(regionOf("en-GB")).toBe("gb");
    expect(regionOf("en_US")).toBe("us");
    expect(regionOf("es-419")).toBeNull();
    expect(regionOf("en")).toBeNull();
    expect(regionOf("")).toBeNull();
  });
});

/**
 * Revisão do PR #176: sem o forceDialCode, a biblioteca lia QUALQUER algarismo
 * como número internacional, por isso "927161771" escrito num campo apagado
 * (ou colado, ou preenchido pelo browser) virava +92 716-1771, Paquistão, e
 * passava a validação. O que entra no campo passa primeiro por phoneEntry.
 */
describe("o que entra no campo: algarismos sem '+' são um número nacional do país escolhido", () => {
  const typed = (raw: string, dialCode = "351", data = raw.slice(-1)) => phoneEntry({ raw, dialCode, inputType: "insertText", data });
  const pasted = (raw: string, dialCode = "351") => phoneEntry({ raw, dialCode, inputType: "insertFromPaste" });
  const autofilled = (raw: string, dialCode = "351") => phoneEntry({ raw, dialCode, inputType: undefined });

  it("depois do +351 pré-preenchido, apagar e escrever, colar ou o browser preencher 927161771 ou 213456789 dá +351", () => {
    expect(typed("9").value).toBe("+351 9");
    expect(pasted("927161771").value).toBe("+351 927161771");
    expect(autofilled("927161771").value).toBe("+351 927161771");
    expect(pasted("213456789").value).toBe("+351 213456789");
    expect(autofilled("213456789").value).toBe("+351 213456789");
    expect(autofilled("962 345 678").value).toBe("+351 962 345 678");
    expect(pasted(" 912 345 678 ").value).toBe("+351 912 345 678");
    for (const n of ["927161771", "213456789", "962345678", "912345678"]) {
      expect(phoneIssue(pasted(n).value), n).toBeNull();
    }
  });

  it("noutro país escolhido, o número nacional fica nesse país (e o 0 do prefixo nacional explica-se)", () => {
    expect(pasted("7700 900123", "44").value).toBe("+44 7700 900123");
    expect(phoneIssue(pasted("07700 900123", "44").value)).toEqual({ kind: "leading_zero", dialCode: "+44" });
    expect(pasted("(415) 555-0123", "1").value).toBe("+1 (415) 555-0123");
    expect(phoneIssue(pasted("(415) 555-0123", "1").value)).toBeNull();
  });

  it("'+…' escrito, colado ou preenchido segue o indicativo (a biblioteca muda a bandeira)", () => {
    expect(pasted("+44 7700 900123").value).toBe("+44 7700 900123");
    expect(autofilled("+447700900123").value).toBe("+447700900123");
    expect(typed("+").value).toBe("+");
    expect(typed("+4").value).toBe("+4");
  });

  it("'+' por cima do indicativo pré-preenchido recomeça o número", () => {
    // cursor no fim de "+351 ": escrever "+" ou colar "+44…"
    expect(typed("+351 +").value).toBe("+");
    expect(pasted("+351 +44 7700 900123").value).toBe("+44 7700 900123");
    expect(pasted("+1 +351 912 345 678", "1").value).toBe("+351 912 345 678");
    // com algarismos do número já escritos, o "+" fica com a biblioteca (que o recusa)
    expect(typed("+351 912+").value).toBe("+351 912+");
  });

  it("'00' é o prefixo internacional, escrito num campo vazio ou logo a seguir ao indicativo", () => {
    expect(pasted("0044 7700 900123").value).toBe("+44 7700 900123");
    expect(typed("00").value).toBe("+");
    expect(typed("+351 00", "351", "0").value).toBe("+");
    expect(pasted("+351 0044 7700 900123").value).toBe("+447700900123");
    expect(pasted("+0044 7700 900123").value).toBe("+447700900123");
    // um só 0 não é prefixo nenhum: fica, e a validação explica-o
    expect(typed("0").value).toBe("+351 0");
  });

  it("os algarismos com o indicativo à frente, sem o '+', num país com regra fixa", () => {
    expect(pasted("351912345678").value).toBe("+351912345678");
    expect(phoneIssue(pasted("351912345678").value)).toBeNull();
    expect(pasted("447700900123", "44").value).toBe("+447700900123");
    expect(pasted("14155550123", "1").value).toBe("+14155550123");
    // ambíguo ou errado: fica nacional e a validação explica
    expect(pasted("35191234567").value).toBe("+351 35191234567");
    expect(phoneIssue(pasted("35191234567").value)).toEqual({ kind: "length", dialCode: "+351", min: 9, max: 9 });
  });

  it("apagar, desfazer e refazer passam como estão", () => {
    for (const inputType of ["deleteContentBackward", "deleteContentForward", "deleteByCut", "historyUndo", "historyRedo"]) {
      expect(phoneEntry({ raw: "351 912", dialCode: "351", inputType })).toEqual({ value: "351 912", inputType });
    }
  });

  it("um texto inteiro inserido de uma vez como 'insertText' passa como colagem (a biblioteca recusava-o)", () => {
    expect(phoneEntry({ raw: "+44 7700 900123", dialCode: "351", inputType: "insertText", data: "+44 7700 900123" })).toEqual({
      value: "+44 7700 900123", inputType: "insertFromPaste",
    });
    expect(phoneEntry({ raw: "+351 9", dialCode: "351", inputType: "insertText", data: "9" })).toEqual({ value: "+351 9", inputType: "insertText" });
  });

  it("o resto fica como a biblioteca o faria", () => {
    expect(typed("+351 912").value).toBe("+351 912");
    expect(phoneEntry({ raw: "", dialCode: "351", inputType: "insertText", data: "" }).value).toBe("");
  });
});

describe("o campo partilhado (widget da casa, parceiros, contacto, checkout)", () => {
  const input = read("client/src/components/booking/PhoneInput.tsx");
  const lib = read("client/src/lib/phone.ts");

  it("o país segue o número internacional; os algarismos passam primeiro por phoneEntry", () => {
    // sem forceDialCode (recusava "+44…" escrito por cima de "+351 ") nem
    // disableCountryGuess (a bandeira não seguia o número)
    expect(input).not.toMatch(/forceDialCode:|disableCountryGuess:|^\s*forceDialCode\b|^\s*disableCountryGuess\b/m);
    expect(input).toMatch(/allowMaskOverflow: true,/);
    // o <input> é nosso: phoneEntry antes do handlePhoneValueChange da biblioteca
    expect(input).toMatch(/const entry = phoneEntry\(\{ raw: e\.target\.value, dialCode: country\.dialCode/);
    expect(input).toMatch(/onChange=\{handleChange\}/);
    expect(input).not.toMatch(/<RIPPhoneInput/);
  });

  it("sem biblioteca de telefones pesada (a página da casa já é lenta no telemóvel)", () => {
    for (const src of [input, lib, read("client/src/lib/validation.ts")]) {
      expect(src).not.toMatch(/libphonenumber|google-libphonenumber|awesome-phonenumber/);
    }
    const pkg = JSON.parse(read("package.json"));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain("libphonenumber-js");
  });

  it("a primeira pintura não depende do browser (o contacto é renderizado no servidor)", () => {
    expect(input).toMatch(/useSyncExternalStore\(subscribeLanguages, browserLanguages, \(\) => ""\)/);
  });
});
