const PAYMENTS = [
  { src: '/payments/visa.svg', alt: 'Visa', h: 'h-5' },
  { src: '/payments/mastercard.svg', alt: 'Mastercard', h: 'h-6' },
  { src: '/payments/amex.svg', alt: 'American Express', h: 'h-[22px]' },
  { src: '/payments/apple-pay.svg', alt: 'Apple Pay', h: 'h-[22px]' },
  { src: '/payments/paypal.svg', alt: 'PayPal', h: 'h-[18px]' },
  { src: '/payments/klarna.svg', alt: 'Klarna', h: 'h-4' },
];

export default function FooterPaymentLogos() {
  return (
    <div className="flex items-center gap-5">
      {PAYMENTS.map((p) => (
        <img
          key={p.alt}
          src={p.src}
          alt={p.alt}
          className={`${p.h} w-auto brightness-0 invert opacity-40 hover:opacity-60 transition-opacity`}
          loading="lazy"
        />
      ))}
    </div>
  );
}
