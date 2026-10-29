/**
 * Opções dos Elements da Stripe, fora dos componentes para se poderem testar
 * sem React: o cartão do checkout (PaymentElement), as wallets
 * (ExpressCheckoutElement) e a aparência que o cartão da página do saldo
 * também usa.
 *
 * O setupFutureUsage espelha o do PaymentIntent (shared/stripeSetupFutureUsage).
 */
import { CHECKOUT_SETUP_FUTURE_USAGE } from "@shared/stripeSetupFutureUsage";

/**
 * A letra do site dentro do iframe da Stripe (verificação em produção, 29 out
 * 2026: o cartão saía em Times em todas as línguas). O fontFamily era
 * "var(--font-body), Arial, sans-serif", mas a variável só existe na página:
 * dentro do iframe, que é de outra origem, ficava vazia e a declaração inteira
 * caía (nem o Arial valia). A Stripe quer o nome da letra por extenso e a
 * folha que a carrega em `fonts`, num cssSrc que ela própria vai buscar: o
 * Google Fonts responde com CORS. As mesmas espessuras do client/index.html.
 *
 * `fonts` não pode mudar depois de o Elements montar (o react-stripe-js
 * ignora a mudança e avisa): é uma constante do módulo, a mesma em cada
 * render, nunca um array criado de novo com outras letras.
 */
export const STRIPE_FONTS: Array<{ cssSrc: string }> = [
  { cssSrc: "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap" },
];

/** Nunca uma var(): o valor é aplicado dentro do iframe da Stripe. */
export const STRIPE_FONT_FAMILY = '"DM Sans", system-ui, sans-serif';

/** Aparência dos campos do cartão (checkout e página do saldo). */
export const STRIPE_CARD_APPEARANCE = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#1A1A18",
    colorBackground: "#ffffff",
    colorText: "#1A1A18",
    fontFamily: STRIPE_FONT_FAMILY,
    borderRadius: "4px",
  },
};

/**
 * Elements do cartão no checkout, em modo de intent diferido (sem
 * clientSecret: mode + amount + currency dão o contexto à Stripe). Uma só
 * instância para o cartão: mudar de plano atualiza o valor (elements.update)
 * e o cartão escrito fica; `fonts` vai na primeira vez e nunca muda.
 */
export function cardElementsOptions(total: number, currency: string | undefined, locale: string) {
  return {
    mode: "payment" as const,
    amount: Math.round(total * 100), // Stripe expects cents
    currency: (currency || "eur").toLowerCase(),
    paymentMethodCreation: "manual" as const,
    locale: locale as any,
    // Tem de espelhar o setup_future_usage do PaymentIntent (o servidor cria
    // com off_session para o cartao ficar em carteira no Guesty). Se os dois
    // divergirem o Stripe recusa o confirm: "The provided setup_future_usage
    // (off_session) does not match the expected setup_future_usage (null)"
    // — apanhado no teste em dev, 28 ago 2026.
    setupFutureUsage: CHECKOUT_SETUP_FUTURE_USAGE,
    // Card form em sessão types (layout só-cartão, sem o seletor interno do
    // Stripe); o servidor cria o PI no formato que casa com a sessão: types
    // para o card form, automatic para o ECE (input wallet no createCardCharge).
    paymentMethodTypes: ["card"],
    fonts: STRIPE_FONTS,
    appearance: {
      ...STRIPE_CARD_APPEARANCE,
      rules: {
        // Hide Stripe's built-in payment method tab selector — we use our own selector UI
        ".p-PaymentMethodSelector": { display: "none" },
      },
    },
  };
}

/**
 * Elements do ExpressCheckoutElement (Apple Pay / Google Pay). Instância
 * separada do PaymentElement: sem paymentMethodCreation manual e sem
 * paymentMethodTypes (o ECE só mostra as wallets elegíveis no aparelho).
 * Sem `fonts`: os botões das wallets usam a letra da Apple e da Google.
 */
export function expressCheckoutElementsOptions(total: number, currency: string | undefined, locale: string) {
  return {
    mode: "payment" as const,
    amount: Math.round(total * 100),
    currency: (currency || "eur").toLowerCase(),
    locale: locale as any,
    setupFutureUsage: CHECKOUT_SETUP_FUTURE_USAGE,
    appearance: {
      theme: "stripe" as const,
      variables: { colorPrimary: "#1A1A18", borderRadius: "4px" },
    },
  };
}
