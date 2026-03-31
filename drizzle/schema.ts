import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

/* ================================================================
   USERS — Core auth table (provided by template)
   ================================================================ */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/* ================================================================
   PROPERTIES — Homes in the portfolio
   ================================================================ */
export const properties = mysqlTable("properties", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  tagline: varchar("tagline", { length: 500 }),
  description: text("description"),
  destination: varchar("destination", { length: 100 }).notNull(), // minho, porto, algarve
  region: varchar("region", { length: 255 }),
  locality: varchar("locality", { length: 255 }),
  bedrooms: int("bedrooms").default(0).notNull(),
  bathrooms: int("bathrooms").default(0).notNull(),
  maxGuests: int("maxGuests").default(0).notNull(),
  priceFrom: int("priceFrom").default(0).notNull(), // cents or whole euros
  currency: varchar("currency", { length: 10 }).default("EUR"),
  style: varchar("style", { length: 100 }),
  tier: mysqlEnum("tier", ["standard", "signature", "ultra"]).default("standard").notNull(),
  tags: json("tags").$type<string[]>().default([]),
  occasions: json("occasions").$type<string[]>().default([]),
  images: json("images").$type<string[]>().default([]),
  amenities: json("amenities").$type<Record<string,string[]>>().default({}),
  stayIncludes: json("stayIncludes").$type<string[]>().default([]),
  bookingUrl: varchar("bookingUrl", { length: 500 }),
  whatsappMessage: varchar("whatsappMessage", { length: 500 }),
  seoTitle: varchar("seoTitle", { length: 255 }),
  seoDescription: varchar("seoDescription", { length: 500 }),
  guestyUrl: varchar("guestyUrl", { length: 500 }),
  guestyId: varchar("guestyId", { length: 64 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  isFeatured: boolean("isFeatured").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Property = typeof properties.$inferSelect;
export type InsertProperty = typeof properties.$inferInsert;

/* ================================================================
   SERVICES — Concierge services (chef, spa, transfers, etc.)
   ================================================================ */
export const services = mysqlTable("services", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  tagline: varchar("tagline", { length: 500 }),
  description: text("description"),
  category: varchar("category", { length: 100 }), // gastronomy, wellness, mobility, etc.
  icon: varchar("icon", { length: 100 }),
  image: varchar("image", { length: 500 }),
  images: json("images").$type<string[]>().default([]),
  details: json("details").$type<string[]>().default([]),
  price: varchar("price", { length: 100 }),
  duration: varchar("duration", { length: 100 }),
  availability: varchar("availability", { length: 255 }),
  whatsappMessage: varchar("whatsappMessage", { length: 500 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Service = typeof services.$inferSelect;
export type InsertService = typeof services.$inferInsert;

/* ================================================================
   EXPERIENCES — Bookable experiences / adventures
   ================================================================ */
export const experiences = mysqlTable("experiences", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  tagline: varchar("tagline", { length: 500 }),
  shortDescription: varchar("shortDescription", { length: 500 }),
  category: varchar("category", { length: 100 }), // adventure, culture, gastronomy, wellness
  destination: varchar("destination", { length: 100 }),
  duration: varchar("duration", { length: 100 }), // "2 hours", "Half day", etc.
  priceFrom: int("priceFrom").default(0),
  priceSuffix: varchar("priceSuffix", { length: 100 }),
  image: varchar("image", { length: 500 }),
  images: json("images").$type<string[]>().default([]),
  gallery: json("gallery").$type<string[]>().default([]),
  whatsappMessage: varchar("whatsappMessage", { length: 500 }),
  destinations: json("destinations").$type<string[]>().default([]),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Experience = typeof experiences.$inferSelect;
export type InsertExperience = typeof experiences.$inferInsert;

/* ================================================================
   EVENTS — Weddings, retreats, corporate events
   ================================================================ */
export const events = mysqlTable("events", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  shortDescription: varchar("shortDescription", { length: 500 }),
  eventType: varchar("eventType", { length: 100 }), // wedding, corporate, retreat, celebration
  coverImage: varchar("coverImage", { length: 500 }),
  images: json("images").$type<string[]>().default([]),
  capacity: varchar("capacity", { length: 100 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;

/* ================================================================
   BLOG AUTHORS — Writers (internal team + external contributors)
   ================================================================ */
export const blogAuthors = mysqlTable("blog_authors", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  bio: text("bio"),
  avatar: varchar("avatar", { length: 500 }),
  role: varchar("role", { length: 100 }), // "Editor", "Guest Writer", "Concierge Team"
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BlogAuthor = typeof blogAuthors.$inferSelect;
export type InsertBlogAuthor = typeof blogAuthors.$inferInsert;

/* ================================================================
   BLOG POSTS — Journal articles
   ================================================================ */
export const blogPosts = mysqlTable("blog_posts", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  slug: varchar("slug", { length: 500 }).notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content"), // HTML from rich text editor
  coverImage: varchar("coverImage", { length: 500 }),
  authorId: int("authorId"),
  category: varchar("category", { length: 100 }), // travel, food, wellness, culture, homes
  tags: json("tags").$type<string[]>().default([]),
  seoTitle: varchar("seoTitle", { length: 255 }),
  seoDescription: varchar("seoDescription", { length: 500 }),
  status: mysqlEnum("status", ["draft", "published", "scheduled"]).default("draft").notNull(),
  publishedAt: timestamp("publishedAt"),
  scheduledAt: timestamp("scheduledAt"),
  readTime: int("readTime"), // estimated minutes
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = typeof blogPosts.$inferInsert;

/* ================================================================
   REVIEWS — Guest testimonials
   ================================================================ */
export const reviews = mysqlTable("reviews", {
  id: int("id").autoincrement().primaryKey(),
  guestName: varchar("guestName", { length: 255 }).notNull(),
  guestCountry: varchar("guestCountry", { length: 255 }),
  guestLocation: varchar("guestLocation", { length: 255 }),
  source: varchar("source", { length: 100 }),
  date: varchar("date", { length: 20 }),
  propertyName: varchar("propertyName", { length: 255 }),
  quote: text("quote").notNull(),
  rating: int("rating").default(5),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Review = typeof reviews.$inferSelect;
export type InsertReview = typeof reviews.$inferInsert;

/* ================================================================
   LEADS — Newsletter subscriptions + contact form submissions
   ================================================================ */
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  message: text("message"),
  source: varchar("source", { length: 100 }).notNull(), // "newsletter", "contact", "owners", "booking"
  status: mysqlEnum("status", ["new", "contacted", "converted", "archived"]).default("new").notNull(),
  metadata: json("metadata").$type<Record<string, string>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

/* ================================================================
   SITE SETTINGS — Key-value config store
   ================================================================ */
export const siteSettings = mysqlTable("site_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 255 }).notNull().unique(),
  settingValue: text("settingValue"),
  category: varchar("category", { length: 100 }), // "general", "seo", "social", "contact"
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = typeof siteSettings.$inferInsert;

/* ================================================================
   FAQ — Frequently asked questions
   ================================================================ */
export const faqs = mysqlTable("faqs", {
  id: int("id").autoincrement().primaryKey(),
  question: varchar("question", { length: 500 }).notNull(),
  answer: text("answer").notNull(),
  category: varchar("category", { length: 100 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Faq = typeof faqs.$inferSelect;
export type InsertFaq = typeof faqs.$inferInsert;

/* ================================================================
   DESTINATIONS — Regions / areas where PA operates
   ================================================================ */
export const destinations = mysqlTable("destinations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  tagline: varchar("tagline", { length: 500 }),
  description: text("description"),
  whyDescription: text("whyDescription"),
  whyOverline: varchar("whyOverline", { length: 255 }),
  coverImage: varchar("coverImage", { length: 500 }),
  gallery: json("gallery").$type<string[]>().default([]),
  highlights: json("highlights").$type<string[]>().default([]),
  howToGetHere: text("howToGetHere"),
  bestTimeToVisit: text("bestTimeToVisit"),
  whatToExpect: text("whatToExpect"),
  insiderRecommendations: json("insiderRecommendations").$type<Array<{name:string;category:string;description:string}>>().default([]),
  propertyCount: int("propertyCount").default(0),
  comingSoon: boolean("comingSoon").default(false).notNull(),
  seoTitle: varchar("seoTitle", { length: 255 }),
  seoDescription: varchar("seoDescription", { length: 500 }),
  status: varchar("status", { length: 50 }).default("active"),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Destination = typeof destinations.$inferSelect;
export type InsertDestination = typeof destinations.$inferInsert;

/* ================================================================
   CUSTOMER PROFILES — Extended data for guest/customer accounts
   ================================================================ */
export const customerProfiles = mysqlTable("customer_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  googleId: varchar("googleId", { length: 255 }).unique(),
  avatar: varchar("avatar", { length: 500 }),
  phone: varchar("phone", { length: 50 }),
  nationality: varchar("nationality", { length: 100 }),
  referralCode: varchar("referralCode", { length: 20 }).unique(),
  referredByCode: varchar("referredByCode", { length: 20 }),
  loyaltyPoints: int("loyaltyPoints").default(0).notNull(),
  loyaltyTier: mysqlEnum("loyaltyTier", ["bronze", "silver", "gold", "platinum"]).default("bronze").notNull(),
  totalStays: int("totalStays").default(0).notNull(),
  totalNights: int("totalNights").default(0).notNull(),
  preferences: text("preferences"), // JSON string storing guest preferences (Returning Guest Programme)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomerProfile = typeof customerProfiles.$inferSelect;
export type InsertCustomerProfile = typeof customerProfiles.$inferInsert;

/* ================================================================
   LOYALTY POINTS LOG — Point transactions
   ================================================================ */
export const loyaltyPointsLog = mysqlTable("loyalty_points_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  points: int("points").notNull(),
  type: mysqlEnum("type", ["booking", "referral", "bonus", "redemption", "welcome"]).notNull(),
  description: varchar("description", { length: 500 }),
  referenceId: varchar("referenceId", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LoyaltyPointsLog = typeof loyaltyPointsLog.$inferSelect;
export type InsertLoyaltyPointsLog = typeof loyaltyPointsLog.$inferInsert;

/* ================================================================
   REFERRALS — Referral tracking
   ================================================================ */
export const referrals = mysqlTable("referrals", {
  id: int("id").autoincrement().primaryKey(),
  referrerId: int("referrerId").notNull(),
  referredEmail: varchar("referredEmail", { length: 320 }).notNull(),
  referredUserId: int("referredUserId"),
  status: mysqlEnum("status", ["pending", "signed_up", "booked", "completed"]).default("pending").notNull(),
  pointsAwarded: int("pointsAwarded").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;

/* ================================================================
   CUSTOMER TRIPS — Booking / trip history
   ================================================================ */
export const customerTrips = mysqlTable("customer_trips", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  propertyId: int("propertyId"),
  propertyName: varchar("propertyName", { length: 255 }).notNull(),
  propertyImage: varchar("propertyImage", { length: 500 }),
  destination: varchar("destination", { length: 100 }),
  checkIn: varchar("checkIn", { length: 20 }).notNull(),
  checkOut: varchar("checkOut", { length: 20 }).notNull(),
  guests: int("guests").default(2).notNull(),
  nights: int("nights").default(1).notNull(),
  totalPrice: int("totalPrice").default(0),
  currency: varchar("currency", { length: 10 }).default("EUR"),
  status: mysqlEnum("status", ["upcoming", "active", "completed", "cancelled"]).default("upcoming").notNull(),
  confirmationCode: varchar("confirmationCode", { length: 100 }),
  guestyReservationId: varchar("guestyReservationId", { length: 100 }),
  pointsEarned: int("pointsEarned").default(0).notNull(),
  rating: int("rating"),
  reviewText: text("reviewText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomerTrip = typeof customerTrips.$inferSelect;
export type InsertCustomerTrip = typeof customerTrips.$inferInsert;

/* ================================================================
   PROPERTY REFERRALS — Refer a property to Portugal Active portfolio
   Select tier = 500 EUR reward · Luxury tier = 1000 EUR reward
   ================================================================ */
export const propertyReferrals = mysqlTable("property_referrals", {
  id: int("id").autoincrement().primaryKey(),
  referrerId: int("referrerId").notNull(),
  ownerName: varchar("ownerName", { length: 255 }).notNull(),
  ownerEmail: varchar("ownerEmail", { length: 320 }),
  ownerPhone: varchar("ownerPhone", { length: 50 }),
  propertyAddress: varchar("propertyAddress", { length: 500 }),
  propertyCity: varchar("propertyCity", { length: 100 }),
  propertyRegion: varchar("propertyRegion", { length: 100 }),
  propertyBedrooms: int("propertyBedrooms"),
  propertyType: varchar("propertyType", { length: 100 }),
  propertyDescription: text("propertyDescription"),
  notes: text("notes"),
  tier: mysqlEnum("tier", ["select", "luxury"]),
  status: mysqlEnum("status", ["submitted", "contacted", "under_review", "signed", "rejected"])
    .default("submitted")
    .notNull(),
  rewardAmount: int("rewardAmount").default(0).notNull(),
  rewardPaid: boolean("rewardPaid").default(false).notNull(),
  adminNotes: text("adminNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PropertyReferral = typeof propertyReferrals.$inferSelect;
export type InsertPropertyReferral = typeof propertyReferrals.$inferInsert;
