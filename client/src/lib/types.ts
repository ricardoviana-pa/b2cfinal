/* ==========================================================================
   PORTUGAL ACTIVE — V1.6 TYPE DEFINITIONS
   Redesign: 6 destinations, itinerary system, events, editorial luxury
   ========================================================================== */

// --- DESTINATIONS ---
export type DestinationSlug = 'minho' | 'porto' | 'lisbon' | 'alentejo' | 'algarve' | 'brazil';

export interface Destination {
  id: string;
  slug: DestinationSlug;
  name: string;
  tagline: string;
  description: string;        // Short editorial description for cards
  coverImage: string;
  gallery: string[];
  whyDescription: string;     // Rich editorial text for detail page
  highlights: string[];       // 3-5 bullets: what makes this region special
  propertyCount: number;
  comingSoon: boolean;
  howToGetHere?: string;
  bestTimeToVisit?: string;
  whatToExpect?: string;
  insiderRecommendations?: { name: string; category: string; description: string }[];
  seoTitle: string;
  seoDescription: string;
  status: 'active' | 'draft';
}

// --- PROPERTY ---
export type PropertyTier = 'signature' | 'select' | 'new';

export interface Property {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  tier: PropertyTier;
  destination: DestinationSlug;
  locality: string;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  priceFrom: number;
  currency: string;
  style: string;
  tags: string[];
  occasions: string[];
  images: string[];
  description: string;
  stayIncludes: string[];     // "Your stay includes" bullets
  amenities: Record<string, string[]>;
  bookingUrl: string;
  whatsappMessage: string;
  guestyId?: string;
  pricePerNight?: number;
  cleaningFee?: number;
  minNights?: number;
  eventCapacity?: number;     // For events venue showcase
  sortOrder: number;
  isActive: boolean;
  seoTitle: string;
  seoDescription: string;
  address?: {
    full?: string;
    street?: string;
    city?: string;
    state?: string;
    zipcode?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  rooms?: Array<{
    name: string;
    beds: Array<{ type: string; quantity: number }>;
  }>;
  propertyType?: string;
  checkInTime?: string;
  checkOutTime?: string;
  areaSquareFeet?: number | null;
  reviews?: Array<{
    rating: number;
    text: string;
    guestName: string;
    date: string;
    categories?: Array<{ name: string; score: number }>;
  }>;
  averageRating?: number | null;
  reviewCount?: number;
}

// --- PRODUCTS: SERVICES + ADVENTURES ---
export type ProductType = 'service' | 'adventure';

export interface Product {
  guestyId?: string;
  id: string;
  slug: string;
  name: string;
  type: ProductType;
  tagline: string;
  description: string;
  image: string;
  gallery: string[];          // 3 placeholder images for lightbox
  videoUrl?: string;          // Vimeo/YouTube video for this experience
  priceFrom?: number;
  priceSuffix?: string;
  duration?: string;
  difficulty?: string;
  groupSize?: string;
  minAge?: number;
  destinations: DestinationSlug[];
  whatsappMessage: string;
  isActive: boolean;
  sortOrder: number;

  // --- Experience PDP extended fields (Sprint 1 redesign, GYG/Viator-inspired)
  // All optional so concierge services (services.json) stay compatible.
  highlights?: string[];
  aboutParagraphs?: string[];
  included?: string[];
  notIncluded?: string[];
  notSuitableFor?: string[];
  whatToBring?: string[];
  notAllowed?: string[];
  itinerary?: ExperienceItineraryStep[];
  meetingPoint?: ExperienceMeetingPoint;
  cancellationPolicy?: string;
  languages?: string[];
  groupSizeRange?: ExperienceGroupSize;
  maxWeightKg?: number;
  instantConfirmation?: boolean;
  freeCancellationHours?: number;
  reserveNowPayLater?: boolean;
  mobileTicket?: boolean;
  pickupIncluded?: boolean;
  faq?: ExperienceFaq[];
  reviewsList?: ExperienceReview[];
  aggregateRating?: ExperienceAggregateRating;
  bokunProductId?: string;
  experienceCategory?: ExperienceCategory;
}

// --- ITINERARY SYSTEM ---
export interface ItineraryFieldValue {
  [key: string]: string | number | boolean | string[];
}

export interface ItineraryItem {
  id: string;
  product: Product;
  fields: ItineraryFieldValue;
  estimatedPrice?: number;
  addedAt: string;
}

export interface ItinerarySubmission {
  guestName: string;
  guestEmail: string;
  property: string;           // Property name or "Not yet booked"
  items: ItineraryItem[];
  generalNotes: string;
  estimatedTotal: number;
}

// --- EVENTS ---
export interface EventType {
  id: string;
  name: string;
  description: string;
  image: string;
}

// --- TEAM ---
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  mission: string;
  photo: string;
}

// --- BLOG ---
export type BlogCategory = 'destinations' | 'lifestyle' | 'portugal-active' | 'video' | 'people' | 'guides';

export interface BlogAuthor {
  id: string;
  name: string;
  photo: string;
  bio: string;
  role: string;
}

export interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  category: BlogCategory;
  destinationTag?: string;
  author: BlogAuthor;
  featuredImage: string;
  coverImage?: string;
  videoId?: string;
  vimeoId?: string;
  content: string;
  excerpt: string;
  publishDate: string;
  status: 'draft' | 'published' | 'scheduled';
  isFeatured: boolean;
  tags?: string[];
  seoTitle: string;
  seoDescription: string;
  readTime: number;
}

// --- FILTERS ---
export type FilterDestination = 'all' | DestinationSlug;
export type FilterLocation = 'all' | string;
export type SortOption = 'recommended' | 'price-asc' | 'price-desc' | 'newest';

// ==========================================================================
// EXPERIENCE PDP TYPES (Sprint 1 redesign — GYG/Viator-inspired)
// ==========================================================================

export interface ExperienceItineraryStep {
  stepNumber: number;
  time?: string;
  title: string;
  description: string;
  icon?: 'pickup' | 'hike' | 'swim' | 'dine' | 'ride' | 'rappel' | 'sail' | 'cycle' | 'photo' | 'brief';
}

export interface ExperienceMeetingPoint {
  address: string;
  lat?: number;
  lng?: number;
  instructions: string;
  googleMapsUrl: string;
  pickupAvailable?: boolean;
  pickupNote?: string;
}

export interface ExperienceFaq {
  q: string;
  a: string;
}

export interface ExperienceGroupSize {
  min: number;
  max: number;
}

export interface ExperienceReview {
  author: string;
  countryCode?: string;
  rating: number;
  date: string;
  text: string;
  source: 'tripadvisor' | 'viator' | 'gyg' | 'direct';
  verified: boolean;
  hostResponse?: string;
}

export interface ExperienceAggregateRating {
  value: number;
  count: number;
  source: string;
  rank?: string;
  bestRating?: number;
  ratingBreakdown?: Record<string, number>;
  categoryRatings?: Record<string, number>;
  recommendedPercent?: number;
}

export type ExperienceCategory = 'adventure' | 'gastronomy' | 'wellness' | 'mobility' | 'concierge';
