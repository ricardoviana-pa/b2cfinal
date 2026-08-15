/**
 * Apple Pay — registo automático do domínio na conta Stripe da PLATAFORMA.
 *
 * O Apple Pay só renderiza (Safari) quando o domínio está registado e
 * validado; a validação exige o ficheiro da Apple servido em
 * /.well-known/apple-developer-merchantid-domain-association (rota no _core).
 *
 * Corre no arranque, fail-soft e idempotente: lista os domínios já
 * registados e só cria o que faltar. Em dev regista dev.portugalactive.com;
 * em produção (chaves live + SITE_URL live) regista o www — zero passos
 * manuais no lançamento.
 */
import Stripe from "stripe";

function siteDomain(): string | null {
  const raw = process.env.SITE_URL || process.env.PUBLIC_BASE_URL || process.env.APP_URL || "";
  try {
    const host = new URL(raw).hostname;
    return host && host !== "localhost" ? host : null;
  } catch {
    return null;
  }
}

export async function ensureApplePayDomain(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  const domain = siteDomain();
  if (!key || !domain) {
    if (!domain) console.info("[ApplePay] sem SITE_URL válido — registo de domínio ignorado");
    return;
  }
  try {
    const stripe = new Stripe(key);
    const existing = await stripe.paymentMethodDomains.list({ limit: 100 });
    const found = existing.data.find((d) => d.domain_name === domain);
    if (found) {
      const status = found.apple_pay?.status;
      console.info(`[ApplePay] domínio ${domain} já registado (apple_pay=${status})`);
      // Revalida se ficou inválido (ex.: ficheiro passou a ser servido depois)
      if (status !== "active") {
        const v = await stripe.paymentMethodDomains.validate(found.id);
        console.info(`[ApplePay] revalidação de ${domain}: apple_pay=${v.apple_pay?.status}`);
      }
      return;
    }
    const created = await stripe.paymentMethodDomains.create({ domain_name: domain });
    console.info(`[ApplePay] domínio ${domain} registado: apple_pay=${created.apple_pay?.status}`);
  } catch (err: any) {
    console.warn(`[ApplePay] registo de domínio falhou (${domain}):`, err?.message);
  }
}
