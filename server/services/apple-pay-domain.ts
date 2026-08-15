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
  // Produção pode omitir SITE_URL — o domínio definitivo é o fallback; o dev
  // define SITE_URL=dev.portugalactive.com e regista o seu próprio domínio.
  const raw =
    process.env.SITE_URL || process.env.PUBLIC_BASE_URL || process.env.APP_URL ||
    "https://www.portugalactive.com";
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
  // Cobrir apex e www do domínio do site + extras por env. Em produção
  // (chaves live) o primeiro boot após o merge regista e valida o domínio
  // definitivo sozinho — os payment_method_domains são por modo (test/live),
  // por isso o live só pode nascer quando as chaves live arrancarem.
  const wanted = new Set<string>([domain]);
  if (domain.startsWith("www.")) wanted.add(domain.slice(4));
  else if (domain.split(".").length === 2) wanted.add("www." + domain);
  for (const extra of (process.env.APPLE_PAY_EXTRA_DOMAINS || "").split(",")) {
    const t = extra.trim();
    if (t) wanted.add(t);
  }
  try {
    const stripe = new Stripe(key);
    const existing = await stripe.paymentMethodDomains.list({ limit: 100 });
    for (const d of wanted) {
      const found = existing.data.find((x) => x.domain_name === d);
      if (found) {
        const status = found.apple_pay?.status;
        console.info(`[ApplePay] domínio ${d} já registado (apple_pay=${status})`);
        if (status !== "active") {
          const v = await stripe.paymentMethodDomains.validate(found.id).catch(() => null);
          if (v) console.info(`[ApplePay] revalidação de ${d}: apple_pay=${v.apple_pay?.status}`);
        }
        continue;
      }
      const created = await stripe.paymentMethodDomains.create({ domain_name: d }).catch((e) => { console.warn(`[ApplePay] ${d}: ${e?.message}`); return null; });
      if (created) console.info(`[ApplePay] domínio ${d} registado: apple_pay=${created.apple_pay?.status}`);
    }
  } catch (err: any) {
    console.warn(`[ApplePay] registo de domínio falhou (${domain}):`, err?.message);
  }
}
