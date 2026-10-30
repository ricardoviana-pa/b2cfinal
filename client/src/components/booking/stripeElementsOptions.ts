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

/**
 * Etiquetas dos campos do cartão a 12 px, o `caption` com que o próprio
 * checkout escreve as suas etiquetas (revisão do #181, B1). A Stripe só põe a
 * validade e o código de segurança lado a lado quando o que está escrito cabe
 * em cada coluna; com a DM Sans aos 14,88 px dela (mais larga do que o Times
 * de antes) deixava de caber nos telemóveis e os dois campos empilhavam-se: o
 * cartão crescia até 99 px e empurrava os Termos e o Pagar (pt, es, de e nl a
 * 390 px; pt, es e it a 375; sv a 360; de e fi a 414). Uma vez empilhado, não
 * volta atrás. Medido no checkout real, nas 9 línguas: a 12 px nenhuma
 * empilha onde o Times as deixava lado a lado (a 13 px ainda empilhava pt a
 * 375). O texto escrito nos campos fica nos 16 px da Stripe: abaixo disso o
 * iPhone faz zoom ao tocar no campo.
 */
export const STRIPE_LABEL_FONT_SIZE = "12px";

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
  rules: {
    ".Label": { fontSize: STRIPE_LABEL_FONT_SIZE },
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
        ...STRIPE_CARD_APPEARANCE.rules,
        // Hide Stripe's built-in payment method tab selector — we use our own selector UI
        ".p-PaymentMethodSelector": { display: "none" },
      },
    },
  };
}

/**
 * O que a folha do Apple Pay / Google Pay pede ao hóspede (decisão do
 * Ricardo, 29 out 2026: as wallets à cabeça, sem esperar pelos campos da
 * página). A reserva precisa de nome, email e telefone: o nome vem sempre com
 * o pagador; o email e o telefone têm de ser pedidos. No confirm chegam em
 * `event.billingDetails` e gravam-se no intent antes de criar a cobrança
 * (walletGuestDetails + flushPendingSaves).
 */
export const EXPRESS_CHECKOUT_CONTACT_FIELDS = { emailRequired: true, phoneNumberRequired: true } as const;

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
