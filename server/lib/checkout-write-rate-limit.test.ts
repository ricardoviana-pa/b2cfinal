/* ==========================================================================
   Limites de pedidos em booking.* e checkout.* (auditoria de 14 nov 2026,
   segunda ronda técnica).

   Os app.use("/api/trpc/booking", apiLimiter) e "/checkout" nunca apanharam
   pedido nenhum. Estes testes garantem três coisas:
   1. só se limita o que grava, cobra ou envia, e toda a mutation de
      booking.* e checkout.* está classificada (uma nova parte este teste);
   2. as leituras de uma visita normal nunca contam, por muitas que sejam;
   3. um checkout normal, mesmo mexido, passa com folga, e uma inundação pára.
   ========================================================================== */
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import express from "express";
import rateLimit from "express-rate-limit";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHARGE_PROCEDURES,
  CHECKOUT_CHARGE_RATE_LIMIT_PER_MIN,
  CHECKOUT_SAVE_RATE_LIMIT_PER_MIN,
  SAVE_PROCEDURES,
  countProcedures,
  trpcProcedures,
  weightedTrpcLimiter,
} from "./checkout-write-rate-limit";
import { isPartnerPayTrpcPath } from "./partner-pay-rate-limit";
import { bookingRouter } from "../routers/booking";
import { checkoutRouter } from "../routers/checkout";

/** { "booking.getQuote": "query", "checkout.updateIntent": "mutation", … } */
function procedureTypes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ns, router] of [["booking", bookingRouter], ["checkout", checkoutRouter]] as const) {
    for (const [name, proc] of Object.entries((router as any)._def.procedures)) {
      out[`${ns}.${name}`] = (proc as any)._def.type;
    }
  }
  return out;
}

describe("o que se limita: só o que grava, cobra ou envia", () => {
  const types = procedureTypes();
  const all = Object.keys(types);
  const limited = new Set([...CHARGE_PROCEDURES, ...SAVE_PROCEDURES]);

  it("lê os dois routers", () => {
    expect(all.length).toBeGreaterThanOrEqual(30);
    expect(types["booking.getQuote"]).toBe("query");
    expect(types["checkout.updateIntent"]).toBe("mutation");
  });

  it("cada mutation de booking.* e checkout.* tem um limite (o seu, ou o do pagamento parceiro)", () => {
    const unclassified = all
      .filter((p) => types[p] === "mutation")
      .filter((p) => !limited.has(p) && !isPartnerPayTrpcPath(`/${p}`));
    // Uma mutation nova aparece aqui: decidir de propósito em que lista entra.
    expect(unclassified).toEqual([]);
  });

  it("nenhuma leitura está numa lista", () => {
    expect([...limited].filter((p) => types[p] !== "mutation")).toEqual([]);
    for (const read of ["checkout.promoBanner", "checkout.getIntent", "checkout.getExtras", "checkout.isEnabled",
      "booking.lowestNightlyBatch", "booking.lowestNightly", "booking.getCalendar", "booking.getQuote",
      "booking.getBatchQuotes", "booking.partnerQuote", "booking.partnerCalendar", "booking.partnerPrices",
      "booking.twoPartsPreview", "booking.searchHint", "booking.checkAvailability", "booking.getStripeConfig"]) {
      expect(types[read], read).toBe("query");
      expect(limited.has(read), read).toBe(false);
    }
  });

  it("as listas só têm procedimentos que existem, e nenhum nas duas", () => {
    expect([...limited].filter((p) => !(p in types))).toEqual([]);
    expect([...CHARGE_PROCEDURES].filter((p) => SAVE_PROCEDURES.has(p))).toEqual([]);
  });

  it("o pagamento das casas parceiras fica com o limite dele, sem contar duas vezes", () => {
    expect(limited.has("booking.partnerPayStart")).toBe(false);
    expect(isPartnerPayTrpcPath("/booking.partnerPayStart")).toBe(true);
  });
});

