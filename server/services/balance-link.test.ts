/**
 * Link sem login da página da 2.ª parte: o token tem de expirar sozinho, não
 * pode servir para outro intent nem deixar esticar o prazo, e sem segredo
 * configurado não há link (nunca um segredo fixo de fallback).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { balanceLinkToken, balanceLinkUrl, verifyBalanceLinkToken } from "./balance-link";

const INTENT = "3f1c2a9e-8b7d-4c6e-9f00-1234567890ab";
const OTHER = "9a8b7c6d-0000-4c6e-9f00-ba0987654321";
const NOW = new Date("2099-07-01T10:00:00Z");
const EXP = new Date("2099-07-08T11:00:00Z");

beforeEach(() => {
  vi.stubEnv("BALANCE_LINK_SECRET", "synthetic-balance-link-secret-0123456789");
  vi.stubEnv("JWT_SECRET", "synthetic-jwt-secret-should-not-be-used");
});
afterEach(() => vi.unstubAllEnvs());

describe("balanceLinkToken / verifyBalanceLinkToken", () => {
  it("formato `${exp}.${hmac32}` e verificação dentro do prazo", () => {
    const t = balanceLinkToken(INTENT, EXP);
    expect(t).toMatch(/^\d+\.[0-9a-f]{32}$/);
    expect(t.split(".")[0]).toBe(String(Math.floor(EXP.getTime() / 1000)));
    expect(verifyBalanceLinkToken(INTENT, t, NOW)).toBe(true);
  });

  it("é determinístico (o mesmo link em reenvios) e muda com o prazo", () => {
    expect(balanceLinkToken(INTENT, EXP)).toBe(balanceLinkToken(INTENT, new Date(EXP)));
    expect(balanceLinkToken(INTENT, EXP)).not.toBe(balanceLinkToken(INTENT, new Date(EXP.getTime() + 1000)));
  });

  it("expira: no instante do prazo e depois dele é false", () => {
    const t = balanceLinkToken(INTENT, EXP);
    expect(verifyBalanceLinkToken(INTENT, t, new Date(EXP.getTime() - 1000))).toBe(true);
    expect(verifyBalanceLinkToken(INTENT, t, EXP)).toBe(false);
    expect(verifyBalanceLinkToken(INTENT, t, new Date(EXP.getTime() + 1))).toBe(false);
  });

  it("um prazo no passado gera um token que já nasce expirado", () => {
    const t = balanceLinkToken(INTENT, new Date(NOW.getTime() - 60_000));
    expect(verifyBalanceLinkToken(INTENT, t, NOW)).toBe(false);
  });

  it("não serve para outro intent", () => {
    expect(verifyBalanceLinkToken(OTHER, balanceLinkToken(INTENT, EXP), NOW)).toBe(false);
  });

  it("não deixa esticar o prazo mexendo no número", () => {
    const [exp, mac] = balanceLinkToken(INTENT, EXP).split(".");
    const later = String(Number(exp) + 86_400 * 30);
    expect(verifyBalanceLinkToken(INTENT, `${later}.${mac}`, NOW)).toBe(false);
  });

  it("um MAC adulterado falha", () => {
    const t = balanceLinkToken(INTENT, EXP);
    const last = t.slice(-1);
    const flipped = t.slice(0, -1) + (last === "0" ? "1" : "0");
    expect(verifyBalanceLinkToken(INTENT, flipped, NOW)).toBe(false);
  });

  it.each([
    "", "abc", "123", "123.", ".abc", "12x.0123456789abcdef0123456789abcdef",
    "123.0123456789abcdef0123456789abcde", "123.0123456789abcdef0123456789abcdef0",
    "123.0123456789abcdef0123456789abcdeg",
  ])("formato inesperado (%j) é false, nunca lança", (tok) => {
    expect(verifyBalanceLinkToken(INTENT, tok, NOW)).toBe(false);
  });

  it("aceita maiúsculas no MAC (clientes de email que alteram o link)", () => {
    const t = balanceLinkToken(INTENT, EXP);
    expect(verifyBalanceLinkToken(INTENT, t.toUpperCase(), NOW)).toBe(true);
  });

  it("intent vazio ou token não-string é false", () => {
    const t = balanceLinkToken(INTENT, EXP);
    expect(verifyBalanceLinkToken("", t, NOW)).toBe(false);
    expect(verifyBalanceLinkToken(INTENT, undefined as any, NOW)).toBe(false);
  });

  it("BALANCE_LINK_SECRET manda; sem ele usa JWT_SECRET; mudar o segredo invalida", () => {
    const withOwn = balanceLinkToken(INTENT, EXP);
    vi.stubEnv("BALANCE_LINK_SECRET", "");
    const withJwt = balanceLinkToken(INTENT, EXP);
    expect(withJwt).not.toBe(withOwn);
    expect(verifyBalanceLinkToken(INTENT, withJwt, NOW)).toBe(true);
    expect(verifyBalanceLinkToken(INTENT, withOwn, NOW)).toBe(false);
  });

  it("sem segredo: gerar lança e verificar dá false (sem fallback fixo)", () => {
    const t = balanceLinkToken(INTENT, EXP);
    vi.stubEnv("BALANCE_LINK_SECRET", "");
    vi.stubEnv("JWT_SECRET", "");
    expect(() => balanceLinkToken(INTENT, EXP)).toThrow(/BALANCE_LINK_SECRET/);
    expect(verifyBalanceLinkToken(INTENT, t, NOW)).toBe(false);
  });

  it("prazo inválido ou intent vazio: gerar lança", () => {
    expect(() => balanceLinkToken(INTENT, new Date("nope"))).toThrow();
    expect(() => balanceLinkToken("", EXP)).toThrow();
  });
});

describe("balanceLinkUrl", () => {
  it("origem de produção, língua do hóspede e o token", () => {
    const url = balanceLinkUrl(INTENT, "de-DE", EXP);
    // No fragmento: nunca chega ao servidor nem à analítica.
    expect(url).toBe(`https://www.portugalactive.com/de/booking/balance/${INTENT}#t=${balanceLinkToken(INTENT, EXP)}`);
  });

  it("língua fora das 9 cai em EN, como o site", () => {
    expect(balanceLinkUrl(INTENT, "ja", EXP)).toContain("/en/booking/balance/");
    expect(balanceLinkUrl(INTENT, null, EXP)).toContain("/en/booking/balance/");
  });

  it("o token do URL verifica", () => {
    const url = new URL(balanceLinkUrl(INTENT, "pt", EXP));
    expect(url.search).toBe("");
    expect(verifyBalanceLinkToken(INTENT, new URLSearchParams(url.hash.slice(1)).get("t")!, NOW)).toBe(true);
  });
});
