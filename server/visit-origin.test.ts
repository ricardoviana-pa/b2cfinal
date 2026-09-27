/**
 * Origem da visita: captura, limpeza e linha "Origem:" da nota da reserva.
 *
 * O marketing (pa-marketing, b-crm/jobs/campaign_bookings.py) lê a linha da
 * nota para atribuir a reserva à campanha; o formato é estável e estes testes
 * fixam-no. A limpeza é a mesma no navegador e no servidor.
 */
import { describe, expect, it } from "vitest";
import {
  REMOVED,
  VISIT_ORIGIN_TTL_MS,
  applyLanding,
  cleanLandingPath,
  cleanReferrerHost,
  cleanValue,
  looksPersonal,
  parseStoredState,
  pruneExpired,
  readLanding,
  toPayload,
  type LandingInput,
} from "@shared/visit-origin";
import {
  ORIGIN_NO_CONSENT_LINE,
  mergeVisitOrigins,
  originEmailSummary,
  originNoteEnabled,
  originNoteLine,
  parseStoredVisitOrigin,
  parseVisitOriginPayload,
  type ServerVisitOrigin,
} from "./services/visit-origin";

const NOW = Date.UTC(2026, 8, 27, 16, 42, 10);
const DAY = 86_400_000;

function landing(overrides: Partial<LandingInput> = {}): LandingInput {
  return {
    search: "",
    pathname: "/pt/homes/nature-hill-duo",
    referrer: "",
    currentHost: "www.portugalactive.com",
    navigationType: "navigate",
    at: NOW,
    ...overrides,
  };
}

describe("limpeza dos parâmetros", () => {
  it("fica só com caracteres seguros e corta a 100", () => {
    expect(cleanValue("2026-09_o1_base_prevenda2027")).toBe("2026-09_o1_base_prevenda2027");
    expect(cleanValue("Black Friday; DROP TABLE")).toBe("Black_Friday__DROP_TABLE");
    expect(cleanValue("a\nb=c")).toBe("a_b_c");
    expect(cleanValue("x".repeat(300))).toHaveLength(100);
    expect(cleanValue("Email", { lower: true })).toBe("email");
    expect(cleanValue("   ")).toBeUndefined();
    expect(cleanValue("-")).toBeUndefined();
    expect(cleanValue(42)).toBeUndefined();
  });

  it("recusa emails e telefones", () => {
    for (const raw of ["ana@example.com", "ana%40example.com", "912345678", "+351 912 345 678", "(351)912-345678", "tel912345678"]) {
      expect(looksPersonal(raw)).toBe(true);
      expect(cleanValue(raw)).toBe(REMOVED);
    }
    expect(looksPersonal("912-345-678")).toBe(true);
    expect(looksPersonal("2026-09_o1_agosto_preferencia")).toBe(false);
    expect(looksPersonal("natal_2026-12-24")).toBe(false);
    expect(looksPersonal("123456")).toBe(false);
  });

  it("domínio de origem sem www, só letras, algarismos, pontos e hífenes", () => {
    expect(cleanReferrerHost("WWW.Google.PT")).toBe("google.pt");
    expect(cleanReferrerHost("com.google.android.gm")).toBe("com.google.android.gm");
    expect(cleanReferrerHost("localhost")).toBeUndefined();
    expect(cleanReferrerHost("evil.com/path?x=1")).toBeUndefined();
  });

  it("página de entrada sem query e sem ids", () => {
    expect(cleanLandingPath("/pt/checkout/3f1c2a9e-8b7d-4c6e-9f00-1234567890ab?utm_source=email")).toBe("/pt/checkout/:id");
    expect(cleanLandingPath("/en/reservations/0123456789abcdef01234567/x")).toBe("/en/reservations/:id/x");
    expect(cleanLandingPath("/pt/homes/casa#fotos")).toBe("/pt/homes/casa");
    expect(cleanLandingPath("/pt/unsubscribe/ana@example.com")).toBe(REMOVED);
    expect(cleanLandingPath("/pt/casa%C3%A7")).toBe("/pt/casa_C3_A7");
    expect(cleanLandingPath("relative")).toBeUndefined();
  });

  it("a limpeza é idempotente (o servidor volta a limpar o que o navegador limpou)", () => {
    for (const raw of ["Black Friday", "ana@example.com", "2026-09_o1_base_natal"]) {
      const once = cleanValue(raw)!;
      expect(cleanValue(once)).toBe(once);
    }
    const path = cleanLandingPath("/pt/checkout/3f1c2a9e-8b7d-4c6e-9f00-1234567890ab")!;
    expect(cleanLandingPath(path)).toBe(path);
  });
});

