// Payment marks sit in tight light chips so the brand colours read clearly
// against the dark footer (a flat monochrome row was nearly invisible). Chips
// hug each logo (little white margin) and each mark keeps its own optical
// height. Amex is a filled blue badge — a thin tinted glyph was illegible at
// this size — so it fills its chip instead of sitting on white.
const PAYMENTS = [
  { src: '/payments/visa-c.svg', alt: 'Visa', h: 'h-[23px]' },
  { src: '/payments/mastercard-c.svg', alt: 'Mastercard', h: 'h-[21px]' },
  { src: '/payments/amex-badge.svg', alt: 'American Express', fill: true },
  { src: '/payments/apple-pay-c.svg', alt: 'Apple Pay', h: 'h-[26px]' },
  { src: '/payments/paypal-c.svg', alt: 'PayPal', h: 'h-[16px]' },
  { src: '/payments/klarna-c.svg', alt: 'Klarna', h: 'h-[15px]' },
];

export default function FooterPaymentLogos() {
  return (
    <div className="flex items-center gap-1.5">
      {PAYMENTS.map((p) =>
        p.fill ? (
          <span
            key={p.alt}
            className="inline-flex h-[26px] rounded-[5px] overflow-hidden shadow-sm"
          >
            <img src={p.src} alt={p.alt} className="h-[26px] w-auto" loading="lazy" />
          </span>
        ) : (
          <span
            key={p.alt}
            className="inline-flex items-center justify-center h-[26px] px-1.5 rounded-[5px] bg-white shadow-sm ring-1 ring-black/5"
          >
            <img src={p.src} alt={p.alt} className={`${p.h} w-auto`} loading="lazy" />
          </span>
        )
      )}
    </div>
  );
}
