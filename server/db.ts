import { eq, desc, asc, and, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  properties, InsertProperty,
  services, InsertService,
  experiences, InsertExperience,
  events, InsertEvent,
  blogAuthors, InsertBlogAuthor,
  blogPosts, InsertBlogPost,
  reviews, InsertReview,
  leads, InsertLead,
  siteSettings, InsertSiteSetting,
  faqs, InsertFaq,
  destinations, InsertDestination,
  customerProfiles, InsertCustomerProfile,
  loyaltyPointsLog, InsertLoyaltyPointsLog,
  referrals, InsertReferral,
  customerTrips, InsertCustomerTrip,
  propertyReferrals, InsertPropertyReferral,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/* ================================================================
   USERS
   ================================================================ */
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/* ================================================================
   PROPERTIES
   ================================================================ */
export async function listProperties(opts?: { activeOnly?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = opts?.activeOnly ? eq(properties.isActive, true) : undefined;
  return db.select().from(properties).where(conditions).orderBy(asc(properties.sortOrder));
}

export async function getPropertyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
  return result[0];
}

export async function getPropertyBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(properties).where(eq(properties.slug, slug)).limit(1);
  return result[0];
}

export async function createProperty(data: InsertProperty) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(properties).values(data);
  return { id: result[0].insertId };
}

export async function updateProperty(id: number, data: Partial<InsertProperty>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(properties).set(data).where(eq(properties.id, id));
}

export async function deleteProperty(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(properties).where(eq(properties.id, id));
}

export async function reorderProperties(items: { id: number; sortOrder: number }[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const item of items) {
    await db.update(properties).set({ sortOrder: item.sortOrder }).where(eq(properties.id, item.id));
  }
}

/* ================================================================
   SERVICES
   ================================================================ */
export async function listServices(opts?: { activeOnly?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = opts?.activeOnly ? eq(services.isActive, true) : undefined;
  return db.select().from(services).where(conditions).orderBy(asc(services.sortOrder));
}

export async function getServiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(services).where(eq(services.id, id)).limit(1);
  return result[0];
}

export async function createService(data: InsertService) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(services).values(data);
  return { id: result[0].insertId };
}

export async function updateService(id: number, data: Partial<InsertService>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(services).set(data).where(eq(services.id, id));
}

export async function deleteService(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(services).where(eq(services.id, id));
}

/* ================================================================
   EXPERIENCES
   ================================================================ */
export async function listExperiences(opts?: { activeOnly?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = opts?.activeOnly ? eq(experiences.isActive, true) : undefined;
  return db.select().from(experiences).where(conditions).orderBy(asc(experiences.sortOrder));
}

export async function getExperienceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(experiences).where(eq(experiences.id, id)).limit(1);
  return result[0];
}

export async function createExperience(data: InsertExperience) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(experiences).values(data);
  return { id: result[0].insertId };
}

export async function updateExperience(id: number, data: Partial<InsertExperience>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(experiences).set(data).where(eq(experiences.id, id));
}

export async function deleteExperience(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(experiences).where(eq(experiences.id, id));
}

/* ================================================================
   EVENTS
   ================================================================ */
export async function listEvents(opts?: { activeOnly?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = opts?.activeOnly ? eq(events.isActive, true) : undefined;
  return db.select().from(events).where(conditions).orderBy(asc(events.sortOrder));
}

export async function getEventById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return result[0];
}

export async function createEvent(data: InsertEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(events).values(data);
  return { id: result[0].insertId };
}

export async function updateEvent(id: number, data: Partial<InsertEvent>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(events).set(data).where(eq(events.id, id));
}

export async function deleteEvent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(events).where(eq(events.id, id));
}

/* ================================================================
   BLOG AUTHORS
   ================================================================ */
export async function listBlogAuthors(opts?: { activeOnly?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = opts?.activeOnly ? eq(blogAuthors.isActive, true) : undefined;
  return db.select().from(blogAuthors).where(conditions).orderBy(asc(blogAuthors.name));
}

export async function getBlogAuthorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(blogAuthors).where(eq(blogAuthors.id, id)).limit(1);
  return result[0];
}

export async function createBlogAuthor(data: InsertBlogAuthor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(blogAuthors).values(data);
  return { id: result[0].insertId };
}