describe("captura na página de entrada", () => {
  it("lê os UTM e só o TIPO de identificador de clique, nunca o valor", () => {
    const result = readLanding(landing({
      search: "?utm_source=Google&utm_medium=CPC&utm_campaign=2026-10_o1_es_puentes&gclid=Cj0KCQjwSECRET&fbclid=IwAR0SECRET&checkin=2026-12-23",
    }));
    expect(result.kind).toBe("campaign");
    expect(result.touch).toEqual({
      utm_source: "google", utm_medium: "cpc", utm_campaign: "2026-10_o1_es_puentes",
      clickId: "gclid", landing: "/pt/homes/nature-hill-duo",
    });
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(JSON.stringify(result)).not.toContain("checkin");
  });

  it("guarda só o domínio de um site externo e ignora a própria PA", () => {
    expect(readLanding(landing({ referrer: "https://www.google.com/search?q=casa" })).touch.referrer).toBe("google.com");
    const internal = readLanding(landing({ referrer: "https://www.portugalactive.com/pt/homes" }));
    expect(internal.kind).toBe("direct");
    expect(internal.touch.referrer).toBeUndefined();
    expect(readLanding(landing({ referrer: "http://localhost:3000/", currentHost: "localhost" })).kind).toBe("direct");
  });

  it("regressos de pagamento, recarregamentos e páginas de reserva não contam", () => {
    expect(readLanding(landing({ referrer: "https://checkout.stripe.com/" })).kind).toBe("skip");
    expect(readLanding(landing({ referrer: "https://www.paypal.com/checkoutnow" })).kind).toBe("skip");
    expect(readLanding(landing({ pathname: "/booking/klarna-return", search: "?utm_source=x" })).kind).toBe("skip");
    expect(readLanding(landing({ pathname: "/pt/booking/thank-you/abc" })).kind).toBe("skip");
    expect(readLanding(landing({ search: "?utm_source=email", navigationType: "reload" })).kind).toBe("skip");
    expect(readLanding(landing({ search: "?utm_source=email", navigationType: "back_forward" })).kind).toBe("skip");
    expect(readLanding(landing({ pathname: "/pt/booking-conditions" })).kind).toBe("direct");
  });

  it("entrada direta sem nada guardado passa a primeira e última visita", () => {
    const state = applyLanding(null, readLanding(landing()), NOW);
    expect(state).toEqual({ v: 1, first: { landing: "/pt/homes/nature-hill-duo", at: NOW }, last: { landing: "/pt/homes/nature-hill-duo", at: NOW } });
  });

  it("campanha passa a última visita; a primeira fica; direta não apaga a campanha", () => {
    const first = applyLanding(null, readLanding(landing({ search: "?utm_source=google&utm_medium=cpc", at: NOW - 5 * DAY })), NOW - 5 * DAY);
    const second = applyLanding(first, readLanding(landing({ search: "?utm_source=email&utm_medium=email", at: NOW - DAY })), NOW - DAY);
    expect(second?.first).toMatchObject({ utm_source: "google", at: NOW - 5 * DAY });
    expect(second?.last).toMatchObject({ utm_source: "email", at: NOW - DAY });
    const direct = applyLanding(second, readLanding(landing({ pathname: "/pt/" })), NOW);
    expect(direct).toEqual(second);
  });

  it("cada toque expira 30 dias depois da sua hora", () => {
    const state = {
      v: 1 as const,
      first: { utm_source: "google", at: NOW - VISIT_ORIGIN_TTL_MS - 1 },
      last: { utm_source: "email", at: NOW - 2 * DAY },
    };
    expect(pruneExpired(state, NOW)).toEqual({ v: 1, first: state.last, last: state.last });
    expect(pruneExpired({ ...state, last: { ...state.last, at: NOW - VISIT_ORIGIN_TTL_MS } }, NOW)).toBeNull();
  });

  it("o estado guardado é relido com desconfiança", () => {
    expect(parseStoredState("{not json")).toBeNull();
    expect(parseStoredState(JSON.stringify({ v: 2, first: null, last: null }))).toBeNull();
    const tampered = JSON.stringify({ v: 1, last: { at: NOW, utm_source: "ana@example.com", extra: "x", clickId: "evil" } });
    expect(parseStoredState(tampered)).toEqual({ v: 1, first: { at: NOW, utm_source: REMOVED }, last: { at: NOW, utm_source: REMOVED } });
  });

  it("o pedido leva idades, não horas do relógio do navegador", () => {
    const payload = toPayload({ v: 1, first: { utm_source: "google", at: NOW - DAY }, last: { utm_source: "email", at: NOW - 60_000 } }, true, NOW);
    expect(payload).toEqual({ v: 1, consent: true, stored: true, first: { utm_source: "google", ageSec: 86400 }, last: { utm_source: "email", ageSec: 60 } });
  });
});

