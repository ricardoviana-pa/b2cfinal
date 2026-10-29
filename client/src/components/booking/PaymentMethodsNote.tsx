/**
 * Meios de pagamento aceites e "Ainda não lhe será cobrado nada", antes do
 * portão do email (auditoria do funil, 29 out 2026, crítico: n.º 3 dos
 * "em falta"). Debaixo do Reservar no widget da casa e no passo 1 do
 * checkout: o hóspede sabia como podia pagar só depois de dar o email e
 * preencher seis campos.
 *
 * As marcas são as oficiais do rodapé (public/payments, ver SOURCES.txt),
 * mais pequenas; a da Klarna só quando o total cabe no limite dela. <img> com lazy loading em vez de SVG no JS: não pesa no
 * bundle da página da casa, onde o telemóvel já é lento.
 */
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Visa, Mastercard e Amex (cartão), Apple Pay e Google Pay, PayPal, Klarna. */
export const PAYMENT_MARKS = [
  { src: "/payments/visa-c.svg", alt: "Visa", logoClass: "h-[22px] w-[22px]", background: "#ffffff" },
  { src: "/payments/mastercard-c.svg", alt: "Mastercard", logoClass: "h-[13px] w-auto", background: "#ffffff" },
  { src: "/payments/marks/amex.svg", alt: "American Express", logoClass: "w-[27px] h-auto", background: "#006fcf" },
  { src: "/payments/marks/apple-pay.svg", alt: "Apple Pay", logoClass: "w-full h-auto", background: "#ffffff" },
  { src: "/payments/marks/google-pay.svg", alt: "Google Pay", logoClass: "w-full h-auto", background: "#ffffff" },
  { src: "/payments/marks/paypal-blue.png", alt: "PayPal", logoClass: "w-[26px] h-auto", background: "#ffffff" },
  { src: "/payments/marks/klarna.svg", alt: "Klarna", logoClass: "w-full h-auto", background: "#ffa8cd" },
] as const;

/**
 * A Klarna confirma com o país de faturação PT (KlarnaCheckoutButton), e o
 * Pay in 3 para clientes portugueses vai até 1 000 € (docs/pagamento_duas_partes.md
 * §2.1). Acima disso a Klarna recusa quase sempre: a marca só se mostra quando
 * o total cabe no limite, para não prometer antes do email um método que falha
 * (revisão do PR #176). Sem total conhecido, não se promete.
 */
export const KLARNA_MAX_EUR = 1000;

export function paymentMarksFor(total: number | null | undefined) {
  const klarna = typeof total === "number" && total > 0 && total <= KLARNA_MAX_EUR;
  return PAYMENT_MARKS.filter((mark) => mark.alt !== "Klarna" || klarna);
}

export default function PaymentMethodsNote({
  align = "start",
  className,
  total,
}: {
  align?: "start" | "center";
  className?: string;
  /** O total que a Klarna cobraria (EUR): decide se a marca da Klarna aparece. */
  total?: number | null;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex flex-col gap-1.5", align === "center" ? "items-center text-center" : "items-start", className)}>
      <ul
        aria-label={t("payment.methodsAccepted", "Accepted payment methods")}
        className={cn("flex flex-wrap items-center gap-1", align === "center" && "justify-center")}
      >
        {paymentMarksFor(total).map((mark) => (
          <li
            key={mark.alt}
            className="inline-flex h-[20px] w-[32px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] ring-1 ring-inset ring-black/10"
            style={{ backgroundColor: mark.background }}
          >
            <img
              src={mark.src}
              alt={mark.alt}
              className={cn(mark.logoClass, "shrink-0 object-contain")}
              loading="lazy"
              decoding="async"
            />
          </li>
        ))}
      </ul>
      <p className="caption text-pa-earth leading-snug">{t("payment.notChargedYet", "You won't be charged yet.")}</p>
    </div>
  );
}
