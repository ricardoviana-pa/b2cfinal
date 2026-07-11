/* ==========================================================================
   PORTUGAL ACTIVE — V1.6 TYPE DEFINITIONS
   Redesign: 6 destinations, itinerary system, events, editorial luxury
   ========================================================================== */

// --- DESTINATIONS ---
// Region slugs (broad areas, kept for back-compat with existing property data).
export type DestinationRegion = 'minho' | 'porto' | 'lisbon' | 'alentejo' | 'algarve' | 'brazil';

// Destination slugs: region-level + city-level spokes per the destinations
// strategy doc (May 2026, hub-and-spoke editorial). City spokes use flat URLs
// (/destinations/viana-do-castelo) per the doc's URL scheme; the region they
// belong to is captured in the `region` field for hub grouping and
// "related destinations" linking.
export type DestinationSlug =
  | DestinationRegion
  | 'douro'
  | 'viana-do-castelo'
  | 'caminha'
  | 'esposende';

/* ── 11-section template (per destinations strategy doc) ─────────────────
   Every spoke fills the same shape; missing sections render nothing so the
   pilot (Viana) shows everything while scaffolded spokes show only what
   has been written. */

export interface DestinationFAQ {
  question: string;
  answer: string;
}

/* ── Seasons (object form, per Viana pilot Cowork editorial 2026-05) ───
   Named keys make it natural to render a "Best for first-time visitors"
   tag separately from the four standard seasons, and let translation
   workflows key off a stable identifier rather than a localized label. */
export interface DestinationSeasons {
  spring?: string;
  summer?: string;
  autumn?: string;
  winter?: string;
  /** Free-form recommendation paragraph rendered after the four seasons. */
  bestForFirstTime?: string;
}

/* ── Transport (object form) ──────────────────────────────────────────
   Named keys map cleanly to the lucide icons in HowToGetHere and survive
   reordering without breaking the iconography. `gettingAround` is the
   in-destination block (cycling, parking, ride-hail). */
export interface DestinationTransport {
  byAir?: string;
  byTrain?: string;
  byCar?: string;
  fromSpain?: string;
  gettingAround?: string;
}

export interface DestinationCuration {
  name: string;
  /** Free-form category tag — "Restaurant", "Wine", "Hike", "Surf", etc.
   *  Optional so editorial entries (experiences, specialties) don't need
   *  a fixed taxonomy. */
  category?: string;
  description: string;
}

export interface DestinationExperience {
  name: string;
  description: string;
  /** "Half day", "2-3 hours", "Evening", etc. */
  duration?: string;
  /** Season window — "Year-round", "April through October", etc. */
  season?: string;
}

export interface DestinationEvent {
  name: string;
  /** Free-form date label, e.g. "15-23 August 2026". */
  dates: string;
  description: string;
  /** Optional outbound URL for the official event page. */
  url?: string;
}

export interface DestinationThingsToDoGroup {
  /** Subsection heading, e.g. "The historic centre". */
  heading: string;
  items: DestinationCuration[];
}

export interface DestinationPressQuote {
  /** Publication name, e.g. "Condé Nast Traveler" */
  source: string;
  /** Quote text. */
  quote: string;
  /** Optional year for context, e.g. 2024. */
  year?: number;
  /** Optional outbound URL for backlink credit. */
  url?: string;
}

export interface DestinationAccolade {
  text: string;
  source: string;
  /** Optional secondary note, e.g. "First Portuguese city ranked in the global top three". */
  note?: string;
}

export interface Destination {
  id: string;
  slug: DestinationSlug;
  name: string;
  /** Broad region this destination belongs to (for hub grouping + related). */
  region: DestinationRegion;
  /** Geographic coordinates — used for schema.org GeoCoordinates. */
  geo?: { latitude: number; longitude: number };
  tagline: string;
  description: string;        // Short editorial description for cards
  coverImage: string;
  gallery: string[];
  whyDescription: string;     // Section 2: editorial "why this place"
  highlights: string[];       // 3-5 bullets: what makes this region special
  propertyCount: number;
  comingSoon: boolean;
  /** Hero pull-quote — editorial quote rendered with the hero. */
  pullQuote?: { text: string; source: string; year?: number };
  /** Primary award/accolade — rendered as the hero badge when present. */
  primaryAccolade?: DestinationAccolade;
  /** Section 1: editorial hero subtitle (one-line poetic positioning). */
  heroSubtitle?: string;
  howToGetHere?: string;
  bestTimeToVisit?: string;
  whatToExpect?: string;
  insiderRecommendations?: DestinationCuration[];
  /** Section 3: editorial intro paragraph for "Where to stay". */
  whereToStayIntro?: string;
  /** Section 4: override the default journal heading. */
  journalSectionTitle?: string;
  /** Section 5: editorial intro paragraph for "What to see and do". */
  thingsToDoIntro?: string;
  /** Section 5: "What to see and do" — curated groups (10–15 items total). */
  thingsToDo?: DestinationThingsToDoGroup[];
  /** Section 6: seasonality, premium editorial. Object-keyed for stable
   *  per-locale translation. */
  seasons?: DestinationSeasons;
  /** Section 7: detailed transport options (per medium). Object-keyed. */
  transport?: DestinationTransport;
  /** Section 8: editorial intro paragraph for "Eat, drink, experience". */
  eatDrinkIntro?: string;
  /** Section 8: curated restaurants. */
  restaurants?: DestinationCuration[];
  /** Section 8: regional specialties (dishes, wines, products). */
  specialties?: DestinationCuration[];
  /** Section 8: editorial intro paragraph for the experiences list. */
  experiencesIntro?: string;
  /** Section 8: curated experiences (kayak, surf lessons, tastings). */
  experiences?: DestinationExperience[];
  /** Section 9 (new): editorial intro for the events block. */
  eventsIntro?: string;
  /** Section 9 (new): events worth planning around. */
  events?: DestinationEvent[];
  /** Section 10: editorial intro paragraph for press recognition. */
  pressIntro?: string;
  /** Section 10: press recognition for backlinks + trust. */
  pressQuotes?: DestinationPressQuote[];
  /** Section 11: FAQ — emitted as FAQPage schema for rich snippets. */
  faqs?: DestinationFAQ[];
  /** Section 12: sibling slugs to surface as "continue exploring".
   *  Preferred name `relatedDestinations`; `relatedSlugs` kept as alias
   *  for back-compat with the pre-pilot data. */
  relatedDestinations?: DestinationSlug[];
  /** @deprecated use `relatedDestinations`. */
  relatedSlugs?: DestinationSlug[];
  /** Section 12: optional override for the owners CTA copy. */
  ownersCTA?: { headline: string; body: string; cta: string; url?: string };
  seoTitle: string;
  seoDescription: string;
  status: 'active' | 'draft';
  whyOverline?: string;
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
  isPortfolio?: boolean;       // Portfolio-only property — display but no bookings
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
