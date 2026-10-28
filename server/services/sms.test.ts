/**
 * SMS da 2.ª parte (S1/S2) pela Twilio. Nada sai para a rede: o fetch é
 * simulado. O que importa: true só com a mensagem aceite, nunca lança,
 * nunca envia sem configuração, num preview ou para um número ambíguo, e o
 * texto é o da spec 4.2 com o mesmo prazo H do email.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  balanceSmsText,
  normalizeSmsNumber,
  sendBalanceFailedSms,
  sendBalanceLastCallSms,
  sendSms,
  smsConfigured,
} from "./sms";
import { EMAIL_LANGS } from "./email-i18n";

const fetchMock = vi.fn();
const LINK = "https://www.portugalactive.com/pt/booking/balance/3f1c2a9e?t=4102444800.0123456789abcdef0123456789abcdef";
/** H = 5 de julho de 2099 às 12:00 de Lisboa (verão, UTC+1). */
const H = new Date("2099-07-05T11:00:00Z");

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ sid: "SMsynthetic", status: "queued" }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("CHECKOUT_SMS_PROVIDER", "twilio");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACsynthetic");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "synthetic-token");
  vi.stubEnv("TWILIO_FROM", "+351900000000");
  // Ambiente de produção para o guard de preview (nada sai: fetch simulado).
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SITE_URL", "https://www.portugalactive.com");
  vi.stubEnv("RENDER_SERVICE_ID", "");
  vi.stubEnv("RENDER_GIT_BRANCH", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("smsConfigured", () => {
  const full = { CHECKOUT_SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+351" };
  it("só com o fornecedor twilio e as três variáveis", () => {
    expect(smsConfigured(full as any)).toBe(true);
    expect(smsConfigured({ ...full, CHECKOUT_SMS_PROVIDER: "" } as any)).toBe(false);
    expect(smsConfigured({ ...full, CHECKOUT_SMS_PROVIDER: "vonage" } as any)).toBe(false);
    for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]) {
      expect(smsConfigured({ ...full, [k]: "" } as any)).toBe(false);
    }
  });
});

describe("normalizeSmsNumber", () => {
  it.each([
    ["+351 912 345 678", "+351912345678"],
    ["00351912345678", "+351912345678"],
    ["+44 (0)20-7946.0958".replace("(0)", ""), "+442079460958"],
    ["+49 151 2345 6789", "+4915123456789"],
  ])("%s → %s", (raw, e164) => expect(normalizeSmsNumber(raw)).toBe(e164));

  it.each(["912345678", "+0123456789", "+12", "abc", "", null, undefined])("ambíguo ou inválido (%s) → null", (raw) => {
    expect(normalizeSmsNumber(raw as any)).toBeNull();
  });
});

