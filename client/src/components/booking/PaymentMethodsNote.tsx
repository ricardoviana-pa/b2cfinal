/**
 * Meios de pagamento aceites e "Ainda não lhe será cobrado nada", antes do
 * portão do email (auditoria do funil, 29 out 2026, crítico: n.º 3 dos
 * "em falta"). Debaixo do Reservar no widget da casa e no passo 1 do
 * checkout: o hóspede sabia como podia pagar só depois de dar o email e
 * preencher seis campos.
 *
 * As marcas são as oficiais do rodapé (public/payments, ver SOURCES.txt),
 * mais pequenas. <img> com lazy loading em vez de SVG no JS: não pesa no
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

export default function PaymentMethodsNote({
  align = "start",
  className,
}: {
  align?: "start" | "center";
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex flex-col gap-1.5", align === "center" ? "items-center text-center" : "items-start", className)}>
      <ul
        aria-label={t("payment.methodsAccepted", "Accepted payment methods")}
        className={cn("flex flex-wrap items-center gap-1", align === "center" && "justify-center")}
      >
        {PAYMENT_MARKS.map((mark) => (
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
