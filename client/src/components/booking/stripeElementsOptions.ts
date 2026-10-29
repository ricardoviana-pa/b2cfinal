/**
 * Opções do Elements do ExpressCheckoutElement (Apple Pay / Google Pay), fora
 * do componente para se poderem testar sem React.
 *
 * Instância separada do PaymentElement: sem paymentMethodCreation manual e
 * sem paymentMethodTypes (o ECE só mostra as wallets elegíveis no aparelho).
 * O setupFutureUsage espelha o do PaymentIntent (shared/stripeSetupFutureUsage).
 */
import { CHECKOUT_SETUP_FUTURE_USAGE } from "@shared/stripeSetupFutureUsage";

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