describe("validação no servidor", () => {
  const now = new Date(NOW);

  it("converte idades em horas do servidor e limpa outra vez", () => {
    const origin = parseVisitOriginPayload({
      v: 1, consent: true, stored: true,
      first: { ageSec: 7 * 86400, utm_source: "Google", utm_medium: "cpc", utm_campaign: "Natal 2026" },
      last: { ageSec: 3600, utm_source: "email", utm_content: "ana@example.com", clickId: "fbclid", referrer: "WWW.Facebook.com", landing: "/pt/checkout/3f1c2a9e-8b7d-4c6e-9f00-1234567890ab" },
    }, now);
    expect(origin).toEqual({
      v: 1, consent: true, stored: true,
      first: { utm_source: "google", utm_medium: "cpc", utm_campaign: "Natal_2026", at: "2026-09-20T16:42:10Z" },
      last: { utm_source: "email", utm_content: REMOVED, clickId: "fbclid", referrer: "facebook.com", landing: "/pt/checkout/:id", at: "2026-09-27T15:42:10Z" },
    });
  });

  it("lista fechada de chaves: uma chave a mais invalida o toque ou o pedido", () => {
    expect(parseVisitOriginPayload({ v: 1, consent: true, stored: true, first: null, last: null, email: "x" }, now)).toBeNull();
    expect(parseVisitOriginPayload({ v: 2, consent: false }, now)).toBeNull();
    expect(parseVisitOriginPayload({ v: 1, consent: false, utm_source: "x" }, now)).toBeNull();
    expect(parseVisitOriginPayload("Origem: forjada", now)).toBeNull();
    const oneBad = parseVisitOriginPayload({
      v: 1, consent: true, stored: false,
      first: { ageSec: 10, utm_source: "google", gclid_value: "abc" },
      last: { ageSec: 5, utm_source: "email" },
    }, now);
    expect(oneBad).toMatchObject({ first: { utm_source: "email" }, last: { utm_source: "email" } });
  });

  it("recusa toques fora da janela e valores enormes", () => {
    const base = { v: 1, consent: true, stored: true, first: null };
    expect(parseVisitOriginPayload({ ...base, last: { ageSec: 32 * 86400, utm_source: "x" } }, now)).toMatchObject({ last: null });
    expect(parseVisitOriginPayload({ ...base, last: { ageSec: -3600, utm_source: "x" } }, now)).toMatchObject({ last: null });
    expect(parseVisitOriginPayload({ ...base, last: { ageSec: 10, utm_source: "x".repeat(600) } }, now)).toMatchObject({ last: null });
    expect(parseVisitOriginPayload({ ...base, last: { ageSec: 10, clickId: "yclid" } }, now)).toMatchObject({ last: null });
  });

  it("sem consentimento não fica nada além disso", () => {
    expect(parseVisitOriginPayload({ v: 1, consent: false }, now)).toEqual({ v: 1, consent: false });
  });

  it("relê da base só o formato certo", () => {
    const origin: ServerVisitOrigin = { v: 1, consent: true, stored: true, first: null, last: { utm_source: "email", at: "2026-09-27T15:42:10Z" } };
    expect(parseStoredVisitOrigin(JSON.stringify(origin))).toEqual({ ...origin, first: origin.last });
    expect(parseStoredVisitOrigin({ v: 1, consent: true, stored: true, last: { at: "ontem" } })).toEqual({ v: 1, consent: true, stored: true, first: null, last: null });
    expect(parseStoredVisitOrigin(null)).toBeNull();
  });

  it("junta atualizações: primeira mais antiga, última de campanha mais recente, retirar consentimento apaga", () => {
    const created: ServerVisitOrigin = {
      v: 1, consent: true, stored: true,
      first: { utm_source: "google", at: "2026-09-20T10:00:00Z" },
      last: { utm_source: "google", at: "2026-09-20T10:00:00Z" },
    };
    const recovery: ServerVisitOrigin = {
      v: 1, consent: true, stored: true,
      first: { utm_source: "email", utm_medium: "recovery", at: "2026-09-27T09:00:00Z" },
      last: { utm_source: "email", utm_medium: "recovery", at: "2026-09-27T09:00:00Z" },
    };
    expect(mergeVisitOrigins(created, recovery)).toMatchObject({ first: { utm_source: "google" }, last: { utm_medium: "recovery" } });
    const directLater: ServerVisitOrigin = { v: 1, consent: true, stored: false, first: { landing: "/pt/", at: "2026-09-27T12:00:00Z" }, last: { landing: "/pt/", at: "2026-09-27T12:00:00Z" } };
    expect(mergeVisitOrigins(created, directLater)).toMatchObject({ last: { utm_source: "google" } });
    expect(mergeVisitOrigins(created, { v: 1, consent: false })).toEqual({ v: 1, consent: false });
    expect(mergeVisitOrigins({ v: 1, consent: false }, recovery)).toEqual(recovery);
    expect(mergeVisitOrigins(null, recovery)).toEqual(recovery);
  });
});

