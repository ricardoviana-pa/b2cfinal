/**
 * One slim reassurance line above the listing results (auditoria 29 out,
 * ux-home-plp-07). Only claims that hold for every home on the list:
 *
 * - Refundable rates cancel for free until a set date before arrival, and that
 *   date is shown before payment (shared/cancellationPolicy.ts: MODERATE /
 *   FIRM / STRICT / STRICT_60 → 7–60 days; "The policy of your rate is shown
 *   before you pay"). The sentence is conditional on the rate, so homes
 *   without a refundable rate don't make it untrue. Links to the policy page.
 * - The concierge answers on WhatsApp (the number every page uses). No reply
 *   time is promised.
 *
 * Deliberately not here: "best rate" (the audit flagged it on partner homes,
 * seo-health-faq-jsonld-drift) and "managed by our team" (partner homes are
 * run by the partner, ux-home-plp-02).
 */
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { MessageCircle, ShieldCheck } from 'lucide-react';
import { trackAttributes, type TrackContext } from './ListingWhatsApp';

export default function ListingReassurance({ whatsappHref, context }: { whatsappHref: string; context?: TrackContext }) {
  const { t } = useTranslation();
  const item = 'inline-flex items-start gap-2 underline-offset-4 decoration-pa-sand hover:underline hover:text-pa-dark';
  return (
    <ul data-testid="listing-reassurance" className="mb-5 flex flex-col gap-y-1.5 sm:flex-row sm:flex-wrap sm:gap-x-6 font-body text-[13px] leading-snug text-pa-earth">
      <li>
        <Link href="/legal/cancellation-policy" className={item}>
          <ShieldCheck aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-pa-gold" />
          <span>{t('listingReassurance.cancellation')}</span>
        </Link>
      </li>
      <li>
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" {...trackAttributes('listing_reassurance', context)} className={item}>
          <MessageCircle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-pa-gold" />
          <span>{t('listingReassurance.whatsapp')}</span>
        </a>
      </li>
    </ul>
  );
}
