/**
 * Auto-registo do webhook de segurança do cartão (2b). No boot: se não há
 * STRIPE_CARD_WEBHOOK_SECRET na env, cria (ou recria) o endpoint
 * `<base>/api/webhooks/stripe-card` via API do Stripe e guarda o signing
 * secret na tabela app_config — o segredo nunca passa por mãos humanas nem
 * por dashboards. Por modo Stripe (test/live), fail-soft: qualquer erro só
 * loga e o comportamento fica como estava (sem rede de segurança).
 *
 * Duas partes (Fase 2a, spec 5.4): o endpoint passa a receber também os
 * eventos do motor da 2.ª parte. Um endpoint que já existe é ATUALIZADO
 * (webhookEndpoints.update), nunca recriado: o signing secret só é revelado
 * na criação, e recriar obrigava a trocar o segredo em produção.
 */
import Stripe from "stripe";
import mysql from "mysql2/promise";

let secretFromSetup: string | null = null;

/** Secret carregado/criado no boot (null se o setup não correu). */
export function cardWebhookSecretFromSetup(): string | null {
  return secretFromSetup;
}

/**
 * Eventos que o endpoint do cartão tem de receber. O `satisfies` prende cada
 * nome à lista do SDK instalado: um evento inventado ou mal escrito não
 * compila (a Stripe recusaria o update e o endpoint ficava como estava).
 * - payment_intent.succeeded: settle da 1.ª parte (2b) e 2.ª parte paga;
 * - payment_intent.payment_failed: recusa da 2.ª parte (last_decline_code);
 * - charge.refunded: reembolsos (hard stop, cancelamento pelo hóspede);
 * - charge.dispute.created: disputa, com a parte (1/2 ou 2/2) no alerta.
 * Enquanto o motor está desligado o handler só regista estes tipos.
 */
export const CARD_WEBHOOK_EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  // Um reembolso "pending" que falha mais tarde (o hóspede já foi avisado de
  // que o dinheiro voltou): só este evento o diz.
  "refund.failed",
] as const satisfies readonly Stripe.WebhookEndpointCreateParams.EnabledEvent[];

/** Eventos de CARD_WEBHOOK_EVENTS que faltam a um endpoint ("*" já recebe tudo). */
export function missingCardWebhookEvents(
  enabled: readonly string[] | null | undefined,
): Array<(typeof CARD_WEBHOOK_EVENTS)[number]> {
  const have = new Set(enabled ?? []);
  if (have.has("*")) return [];
  return CARD_WEBHOOK_EVENTS.filter((e) => !have.has(e));
}

/**
 * Junta ao endpoint os eventos em falta, mantendo os que lá estão: alguém pode
 * ter acrescentado eventos à mão no Dashboard e tirá-los partiria outra coisa.
 * Fail-soft: um update falhado deixa o endpoint como estava (o
 * payment_intent.succeeded continua a chegar) e só loga.
 */
async function ensureEndpointEvents(stripe: Stripe, ep: Stripe.WebhookEndpoint, mode: string): Promise<void> {
  const missing = missingCardWebhookEvents(ep.enabled_events);
  if (missing.length === 0) return;
  try {
    const enabled = Array.from(new Set([...(ep.enabled_events ?? []), ...missing])) as Stripe.WebhookEndpointUpdateParams.EnabledEvent[];
    await stripe.webhookEndpoints.update(ep.id, { enabled_events: enabled });
    console.info(`[CardWebhook] endpoint ${ep.id} (${mode}) passou a receber: ${missing.join(", ")}`);
  } catch (err: any) {
    console.warn(`[CardWebhook] atualizar eventos do endpoint ${ep.id} (${mode}) falhou (fail-soft):`, err?.message || err);
  }
}

function publicBase(): string | null {
  const raw =
    process.env.SITE_URL || process.env.PUBLIC_BASE_URL || process.env.APP_URL ||
    "https://www.portugalactive.com";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.hostname === "localhost") return null;
    return `${u.origin}`;
  } catch {
    return null;
  }
}

export async function ensureCardWebhookEndpoint(): Promise<void> {
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    const dbUrl = process.env.DATABASE_URL;
    if (!key) return;
    const mode = key.startsWith("sk_live") ? "live" : "test";
    if (process.env.STRIPE_CARD_WEBHOOK_SECRET) {
      console.info("[CardWebhook] STRIPE_CARD_WEBHOOK_SECRET definido na env — auto-registo ignorado");
      // O segredo é humano, mas o endpoint com o nosso URL continua a precisar
      // dos eventos da 2.ª parte. Só se acrescentam eventos: nunca se cria,
      // apaga ou recria nada neste ramo, e o segredo não muda.
      const base = publicBase();
      if (!base) return;
      const url = `${base}/api/webhooks/stripe-card`;
      const stripe = new Stripe(key);
      const eps = await stripe.webhookEndpoints.list({ limit: 100 });
      const existing = eps.data.find((e) => e.url === url && e.status === "enabled");
      if (existing) await ensureEndpointEvents(stripe, existing, mode);
      return;
    }
    if (!dbUrl) return;
    const base = publicBase();
    if (!base) {
      console.info("[CardWebhook] sem URL público https — auto-registo ignorado");
      return;
    }
    const url = `${base}/api/webhooks/stripe-card`;
    const cfgKey = `stripe_card_webhook_secret_${mode}`;

    const conn = await mysql.createConnection(dbUrl);
    try {
      await conn.query(
        "CREATE TABLE IF NOT EXISTS `app_config` (`k` varchar(128) NOT NULL PRIMARY KEY, `v` text NOT NULL, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)"
      );
      const stripe = new Stripe(key);
      const eps = await stripe.webhookEndpoints.list({ limit: 100 });
      const existing = eps.data.find((e) => e.url === url && e.status === "enabled");

      const [rows] = await conn.query("SELECT `v` FROM `app_config` WHERE `k` = ?", [cfgKey]);
      const saved = Array.isArray(rows) && (rows as any[])[0]?.v ? String((rows as any[])[0].v) : null;

      if (existing && saved) {
        // O segredo fica carregado ANTES do update: um update falhado não pode
        // deixar o webhook do settle sem segredo.
        secretFromSetup = saved;
        console.info(`[CardWebhook] endpoint ativo (${mode}) — secret carregado da app_config`);
        await ensureEndpointEvents(stripe, existing, mode);
        return;
      }
      if (existing && !saved) {
        // Endpoint órfão (o secret só é revelado na criação) — recriar o nosso.
        await stripe.webhookEndpoints.del(existing.id);
        console.info(`[CardWebhook] endpoint órfão ${existing.id} removido para recriação (${mode})`);
      }
      const created = await stripe.webhookEndpoints.create({
        url,
        enabled_events: [...CARD_WEBHOOK_EVENTS],
        description: "Portugal Active — checkout 2.0 card safety net (auto-registered at boot)",
      });
      if (!created.secret) {
        console.warn("[CardWebhook] criado sem secret na resposta — inesperado, rede inativa");
        return;
      }
      await conn.query(
        "INSERT INTO `app_config` (`k`,`v`) VALUES (?,?) ON DUPLICATE KEY UPDATE `v`=VALUES(`v`)",
        [cfgKey, created.secret]
      );
      secretFromSetup = created.secret;
      console.info(`[CardWebhook] endpoint criado e secret guardado (${mode}) — ${url}`);
    } finally {
      await conn.end().catch(() => {});
    }
  } catch (err: any) {
    console.warn("[CardWebhook] auto-registo falhou (fail-soft):", err?.message || err);
  }
}