export async function updateBlogAuthor(id: number, data: Partial<InsertBlogAuthor>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(blogAuthors).set(data).where(eq(blogAuthors.id, id));
}

export async function deleteBlogAuthor(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(blogAuthors).where(eq(blogAuthors.id, id));
}

/* ================================================================
   BLOG POSTS
   ================================================================ */
export async function listBlogPosts(opts?: { status?: "draft" | "published" | "scheduled"; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = opts?.status ? eq(blogPosts.status, opts.status) : undefined;
  let query = db.select().from(blogPosts).where(conditions).orderBy(desc(blogPosts.createdAt));
  if (opts?.limit) query = query.limit(opts.limit) as any;
  return query;
}

export async function getBlogPostById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
  return result[0];
}

export async function getBlogPostBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
  return result[0];
}

export async function createBlogPost(data: InsertBlogPost) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(blogPosts).values(data);
  return { id: result[0].insertId };
}

export async function updateBlogPost(id: number, data: Partial<InsertBlogPost>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(blogPosts).set(data).where(eq(blogPosts.id, id));
}

export async function deleteBlogPost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
}

/* ================================================================
   REVIEWS
   ================================================================ */
export async function listReviews(opts?: { activeOnly?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = opts?.activeOnly ? eq(reviews.isActive, true) : undefined;
  return db.select().from(reviews).where(conditions).orderBy(asc(reviews.sortOrder));
}

export async function getReviewById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(reviews).where(eq(reviews.id, id)).limit(1);
  return result[0];
}

export async function createReview(data: InsertReview) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(reviews).values(data);
  return { id: result[0].insertId };
}

export async function updateReview(id: number, data: Partial<InsertReview>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(reviews).set(data).where(eq(reviews.id, id));
}

export async function deleteReview(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(reviews).where(eq(reviews.id, id));
}

/* ================================================================
   LEADS
   ================================================================ */
export async function listLeads(opts?: { source?: string; status?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (opts?.source) conditions.push(like(leads.source, `${opts.source}%`));
  if (opts?.status) conditions.push(eq(leads.status, opts.status as any));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db.select().from(leads).where(where).orderBy(desc(leads.createdAt));
}

export async function createLead(data: InsertLead) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(leads).values(data);
  return { id: result[0].insertId };
}

export async function updateLead(id: number, data: Partial<InsertLead>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(leads).set(data).where(eq(leads.id, id));
}

export async function deleteLead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(leads).where(eq(leads.id, id));
}

export async function getLeadStats() {
  const db = await getDb();
  if (!db) return { total: 0, newsletter: 0, contact: 0, newLeads: 0 };
  const [total] = await db.select({ count: sql<number>`count(*)` }).from(leads);
  const [newsletter] = await db.select({ count: sql<number>`count(*)` }).from(leads).where(like(leads.source, "newsletter%"));
  const [contact] = await db.select({ count: sql<number>`count(*)` }).from(leads).where(like(leads.source, "contact%"));
  const [newLeads] = await db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.status, "new"));
  return { total: total.count, newsletter: newsletter.count, contact: contact.count, newLeads: newLeads.count };
}

/* ================================================================
   SITE SETTINGS
   ================================================================ */
export async function listSettings(category?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = category ? eq(siteSettings.category, category) : undefined;
  return db.select().from(siteSettings).where(conditions);
}

export async function getSetting(key: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(siteSettings).where(eq(siteSettings.settingKey, key)).limit(1);
  return result[0]?.settingValue;
}

export async function upsertSetting(key: string, value: string, category?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(siteSettings).values({ settingKey: key, settingValue: value, category })
    .onDuplicateKeyUpdate({ set: { settingValue: value, category } });
}

/* ================================================================
   FAQS
   ================================================================ */
export async function listFaqs(opts?: { activeOnly?: boolean; category?: string }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (opts?.activeOnly) conditions.push(eq(faqs.isActive, true));
  if (opts?.category) conditions.push(eq(faqs.category, opts.category));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db.select().from(faqs).where(where).orderBy(asc(faqs.sortOrder));
}

export async function createFaq(data: InsertFaq) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(faqs).values(data);
  return { id: result[0].insertId };
}

