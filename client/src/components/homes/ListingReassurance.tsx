/**
 * One slim reassurance line above the listing results (auditoria 29 out,
 * ux-home-plp-07). Only claims that hold for the homes it sits above:
 *
 * - Refundable rates paid online cancel for free until a set date before
 *   arrival, and that date is shown before payment (shared/cancellationPolicy.ts:
 *   MODERATE / FIRM / STRICT / STRICT_60 → 7–60 days; "The policy of your rate
 *   is shown before you pay"). Links to the policy page. Shown only when
 *   `showCancellation` (lib/listingReassurance.ts): some listed home is booked
 *   and paid here, and the arrival date, if any, leaves every refundable
 *   period open (revisão do PR #175, R3).
 * - The concierge answers on WhatsApp (the number every page uses). No reply
 *   time is promised. From 1024 px only: below that the listing's WhatsApp
 *   button is on screen already (R5).
 *
 * On a phone that leaves one line, or nothing, above the first home.
 *
 * Deliberately not here: "best rate" (the audit flagged it on partner homes,
 * seo-health-faq-jsonld-drift) and "managed by our team" (partner homes are
 * run by the partner, ux-home-plp-02).
 */
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { MessageCircle, ShieldCheck } from 'lucide-react';
import { trackAttributes, type TrackContext } from './ListingWhatsApp';

export default function ListingReassurance({ whatsappHref, context, showCancellation }: {
  whatsappHref: string;
  context?: TrackContext;
  showCancellation: boolean;
}) {
  const { t } = useTranslation();
  const item = 'inline-flex items-start gap-2 underline-offset-4 decoration-pa-sand hover:underline hover:text-pa-dark';
  return (
    <ul
      data-testid="listing-reassurance"
      className={`${showCancellation ? 'flex mb-3' : 'hidden'} lg:flex lg:mb-5 flex-row flex-wrap gap-x-6 gap-y-1.5 font-body text-[13px] leading-snug text-pa-earth`}
    >
      {showCancellation && (
        <li>
          <Link href="/legal/cancellation-policy" className={item}>
            <ShieldCheck aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-pa-gold" />
            <span>{t('listingReassurance.cancellation')}</span>
          </Link>
        </li>
      )}
      <li className="hidden lg:block">
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" {...trackAttributes('listing_reassurance', context)} className={item}>
          <MessageCircle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-pa-gold" />
          <span>{t('listingReassurance.whatsapp')}</span>
        </a>
      </li>
    </ul>
  );
}