describe("linha da nota da reserva", () => {
  it("formato estável, legível por máquina", () => {
    const line = originNoteLine({
      v: 1, consent: true, stored: true,
      first: { utm_source: "email", utm_medium: "email", utm_campaign: "2026-09_o1_base_prevenda2027", at: "2026-09-20T10:03:55Z" },
      last: { utm_source: "email", utm_medium: "email", utm_campaign: "2026-09_o1_base_prevenda2027", utm_content: "botao_casa", landing: "/pt/homes/nature-hill-duo", at: "2026-09-27T16:42:10Z" },
    });
    expect(line).toBe(
      "Origem: utm_source=email; utm_medium=email; utm_campaign=2026-09_o1_base_prevenda2027; utm_content=botao_casa; utm_term=-; clid=-; ref=-; entrada=/pt/homes/nature-hill-duo; toque=2026-09-27T16:42:10Z; primeiro=2026-09-20T10:03:55Z,email,email,2026-09_o1_base_prevenda2027; guardado=sim (origem da visita no site, v1)",
    );
    const match = line.match(/^Origem: (.+) \(origem da visita no site, v1\)$/);
    expect(match).not.toBeNull();
    const pairs = Object.fromEntries(match![1].split("; ").map((pair) => pair.split("=") as [string, string]));
    expect(Object.keys(pairs)).toEqual(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "clid", "ref", "entrada", "toque", "primeiro", "guardado"]);
    expect(Object.values(pairs).every((value) => value && !/[\s;=]/.test(value))).toBe(true);
  });

  it("entrada direta: utm, clid e ref vazios", () => {
    const line = originNoteLine({ v: 1, consent: true, stored: false, first: { landing: "/pt/", at: "2026-09-27T16:00:00Z" }, last: { landing: "/pt/", at: "2026-09-27T16:00:00Z" } });
    expect(line).toBe("Origem: utm_source=-; utm_medium=-; utm_campaign=-; utm_content=-; utm_term=-; clid=-; ref=-; entrada=/pt/; toque=2026-09-27T16:00:00Z; primeiro=2026-09-27T16:00:00Z,-,-,-; guardado=nao (origem da visita no site, v1)");
  });

  it("clique de anúncio e site de origem", () => {
    const line = originNoteLine({ v: 1, consent: true, stored: true, first: null, last: { clickId: "gclid", referrer: "google.com", at: "2026-09-27T16:00:00Z" } });
    expect(line).toContain("clid=gclid; ref=google.com; entrada=-;");
    expect(line).toContain("primeiro=-;");
  });

  it("sem consentimento: só isso", () => {
    expect(originNoteLine({ v: 1, consent: false })).toBe("Origem: sem consentimento");
    expect(ORIGIN_NO_CONSENT_LINE).toBe("Origem: sem consentimento");
  });

  it("sem registo não escreve nada", () => {
    expect(originNoteLine(null)).toBe("");
  });

  it("valores adulterados nunca partem a gramática", () => {
    const line = originNoteLine({ v: 1, consent: true, stored: true, first: null, last: { utm_source: "a; b=c\nd", at: "2026-09-27T16:00:00Z" } as any });
    expect(line.split("\n")).toHaveLength(1);
    expect(line).toContain("utm_source=a__b_c_d;");
  });

  it("só vai para a nota com VISIT_ORIGIN_NOTE=1 ou true; desligada por defeito", () => {
    expect(originNoteEnabled({})).toBe(false);
    for (const value of ["", "0", "false", "no", "yes", "on"]) expect(originNoteEnabled({ VISIT_ORIGIN_NOTE: value })).toBe(false);
    for (const value of ["1", "true", "TRUE", " 1 "]) expect(originNoteEnabled({ VISIT_ORIGIN_NOTE: value })).toBe(true);
  });
});

