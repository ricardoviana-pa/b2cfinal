/**
 * Auto-registo do webhook do cartão (spec 5.4, Fase 2a): o endpoint passa a
 * receber os eventos da 2.ª parte e um endpoint existente é ATUALIZADO, nunca
 * recriado (o signing secret só é revelado na criação). SDK da Stripe e
 * mysql2 mockados; cada teste importa o módulo de novo porque o segredo
 * carregado vive no estado do módulo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  del: vi.fn(),
  createConnection: vi.fn(),
  query: vi.fn(),
  end: vi.fn(async () => {}),
  saved: null as string | null,
}));

vi.mock("stripe", () => ({
  default: vi.fn(() => ({ webhookEndpoints: { list: h.list, update: h.update, create: h.create, del: h.del } })),
}));
vi.mock("mysql2/promise", () => ({ default: { createConnection: h.createConnection } }));

const URL = "https://www.portugalactive.com/api/webhooks/stripe-card";
const FULL = ["payment_intent.succeeded", "payment_intent.payment_failed", "charge.refunded", "charge.dispute.created", "refund.failed"];
const ENV_KEYS = ["STRIPE_SECRET_KEY", "DATABASE_URL", "STRIPE_CARD_WEBHOOK_SECRET", "SITE_URL", "PUBLIC_BASE_URL", "APP_URL"];
let envBackup: Record<string, string | undefined>;

async function load() {
  vi.resetModules();
  return import("./stripe-card-webhook-setup");
}

function endpoint(over: Record<string, any> = {}) {
  return { id: "we_1", url: URL, status: "enabled", enabled_events: ["payment_intent.succeeded"], ...over };
}

beforeEach(() => {
  envBackup = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.DATABASE_URL = "mysql://fake";
  process.env.SITE_URL = "https://www.portugalactive.com";
  for (const fn of [h.list, h.update, h.create, h.del, h.createConnection, h.query]) fn.mockReset();
  h.saved = null;
  h.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT")) return [h.saved ? [{ v: h.saved }] : []];
    return [{}];
  });
  h.createConnection.mockResolvedValue({ query: h.query, end: h.end });
  h.update.mockResolvedValue({});
  h.del.mockResolvedValue({ deleted: true });
  h.create.mockResolvedValue({ id: "we_new", secret: "whsec_new" });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
  vi.restoreAllMocks();
});

describe("eventos subscritos", () => {
  it("são exatamente os quatro do contrato da Fase 2a", async () => {
    const { CARD_WEBHOOK_EVENTS } = await load();
    expect([...CARD_WEBHOOK_EVENTS]).toEqual(FULL);
  });

  it("missingCardWebhookEvents: o que falta; \"*\" já cobre tudo", async () => {
    const { missingCardWebhookEvents } = await load();
    expect(missingCardWebhookEvents(["payment_intent.succeeded"])).toEqual(FULL.slice(1));
    expect(missingCardWebhookEvents(FULL)).toEqual([]);
    expect(missingCardWebhookEvents(["*"])).toEqual([]);
    expect(missingCardWebhookEvents(undefined)).toEqual(FULL);
  });
});

describe("ensureCardWebhookEndpoint", () => {
  it("endpoint existente com segredo guardado e eventos em falta: update, sem recriar", async () => {
    h.saved = "whsec_saved";
    h.list.mockResolvedValueOnce({ data: [endpoint({ enabled_events: ["payment_intent.succeeded", "charge.succeeded"] })] });
    const m = await load();
    await m.ensureCardWebhookEndpoint();
    expect(h.update).toHaveBeenCalledTimes(1);
    const [id, body] = h.update.mock.calls[0];
    expect(id).toBe("we_1");
    // União: um evento juntado à mão (charge.succeeded) fica.
    expect([...body.enabled_events].sort()).toEqual([...FULL, "charge.succeeded"].sort());
    expect(h.create).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
    expect(m.cardWebhookSecretFromSetup()).toBe("whsec_saved");
  });

  it("endpoint já com todos os eventos (ou \"*\"): nenhum update", async () => {
    h.saved = "whsec_saved";
    h.list.mockResolvedValueOnce({ data: [endpoint({ enabled_events: FULL })] });
    let m = await load();
    await m.ensureCardWebhookEndpoint();
    h.list.mockResolvedValueOnce({ data: [endpoint({ enabled_events: ["*"] })] });
    m = await load();
    await m.ensureCardWebhookEndpoint();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(m.cardWebhookSecretFromSetup()).toBe("whsec_saved");
  });

  it("update falhado: o segredo continua carregado e nada é recriado (fail-soft)", async () => {
    h.saved = "whsec_saved";
    h.list.mockResolvedValueOnce({ data: [endpoint()] });
    h.update.mockRejectedValueOnce(new Error("stripe down"));
    const m = await load();
    await expect(m.ensureCardWebhookEndpoint()).resolves.toBeUndefined();
    expect(m.cardWebhookSecretFromSetup()).toBe("whsec_saved");
    expect(h.create).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
  });

  it("sem endpoint: cria com os quatro eventos e guarda o segredo na app_config", async () => {
    h.list.mockResolvedValueOnce({ data: [endpoint({ url: "https://outro.example/api/webhooks/stripe-card" })] });
    const m = await load();
    await m.ensureCardWebhookEndpoint();
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ url: URL, enabled_events: FULL }));
    const insert = h.query.mock.calls.find(([sql]) => String(sql).startsWith("INSERT"));
    expect(insert?.[1]).toEqual(["stripe_card_webhook_secret_test", "whsec_new"]);
    expect(m.cardWebhookSecretFromSetup()).toBe("whsec_new");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("endpoint órfão (sem segredo guardado): apaga e recria com os quatro eventos", async () => {
    h.list.mockResolvedValueOnce({ data: [endpoint()] });
    const m = await load();
    await m.ensureCardWebhookEndpoint();
    expect(h.del).toHaveBeenCalledWith("we_1");
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ enabled_events: FULL }));
    expect(h.update).not.toHaveBeenCalled();
  });

  it("chave live usa a chave de configuração live", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_mock";
    h.list.mockResolvedValueOnce({ data: [] });
    const m = await load();
    await m.ensureCardWebhookEndpoint();
    const select = h.query.mock.calls.find(([sql]) => String(sql).startsWith("SELECT"));
    expect(select?.[1]).toEqual(["stripe_card_webhook_secret_live"]);
  });

  it("segredo na env: só acrescenta eventos ao endpoint do nosso URL, sem BD, sem criar nem apagar", async () => {
    process.env.STRIPE_CARD_WEBHOOK_SECRET = "whsec_env";
    h.list.mockResolvedValueOnce({ data: [endpoint()] });
    const m = await load();
    await m.ensureCardWebhookEndpoint();
    expect(h.createConnection).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith("we_1", { enabled_events: FULL });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.del).not.toHaveBeenCalled();
    // O segredo da env é lido pela rota; o setup não o substitui.
    expect(m.cardWebhookSecretFromSetup()).toBeNull();
  });

  it("segredo na env e nenhum endpoint com o nosso URL: não faz nada", async () => {
    process.env.STRIPE_CARD_WEBHOOK_SECRET = "whsec_env";
    h.list.mockResolvedValueOnce({ data: [endpoint({ url: "https://outro.example/x" })] });
    const m = await load();
    await m.ensureCardWebhookEndpoint();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("sem chave Stripe ou sem URL público https: não fala com a Stripe", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    let m = await load();
    await m.ensureCardWebhookEndpoint();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    process.env.SITE_URL = "http://localhost:3000";
    m = await load();
    await m.ensureCardWebhookEndpoint();
    expect(h.list).not.toHaveBeenCalled();
    expect(h.createConnection).not.toHaveBeenCalled();
  });

  it("erro da Stripe ao listar: fail-soft, não lança", async () => {
    h.list.mockRejectedValueOnce(new Error("network"));
    const m = await load();
    await expect(m.ensureCardWebhookEndpoint()).resolves.toBeUndefined();
    expect(m.cardWebhookSecretFromSetup()).toBeNull();
    expect(h.end).toHaveBeenCalled();
  });
});
