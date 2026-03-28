/* ==========================================================================
   PORTUGAL ACTIVE â V1.6 TYPE DEFINITIONS
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
export type SortOption = 'recommended' | 'price-asc' | 'price-desc' | 'newest';