describe("sendSms", () => {
  it("POST à Twilio com Basic auth e form-encoded; true com sid", async () => {
    expect(await sendSms("+351 912 345 678", "Olá")).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACsynthetic/Messages.json");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("ACsynthetic:synthetic-token").toString("base64")}`);
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(init.body);
    expect(body.get("To")).toBe("+351912345678");
    expect(body.get("From")).toBe("+351900000000");
    expect(body.get("Body")).toBe("Olá");
    expect(body.get("MessagingServiceSid")).toBeNull();
  });

  it("TWILIO_FROM com um Messaging Service (MG…) usa MessagingServiceSid", async () => {
    vi.stubEnv("TWILIO_FROM", "MG0123456789abcdef0123456789abcdef");
    expect(await sendSms("+351912345678", "x")).toBe(true);
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get("MessagingServiceSid")).toBe("MG0123456789abcdef0123456789abcdef");
    expect(body.get("From")).toBeNull();
  });

  it("recusa da Twilio (4xx) → false", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 21211, message: "invalid" }), { status: 400 }));
    expect(await sendSms("+351912345678", "x")).toBe(false);
  });

  it("2xx sem sid → false", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 201 }));
    expect(await sendSms("+351912345678", "x")).toBe(false);
  });

  it("rede ou timeout → false, nunca lança", async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
    await expect(sendSms("+351912345678", "x")).resolves.toBe(false);
  });

  it("sem configuração → false sem chamar a rede", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    expect(await sendSms("+351912345678", "x")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preview/DEV → false sem chamar a rede", async () => {
    vi.stubEnv("APP_ENV", "preview");
    expect(await sendSms("+351912345678", "x")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("número sem indicativo → false sem chamar a rede (não se adivinha o país)", async () => {
    expect(await sendSms("912345678", "x")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("texto vazio ou acima de 1600 caracteres → false (um link cortado não abre)", async () => {
    expect(await sendSms("+351912345678", "  ")).toBe(false);
    expect(await sendSms("+351912345678", "x".repeat(1601))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("balanceSmsText (S1 e S2, spec 4.2)", () => {
  const now = new Date("2099-07-04T09:00:00Z"); // véspera de H, 10:00 de Lisboa

  it("S1 pt, palavra por palavra", () => {
    expect(balanceSmsText("failed", { locale: "pt", propertyName: "Casa Sintética", hardStopAt: H, link: LINK, now })).toBe(
      `Portugal Active: não conseguimos cobrar a 2.ª parte da sua estadia em Casa Sintética. Pague ou mude de cartão até 5 de julho às 12:00 (Lisboa): ${LINK}`,
    );
  });

  it("S2 en, palavra por palavra", () => {
    expect(balanceSmsText("lastCall", { locale: "en", propertyName: "Casa Sintética", hardStopAt: H, link: LINK, now })).toBe(
      `Portugal Active: tomorrow at 12:00 (Lisbon) the deadline for the 2nd part of your stay at Casa Sintética ends. Paying takes 2 minutes: ${LINK}`,
    );
  });

  it("sem casa: 'da sua estadia', nunca 'em a sua casa'", () => {
    const t = balanceSmsText("failed", { locale: "pt", hardStopAt: H, link: LINK, now })!;
    expect(t).toContain("a 2.ª parte da sua estadia. Pague");
    expect(t).not.toMatch(/ em \./);
  });

  it("a hora vem do instante H (nunca escrita à mão)", () => {
    const odd = new Date("2099-07-05T00:30:00Z"); // 01:30 de Lisboa
    expect(balanceSmsText("failed", { locale: "pt", hardStopAt: odd, link: LINK, now })).toContain("até 5 de julho à 01:30 (Lisboa)");
  });

  it("S2 só na véspera de H (Lisboa); fora disso, null", () => {
    expect(balanceSmsText("lastCall", { locale: "pt", hardStopAt: H, link: LINK, now: new Date("2099-07-02T09:00:00Z") })).toBeNull();
    expect(balanceSmsText("lastCall", { locale: "pt", hardStopAt: H, link: LINK, now: new Date("2099-07-05T08:00:00Z") })).toBeNull();
  });

  it("H já passado, H inválido ou link fora de produção → null", () => {
    expect(balanceSmsText("failed", { locale: "pt", hardStopAt: H, link: LINK, now: new Date("2099-07-06T00:00:00Z") })).toBeNull();
    expect(balanceSmsText("failed", { locale: "pt", hardStopAt: new Date("x"), link: LINK, now })).toBeNull();
    expect(balanceSmsText("failed", { locale: "pt", hardStopAt: H, link: "https://dev.portugalactive.com/pt/booking/balance/x?t=1", now })).toBeNull();
  });

  it.each(EMAIL_LANGS)("%s: S1 e S2 com casa, prazo e link, sem vocabulário proibido", (lang) => {
    for (const kind of ["failed", "lastCall"] as const) {
      const t = balanceSmsText(kind, { locale: lang, propertyName: "Casa Sintética", hardStopAt: H, link: LINK, now })!;
      expect(t.startsWith("Portugal Active")).toBe(true);
      expect(t).toContain("Casa Sintética");
      expect(t.endsWith(LINK)).toBe(true);
      expect(t).toMatch(/12[:.]00/);
      expect(t).not.toMatch(/sinal|dep[oó]sito|prestaç|deposit|instal+ment|seguro|insurance|acompte|anzahlung|caparra|aanbetaling|handpenning|käsiraha/i);
      expect(t).not.toMatch(/undefined|null|NaN/);
    }
  });
});

describe("sendBalanceFailedSms / sendBalanceLastCallSms", () => {
  const now = new Date("2099-07-04T09:00:00Z");

  it("S1 envia o texto da língua do hóspede", async () => {
    expect(await sendBalanceFailedSms({ phone: "+351 912 345 678", locale: "pt", propertyName: "Casa", hardStopAt: H, link: LINK, now })).toBe(true);
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get("Body")).toContain("não conseguimos cobrar a 2.ª parte");
  });

  it("S2 fora da véspera não envia", async () => {
    expect(await sendBalanceLastCallSms({ phone: "+351912345678", locale: "pt", hardStopAt: H, link: LINK, now: new Date("2099-07-01T09:00:00Z") })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem telefone → false", async () => {
    expect(await sendBalanceFailedSms({ phone: null, locale: "pt", hardStopAt: H, link: LINK, now })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