describe("trpcProcedures / countProcedures", () => {
  it("lê o caminho sozinho ou em batch, com ou sem prefixo, com a vírgula codificada", () => {
    expect(trpcProcedures("/api/trpc/checkout.updateIntent")).toEqual(["checkout.updateIntent"]);
    expect(trpcProcedures("/checkout.updateIntent?batch=1")).toEqual(["checkout.updateIntent"]);
    expect(trpcProcedures("/checkout.setOrigin,checkout.updateIntent")).toEqual(["checkout.setOrigin", "checkout.updateIntent"]);
    expect(trpcProcedures("/checkout.setOrigin%2Ccheckout.updateIntent?batch=1&input=x")).toEqual(["checkout.setOrigin", "checkout.updateIntent"]);
    expect(trpcProcedures(undefined)).toEqual([]);
    expect(trpcProcedures("/")).toEqual([]);
  });

  it("corta depois da última barra, como o adaptador do tRPC", () => {
    expect(countProcedures("/checkout.updateIntent/booking.getQuote", SAVE_PROCEDURES)).toBe(0);
    expect(countProcedures("/x/y/checkout.updateIntent", SAVE_PROCEDURES)).toBe(1);
    // Uma barra codificada não esconde o procedimento ao limite.
    expect(countProcedures("/checkout.updateIntent%2C%2F", SAVE_PROCEDURES)).toBe(1);
    // Codificação inválida: decide com o texto cru, sem rebentar.
    expect(countProcedures("/checkout.updateIntent,%E0%A4%A", SAVE_PROCEDURES)).toBe(1);
  });

  it("conta cada chamada de um batch, e só as da lista", () => {
    expect(countProcedures("/checkout.updateIntent,checkout.updateIntent,checkout.setOrigin", SAVE_PROCEDURES)).toBe(3);
    expect(countProcedures("/checkout.updateIntent,checkout.captureLead", SAVE_PROCEDURES)).toBe(1);
    expect(countProcedures("/checkout.updateIntent,checkout.captureLead", CHARGE_PROCEDURES)).toBe(1);
    expect(countProcedures("/checkout.promoBanner,booking.lowestNightlyBatch,properties.catalogForSite", CHARGE_PROCEDURES)).toBe(0);
    // Nomes parecidos não contam.
    expect(countProcedures("/checkout.updateIntentX,xcheckout.updateIntent,checkout.updateintent", SAVE_PROCEDURES)).toBe(0);
  });
});

/* ── O limitador verdadeiro (express-rate-limit), montado como no servidor ── */
let server: import("node:http").Server | undefined;
afterEach(() => { server?.close(); server = undefined; vi.useRealTimers(); });