export async function updateFaq(id: number, data: Partial<InsertFaq>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(faqs).set(data).where(eq(faqs.id, id));
}

export async function deleteFaq(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(faqs).where(eq(faqs.id, id));
}

/* ================================================================
   DESTINATIONS
   ================================================================ */
export async function listDestinations(opts?: { activeOnly?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = opts?.activeOnly ? eq(destinations.isActive, true) : undefined;
  return db.select().from(destinations).where(conditions).orderBy(asc(destinations.sortOrder));
}

export async function getDestinationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(destinations).where(eq(destinations.id, id)).limit(1);
  return result[0];
}

export async function getDestinationBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(destinations).where(eq(destinations.slug, slug)).limit(1);
  return result[0];
}

export async function createDestination(data: InsertDestination) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(destinations).values(data);
  return { id: result[0].insertId };
}

export async function updateDestination(id: number, data: Partial<InsertDestination>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(destinations).set(data).where(eq(destinations.id, id));
}

export async function deleteDestination(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(destinations).where(eq(destinations.id, id));
}

/* ================================================================
   ADMIN DASHBOARD STATS
   ================================================================ */
export async function getAdminStats() {
  const db = await getDb();
  if (!db) return { properties: 0, destinations: 0, services: 0, experiences: 0, events: 0, blogPosts: 0, reviews: 0, leads: 0, faqs: 0 };
  const [p] = await db.select({ count: sql<number>`count(*)` }).from(properties);
  const [d] = await db.select({ count: sql<number>`count(*)` }).from(destinations);
  const [s] = await db.select({ count: sql<number>`count(*)` }).from(services);
  const [e] = await db.select({ count: sql<number>`count(*)` }).from(experiences);
  const [ev] = await db.select({ count: sql<number>`count(*)` }).from(events);
  const [bp] = await db.select({ count: sql<number>`count(*)` }).from(blogPosts);
  const [r] = await db.select({ count: sql<number>`count(*)` }).from(reviews);
  const [l] = await db.select({ count: sql<number>`count(*)` }).from(leads);
  const [f] = await db.select({ count: sql<number>`count(*)` }).from(faqs);
  return { properties: p.count, destinations: d.count, services: s.count, experiences: e.count, events: ev.count, blogPosts: bp.count, reviews: r.count, leads: l.count, faqs: f.count };
}

/* ================================================================
   CUSTOMER PROFILES
   ================================================================ */
export async function upsertCustomerProfile(data: { openId: string; googleId?: string; avatar?: string | null }) {
  const db = await getDb();
  if (!db) return;
  const user = await getUserByOpenId(data.openId);
  if (!user) return;

  const existing = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, user.id)).limit(1);
  if (existing.length > 0) {
    const updateSet: Record<string, unknown> = {};
    if (data.googleId) updateSet.googleId = data.googleId;
    if (data.avatar !== undefined) updateSet.avatar = data.avatar;
    if (Object.keys(updateSet).length > 0) {
      await db.update(customerProfiles).set(updateSet).where(eq(customerProfiles.userId, user.id));
    }
  } else {
    const code = generateReferralCode();
    await db.insert(customerProfiles).values({
      userId: user.id,
      googleId: data.googleId || null,
      avatar: data.avatar || null,
      referralCode: code,
      loyaltyPoints: 100,
    });
    await db.insert(loyaltyPointsLog).values({
      userId: user.id,
      points: 100,
      type: "welcome",
      description: "Welcome bonus",
    });
  }
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "PA-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function getCustomerProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, userId)).limit(1);
  return result[0];
}

export async function updateCustomerProfile(userId: number, data: Partial<InsertCustomerProfile>) {
  const db = await getDb();
  if (!db) return;
  await db.update(customerProfiles).set(data).where(eq(customerProfiles.userId, userId));
}

/* ================================================================
   LOYALTY POINTS
   ================================================================ */
export async function getPointsLog(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(loyaltyPointsLog).where(eq(loyaltyPointsLog.userId, userId)).orderBy(desc(loyaltyPointsLog.createdAt));
}

export async function addPoints(userId: number, points: number, type: "booking" | "referral" | "bonus" | "redemption" | "welcome", description: string, referenceId?: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(loyaltyPointsLog).values({ userId, points, type, description, referenceId });
  await db.update(customerProfiles).set({
    loyaltyPoints: sql`loyalty_points + ${points}`,
  }).where(eq(customerProfiles.userId, userId));
}