describe("resumo do email [Venda direta]", () => {
  it("diz de onde veio a venda em linguagem simples", () => {
    const text = originEmailSummary({
      v: 1, consent: true, stored: true,
      first: { referrer: "google.com", at: "2026-09-20T10:03:55Z" },
      last: { utm_source: "email", utm_medium: "email", utm_campaign: "2026-09_o1_base_prevenda2027", utm_content: "botao_casa", landing: "/pt/homes/nature-hill-duo", at: "2026-09-27T16:42:10Z" },
    });
    expect(text).toContain("fonte email, meio email, campanha 2026-09_o1_base_prevenda2027, conteudo botao_casa");
    expect(text).toContain("clique 27/09");
    expect(text).toContain("17:42 (Lisboa)");
    expect(text).toContain("entrada /pt/homes/nature-hill-duo");
    expect(text).toContain("primeira visita 20/09");
    expect(text).toContain("site de origem google.com");
  });

  it("direta, sem consentimento e sem registo", () => {
    expect(originEmailSummary({ v: 1, consent: true, stored: false, first: { at: "2026-09-27T16:00:00Z" }, last: { at: "2026-09-27T16:00:00Z" } }))
      .toContain("direta (sem campanha nem site de origem)");
    expect(originEmailSummary({ v: 1, consent: false })).toBe("sem consentimento de cookies de analise (nada guardado)");
    expect(originEmailSummary(null)).toBe("sem registo no site");
  });
});
