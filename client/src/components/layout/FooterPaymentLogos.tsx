// One shared card treatment: brand artwork determines only the colour and mark,
// never the outer dimensions, border or corner radius.
const PAYMENTS = [
  { src: '/payments/visa-c.svg', alt: 'Visa', logoClass: 'h-11 w-11 sm:h-12 sm:w-12', background: '#ffffff' },
  { src: '/payments/mastercard-c.svg', alt: 'Mastercard', logoClass: 'h-6 w-auto sm:h-7', background: '#ffffff' },
  { src: '/payments/marks/amex.svg', alt: 'American Express', logoClass: 'w-[52px] h-auto sm:w-16', background: '#006fcf' },
  { src: '/payments/marks/apple-pay.svg', alt: 'Apple Pay', logoClass: 'w-full h-auto', background: '#ffffff' },
  { src: '/payments/marks/google-pay.svg', alt: 'Google Pay', logoClass: 'w-full h-auto', background: '#ffffff' },
  { src: '/payments/marks/paypal-blue.png', alt: 'PayPal', logoClass: 'w-12 h-auto sm:w-16', background: '#ffffff' },
  { src: '/payments/marks/klarna.svg', alt: 'Klarna', logoClass: 'w-full h-auto', background: '#ffa8cd' },
];

export default function FooterPaymentLogos() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 xl:justify-end xl:pr-12">
      {PAYMENTS.map((payment) => (
        <span
          key={payment.alt}
          className="inline-flex h-[38px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-md ring-1 ring-inset ring-black/10 sm:h-12 sm:w-[76px]"
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