/* ================================================================
   REFERRALS
   ================================================================ */
export async function listReferrals(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(referrals).where(eq(referrals.referrerId, userId)).orderBy(desc(referrals.createdAt));
}

export async function createReferral(data: InsertReferral) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(referrals).values(data);
  return { id: result[0].insertId };
}

export async function getProfileByReferralCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customerProfiles).where(eq(customerProfiles.referralCode, code)).limit(1);
  return result[0];
}

/* ================================================================
   CUSTOMER TRIPS
   ================================================================ */
export async function listCustomerTrips(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customerTrips).where(eq(customerTrips.userId, userId)).orderBy(desc(customerTrips.createdAt));
}

export async function createCustomerTrip(data: InsertCustomerTrip) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(customerTrips).values(data);
  return { id: result[0].insertId };
}

/* ================================================================
   ADMIN: CUSTOMER OVERVIEW
   ================================================================ */
export async function listAllCustomers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: customerProfiles.id,
      userId: customerProfiles.userId,
      googleId: customerProfiles.googleId,
      avatar: customerProfiles.avatar,
      phone: customerProfiles.phone,
      nationality: customerProfiles.nationality,
      referralCode: customerProfiles.referralCode,
      loyaltyPoints: customerProfiles.loyaltyPoints,
      loyaltyTier: customerProfiles.loyaltyTier,
      totalStays: customerProfiles.totalStays,
      totalNights: customerProfiles.totalNights,
      createdAt: customerProfiles.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(customerProfiles)
    .innerJoin(users, eq(users.id, customerProfiles.userId))
    .orderBy(desc(customerProfiles.createdAt));
}

export async function listAllReferrals() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(referrals).orderBy(desc(referrals.createdAt));
}

export async function listAllTrips() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customerTrips).orderBy(desc(customerTrips.createdAt));
}

/* ================================================================
   PROPERTY REFERRALS
   ================================================================ */
export async function listPropertyReferrals(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(propertyReferrals).where(eq(propertyReferrals.referrerId, userId)).orderBy(desc(propertyReferrals.createdAt));
}

export async function createPropertyReferral(data: InsertPropertyReferral) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(propertyReferrals).values(data);
  return { id: result[0].insertId };
}

export async function listAllPropertyReferrals() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: propertyReferrals.id,
      referrerId: propertyReferrals.referrerId,
      ownerName: propertyReferrals.ownerName,
      ownerEmail: propertyReferrals.ownerEmail,
      ownerPhone: propertyReferrals.ownerPhone,
      propertyAddress: propertyReferrals.propertyAddress,
      propertyCity: propertyReferrals.propertyCity,
      propertyRegion: propertyReferrals.propertyRegion,
      propertyBedrooms: propertyReferrals.propertyBedrooms,
      propertyType: propertyReferrals.propertyType,
      propertyDescription: propertyReferrals.propertyDescription,
      notes: propertyReferrals.notes,
      tier: propertyReferrals.tier,
      status: propertyReferrals.status,
      rewardAmount: propertyReferrals.rewardAmount,
      rewardPaid: propertyReferrals.rewardPaid,
      adminNotes: propertyReferrals.adminNotes,
      createdAt: propertyReferrals.createdAt,
      updatedAt: propertyReferrals.updatedAt,
      referrerName: users.name,
      referrerEmail: users.email,
    })
    .from(propertyReferrals)
    .innerJoin(users, eq(users.id, propertyReferrals.referrerId))
    .orderBy(desc(propertyReferrals.createdAt));
}

export async function updatePropertyReferral(id: number, data: Partial<InsertPropertyReferral & { adminNotes: string }>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(propertyReferrals).set(data).where(eq(propertyReferrals.id, id));
}

/* ================================================================
   FILE UPLOAD HELPER
   ================================================================ */
export async function uploadFile(fileBuffer: Buffer, fileName: string, contentType: string) {
  const { storagePut } = await import("./storage");
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const key = `uploads/${fileName}-${randomSuffix}`;
  return storagePut(key, fileBuffer, contentType);
}
