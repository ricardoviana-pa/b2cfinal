import { isPartnerHome } from '@shared/partnerHome';

interface CampaignListing {
  guestyId?: string | null;
  source?: string | null;
  isActive?: boolean;
  isPortfolio?: boolean;
  bookingMode?: string | null;
}

/** All own direct-booking homes participate (confirmed 24 Nov 2026).
 * The public catalogue already excludes hidden listings. This is an
 * announcement only; Guesty still validates the manually entered coupon. */
export function isBlackFridayListingEligible(property: CampaignListing | null | undefined): boolean {
  return !!property
    && typeof property.guestyId === 'string' && property.guestyId.trim().length > 0
    && property.isActive !== false
    && !property.isPortfolio
    && !isPartnerHome(property)
    && property.bookingMode !== 'request';
}