async function boot() {
  const app = express();
  const opts = { windowMs: 60 * 1000, standardHeaders: true, legacyHeaders: false, validate: { singleCount: false } } as const;
  // Os mesmos dois limitadores, na mesma ordem e com as mesmas opções de server/_core/index.ts.
  app.use("/api/trpc", weightedTrpcLimiter(rateLimit({ ...opts, max: CHECKOUT_CHARGE_RATE_LIMIT_PER_MIN }), CHARGE_PROCEDURES));
  app.use("/api/trpc", weightedTrpcLimiter(rateLimit({ ...opts, max: CHECKOUT_SAVE_RATE_LIMIT_PER_MIN }), SAVE_PROCEDURES));
  let reached = 0;
  app.use("/api/trpc", (_req, res) => { reached += 1; res.json({ ok: true }); });
  server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/trpc/`;
  const call = (path: string, method: "GET" | "POST" = "POST") => fetch(base + path, { method }).then((r) => r.status);
  return { call, reached: () => reached };
}
const times = async (n: number, fn: () => Promise<number>) => {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) statuses.push(await fn());
  return statuses;
};

describe("as leituras de uma visita normal nunca contam", () => {
  it("mil pedidos de leitura seguidos, do mesmo IP, passam todos", async () => {
    const { call, reached } = await boot();
    // O que as páginas pedem: a barra de campanha (todas), os preços "desde"
    // (listagem), calendário e cotação (página da casa), e o intent (checkout).
    const reads = [
      "checkout.promoBanner?batch=1&input=%7B%7D",
      "checkout.promoBanner,properties.catalogForSite,booking.lowestNightlyBatch?batch=1",
      "booking.lowestNightlyBatch?batch=1",
      "booking.getCalendar,booking.twoPartsPreview?batch=1",
      "booking.getQuote?batch=1",
      "checkout.getIntent,checkout.getExtras?batch=1",
      "booking.getBatchQuotes?batch=1",
      "booking.partnerCalendar,booking.partnerPrices?batch=1",
    ];
    let failed = 0;
    for (let i = 0; i < 1000; i++) if ((await call(reads[i % reads.length], "GET")) !== 200) failed++;
    expect(failed).toBe(0);
    expect(reached()).toBe(1000);
  });

  it("e não gastam o limite das gravações", async () => {
    const { call } = await boot();
    await times(300, () => call("booking.getQuote?batch=1", "GET"));
    expect(await call("checkout.createIntent?batch=1")).toBe(200);
    expect(await call("checkout.updateIntent?batch=1")).toBe(200);
  });
});

describe("um checkout normal passa com folga", () => {
  /**
   * O minuto mais carregado de UM hóspede, pelo que o cliente faz (contado em
   * CheckoutPage.tsx, CheckoutPaymentForm.tsx, BookingWidget.tsx e medido no
   * build de produção): cada linha é um pedido HTTP.
   */
  const busyMinute = [
    "checkout.createIntent",                       // Reservar
    "checkout.setOrigin,checkout.updateIntent",    // abrir o checkout: origem + tarifa pré-selecionada, no mesmo instante
    "checkout.captureLead",                        // Continuar (email)
    ...Array(15).fill("checkout.updateIntent"),    // extras: grava 600 ms depois de cada alteração
    ...Array(4).fill("checkout.updateIntent"),     // receção, Flex e tarifa: um por clique
    ...Array(3).fill("checkout.updateIntent"),     // atualizar o preço / mudar datas
    ...Array(5).fill("booking.applyCoupon"),       // cinco códigos promocionais tentados
    ...Array(5).fill("checkout.updateIntent"),     // … e a cotação nova gravada de cada vez
    "checkout.updateIntent",                       // Continuar para o pagamento
    ...Array(5).fill("checkout.updateIntent"),     // nome, telefone e NIF: 800 ms depois de cada pausa
    ...Array(4).fill("checkout.updateIntent"),     // gravar antes de cada tentativa de pagar
    ...Array(4).fill("checkout.createCardCharge"), // quatro tentativas (três cartões recusados)
    "checkout.finalizeCardCharge",                 // pagamento confirmado
  ];

  it("o minuto mais carregado de um hóspede usa menos de um quarto de cada limite", async () => {
    const charges = busyMinute.reduce((n, p) => n + countProcedures(`/${p}`, CHARGE_PROCEDURES), 0);
    const saves = busyMinute.reduce((n, p) => n + countProcedures(`/${p}`, SAVE_PROCEDURES), 0);
    expect(charges).toBe(12);
    expect(saves).toBe(39);
    expect(charges * 4).toBeLessThanOrEqual(CHECKOUT_CHARGE_RATE_LIMIT_PER_MIN);
    expect(saves * 4).toBeLessThanOrEqual(CHECKOUT_SAVE_RATE_LIMIT_PER_MIN);
  });

  it("quatro hóspedes atrás do mesmo IP, todos nesse minuto, passam todos", async () => {
    const { call } = await boot();
    const statuses: number[] = [];
    for (let guest = 0; guest < 4; guest++) for (const path of busyMinute) statuses.push(await call(`${path}?batch=1`));
    expect(statuses.filter((s) => s !== 200)).toEqual([]);
  });

  it("o teto teórico de uma pessoa a gravar sem parar durante um minuto ainda cabe", async () => {
    // 600 ms de espera entre gravações dos extras: no máximo 100 num minuto;
    // mais um clique por segundo em botões que gravam logo.
    const { call } = await boot();
    const statuses = await times(160, () => call("checkout.updateIntent?batch=1"));
    expect(statuses.filter((s) => s !== 200)).toEqual([]);
  });
});

describe("uma inundação pára", () => {
  it("cobranças: o pedido a seguir ao limite responde 429 e não chega à API", async () => {
    const { call, reached } = await boot();
    const ok = await times(CHECKOUT_CHARGE_RATE_LIMIT_PER_MIN, () => call("checkout.createCardCharge?batch=1"));
    expect(ok.every((s) => s === 200)).toBe(true);
    expect(await call("checkout.createCardCharge?batch=1")).toBe(429);
    // Todas as da lista partilham o mesmo contador.
    expect(await call("booking.applyCoupon?batch=1")).toBe(429);
    expect(await call("checkout.createIntent?batch=1")).toBe(429);
    expect(reached()).toBe(CHECKOUT_CHARGE_RATE_LIMIT_PER_MIN);
  });

  it("gravações: o mesmo, e sem tocar nas cobranças nem nas leituras", async () => {
    const { call } = await boot();
    const ok = await times(CHECKOUT_SAVE_RATE_LIMIT_PER_MIN, () => call("checkout.updateIntent?batch=1"));
    expect(ok.every((s) => s === 200)).toBe(true);
    expect(await call("checkout.updateIntent?batch=1")).toBe(429);
    expect(await call("checkout.setOrigin?batch=1")).toBe(429);
    // Quem está a pagar não fica preso por causa das gravações, nem ao contrário.
    expect(await call("checkout.createCardCharge?batch=1")).toBe(200);
    expect(await call("checkout.getIntent?batch=1", "GET")).toBe(200);
  });

  it("um batch conta uma vez por chamada: juntar tudo num pedido não contorna o limite", async () => {
    const { call, reached } = await boot();
    const ten = Array(10).fill("checkout.createIntent").join(",");
    const statuses = await times(CHECKOUT_CHARGE_RATE_LIMIT_PER_MIN / 10, () => call(`${ten}?batch=1`));
    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(await call("checkout.createIntent?batch=1")).toBe(429);
    expect(reached()).toBe(CHECKOUT_CHARGE_RATE_LIMIT_PER_MIN / 10);
    // Um batch maior do que o que resta é recusado inteiro.
    const fresh = await boot();
    expect(await fresh.call(`${Array(CHECKOUT_CHARGE_RATE_LIMIT_PER_MIN + 1).fill("checkout.createIntent").join(",")}?batch=1`)).toBe(429);
    expect(fresh.reached()).toBe(0);
  });

  it("um batch misto conta em cada limite o que é de cada um", async () => {
    const { call } = await boot();
    await times(CHECKOUT_CHARGE_RATE_LIMIT_PER_MIN - 1, () => call("checkout.captureLead?batch=1"));
    expect(await call("checkout.captureLead,checkout.updateIntent?batch=1")).toBe(200);
    expect(await call("checkout.captureLead,checkout.updateIntent?batch=1")).toBe(429);
    expect(await call("checkout.updateIntent?batch=1")).toBe(200);
  });
});

describe("como o servidor os monta", () => {
  const index = fs.readFileSync("server/_core/index.ts", "utf8");

  it("pelo nome do procedimento, antes da API, e sem os dois app.use que nunca casavam", () => {
    expect(index).toMatch(/app\.use\("\/api\/trpc", weightedTrpcLimiter\(checkoutChargeLimiter, CHARGE_PROCEDURES\)\)/);
    expect(index).toMatch(/app\.use\("\/api\/trpc", weightedTrpcLimiter\(checkoutSaveLimiter, SAVE_PROCEDURES\)\)/);
    expect(index).not.toMatch(/^\s*app\.use\("\/api\/trpc\/(booking|checkout)"/m);
    expect(index.indexOf("weightedTrpcLimiter(checkoutSaveLimiter")).toBeLessThan(index.indexOf("createExpressMiddleware({"));
  });

  it("com os números deste módulo e a contagem repetida permitida", () => {
    expect(index).toContain("max: CHECKOUT_CHARGE_RATE_LIMIT_PER_MIN, standardHeaders: true, legacyHeaders: false, validate: { singleCount: false }");
    expect(index).toContain("max: CHECKOUT_SAVE_RATE_LIMIT_PER_MIN, standardHeaders: true, legacyHeaders: false, validate: { singleCount: false }");
  });
});
