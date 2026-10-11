// Keep each brand's proportions and colours. Wallet artwork already includes
// its background and clear space, so it must not be clipped into another chip.
const PAYMENTS = [
  { src: '/payments/visa-c.svg', alt: 'Visa', imageClass: 'h-11 sm:h-12', frame: true },
  { src: '/payments/mastercard-c.svg', alt: 'Mastercard', imageClass: 'h-6 sm:h-7', frame: true },
  { src: '/payments/amex-official.svg', alt: 'American Express', imageClass: 'h-12 sm:h-[54px]' },
  { src: '/payments/apple-pay-badge.svg', alt: 'Apple Pay', imageClass: 'h-8 sm:h-9' },
  // Google's canvas includes clear space: the visible mark is 32px / 36px high.
  { src: '/payments/google-pay-badge.svg', alt: 'Google Pay', imageClass: 'h-[60px] sm:h-[67px]' },
  { src: '/payments/paypal-wordmark.png', alt: 'PayPal', imageClass: 'h-[18px] sm:h-5', frame: true },
  { src: '/payments/klarna-badge.svg', alt: 'Klarna', imageClass: 'h-8 sm:h-9' },
];

export default function FooterPaymentLogos() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-5 xl:justify-end xl:pr-12">
      {PAYMENTS.map((payment) => (
        <span
          key={payment.alt}
          className={`inline-flex h-8 shrink-0 items-center justify-center sm:h-9 ${
            payment.frame ? 'rounded-md bg-white px-2.5' : ''
          }`}
        >
          <img
            src={payment.src}
            alt={payment.alt}
            className={`${payment.imageClass} w-auto max-w-none shrink-0`}
            loading="lazy"
          />
        </span>
      ))}
    </div>
  );
}
