export default function FooterPaymentLogos() {
  return (
    <div className="flex items-center gap-5">
      <img src="/payments/visa.svg" alt="Visa" className="h-5 w-auto brightness-0 invert opacity-[0.22]" />
      <img src="/payments/mastercard.svg" alt="Mastercard" className="h-6 w-auto brightness-0 invert opacity-[0.22]" />
      <img src="/payments/amex.svg" alt="American Express" className="h-[22px] w-auto brightness-0 invert opacity-[0.22]" />
      <img src="/payments/apple-pay.svg" alt="Apple Pay" className="h-[22px] w-auto brightness-0 invert opacity-[0.22]" />
      <img src="/payments/mbway.svg" alt="MB Way" className="h-4 w-auto brightness-0 invert opacity-[0.22]" />
    </div>
  );
}
