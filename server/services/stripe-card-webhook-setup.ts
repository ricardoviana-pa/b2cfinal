/**
 * Auto-registo do webhook de segurança do cartão (2b). No boot: se não há
 * STRIPE_CARD_WEBHOOK_SECRET na env, cria (ou recria) o endpoint
 * `<base>/api/webhooks/stripe-card` via API do Stripe e guarda o signing
 * secret na tabela app_config — o segredo nunca passa por mãos humanas nem
 * por dashboards. Por modo Stripe (test/live), fail-soft: qualquer erro só
 * loga e o comportamento fica como estava (sem rede de segurança).
 */
import Stripe from "stripe";
import mysql from "mysql2/promise";

let secretFromSetup: string | null = null;

/** Secret carregado/criado no boot (null se o setup não correu). */
export function cardWebhookSecretFromSetup(): string | null {
  return secretFromSetup;
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
    if (!key || !dbUrl) return;
    if (process.env.STRIPE_CARD_WEBHOOK_SECRET) {
      console.info("[CardWebhook] STRIPE_CARD_WEBHOOK_SECRET definido na env — auto-registo ignorado");
      return;
    }
    const base = publicBase();
    if (!base) {
      console.info("[CardWebhook] sem URL público https — auto-registo ignorado");
      return;
    }
    const url = `${base}/api/webhooks/stripe-card`;
    const mode = key.startsWith("sk_live") ? "live" : "test";
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
        secretFromSetup = saved;
        console.info(`[CardWebhook] endpoint ativo (${mode}) — secret carregado da app_config`);
        return;
      }
      if (existing && !saved) {
        // Endpoint órfão (o secret só é revelado na criação) — recriar o nosso.
        await stripe.webhookEndpoints.del(existing.id);
        console.info(`[CardWebhook] endpoint órfão ${existing.id} removido para recriação (${mode})`);
      }
      const created = await stripe.webhookEndpoints.create({
        url,
        enabled_events: ["payment_intent.succeeded"],
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
