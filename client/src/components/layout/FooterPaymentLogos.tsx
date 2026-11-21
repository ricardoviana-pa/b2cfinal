// One shared card treatment: brand artwork determines only the colour and mark,
// never the outer dimensions, border or corner radius.
// Smaller since 20 nov 2026 (decisão E10 do Ricardo: "mais pequenos sim mas deixa
// ficar as cores"): seven 76 px tiles in colour spoke louder than the brand's own
// logo above them. 44 x 28 px on a phone, 52 x 32 px from 640 px.
const PAYMENTS = [
  { src: '/payments/visa-c.svg', alt: 'Visa', logoClass: 'h-8 w-8 sm:h-9 sm:w-9', background: '#ffffff' },
  { src: '/payments/mastercard-c.svg', alt: 'Mastercard', logoClass: 'h-[18px] w-auto sm:h-5', background: '#ffffff' },
  { src: '/payments/marks/amex.svg', alt: 'American Express', logoClass: 'w-[38px] h-auto sm:w-11', background: '#006fcf' },
  { src: '/payments/marks/apple-pay.svg', alt: 'Apple Pay', logoClass: 'w-full h-auto', background: '#ffffff' },
  { src: '/payments/marks/google-pay.svg', alt: 'Google Pay', logoClass: 'w-full h-auto', background: '#ffffff' },
  { src: '/payments/marks/paypal-blue.png', alt: 'PayPal', logoClass: 'w-9 h-auto sm:w-11', background: '#ffffff' },
  { src: '/payments/marks/klarna.svg', alt: 'Klarna', logoClass: 'w-full h-auto', background: '#ffa8cd' },
];

export default function FooterPaymentLogos() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 xl:justify-end xl:pr-12">
      {PAYMENTS.map((payment) => (
        <span
          key={payment.alt}
          className="inline-flex h-7 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1 ring-inset ring-black/10 sm:h-8 sm:w-[52px]"
          style={{ backgroundColor: payment.background }}
        >
          <img
            src={payment.src}
            alt={payment.alt}
            className={`${payment.logoClass} shrink-0 object-contain`}
            loading="lazy"
          />
        </span>
      ))}
    </div>
  );
}
