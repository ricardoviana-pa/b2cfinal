import { isPreviewDeployment } from "./lib/preview-isolation";
import { ne, eq, desc, asc, and, or, like, sql, inArray, isNotNull, isNull, gt, lt } from "drizzle-orm";
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
  bookingIntents, InsertBookingIntent, BookingIntent,
  checkoutScheduledPayments, CheckoutScheduledPayment, InsertCheckoutScheduledPayment,
  checkoutCardMandates, InsertCheckoutCardMandate,
  stripeWebhookEvents,
  webVitals, InsertWebVital,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (isPreviewDeployment()) return null;
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

export async function getServiceBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(services).where(eq(services.slug, slug)).limit(1);
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

export async function getExperienceBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(experiences).where(eq(experiences.slug, slug)).limit(1);
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

/**
 * Move os leads de checkout deste email para o segmento da newsletter.
 * Corre quando o hóspede aceita o opt-in depois de o lead já ter sido criado
 * (voltou ao passo 1). Só toca em linhas ainda sem consentimento.
 */
export async function promoteCheckoutLeadToNewsletter(email: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(leads)
    .set({ source: "newsletter-checkout", metadata: { consent: "true" } })
    .where(and(eq(leads.email, email), eq(leads.source, "checkout")));
}

/**
 * O inverso: retira do segmento da newsletter quem desmarcou o opt-in antes
 * de avançar. Sem isto o consentimento era write-once — desmarcar a caixa não
 * fazia nada e a pessoa ficava na mailing list contra a sua última vontade,
 * que é precisamente o que o RGPD trata como consentimento não retirável.
 * Só toca em leads nascidos do checkout: quem subscreveu no rodapé do site
 * ("newsletter-footer") nunca é afetado por uma reserva.
 */
export async function demoteCheckoutLeadFromNewsletter(email: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(leads)
    .set({ source: "checkout", metadata: { consent: "false" } })
    .where(and(eq(leads.email, email), eq(leads.source, "newsletter-checkout")));
}

export async function getLeadById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  return lead;
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
  if (!db) return { total: 0, newsletter: 0, contact: 0, checkout: 0, availability: 0, partner: 0, newLeads: 0 };
  const [total] = await db.select({ count: sql<number>`count(*)` }).from(leads);
  const [newsletter] = await db.select({ count: sql<number>`count(*)` }).from(leads).where(like(leads.source, "newsletter%"));
  const [contact] = await db.select({ count: sql<number>`count(*)` }).from(leads).where(like(leads.source, "contact%"));
  // Emails captured mid-funnel: checkout step 1, and "tell me when it opens"
  // requests from a search with no availability. Both were invisible here.
  // Conta as DUAS origens do checkout: quem nao deu opt-in fica "checkout" e
  // quem deu nasce "newsletter-checkout" — sem o OR o tile subcontava o funil
  // a partir do momento em que o opt-in entrou em producao (24 ago 2026).
  const [checkout] = await db
    .select({ count: sql<number>`count(*)` })
    .from(leads)
    .where(or(like(leads.source, "checkout%"), like(leads.source, "newsletter-checkout%")));
  const [availability] = await db.select({ count: sql<number>`count(*)` }).from(leads).where(like(leads.source, "search-no-availability%"));
  const [partner] = await db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.source, "partner-home-request"));
  const [newLeads] = await db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.status, "new"));
  return {
    total: total.count,
    newsletter: newsletter.count,
    contact: contact.count,
    checkout: checkout.count,
    availability: availability.count,
    partner: partner.count,
    newLeads: newLeads.count,
  };
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
  try {
    const result = await db.select().from(customerProfiles).where(eq(customerProfiles.userId, userId)).limit(1);
    return result[0];
  } catch (err: any) {
    // Table may not exist yet (migration not run) — return undefined so the endpoint returns defaults
    console.warn("[DB] customer_profiles query failed (table may not exist):", err?.message?.slice(0, 120));
    return undefined;
  }
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

/**
 * Update trip status by Guesty reservation ID.
 * Used by webhook handler when Guesty notifies us of reservation changes.
 */
export async function updateTripStatusByReservationId(
  guestyReservationId: string,
  status: "upcoming" | "active" | "completed" | "cancelled"
) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .update(customerTrips)
    .set({ status })
    .where(eq(customerTrips.guestyReservationId, guestyReservationId));
  return result;
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

/* ================================================================
   BOOKING INTENTS — Checkout 2.0 (Fase 1)
   All helpers fail SOFT (return null) when the DB is unavailable so
   the client can fall back to the legacy in-widget flow.
   ================================================================ */
export async function createBookingIntent(data: InsertBookingIntent): Promise<string | null> {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot create booking intent: database not available"); return null; }
  try {
    await db.insert(bookingIntents).values(data);
    return data.id;
  } catch (error) {
    console.error("[Database] createBookingIntent failed:", error);
    return null;
  }
}

export async function getBookingIntent(id: string): Promise<BookingIntent | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(bookingIntents).where(eq(bookingIntents.id, id)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error("[Database] getBookingIntent failed:", error);
    return null;
  }
}

/** Internal receipt lookup. An ambiguous mapping must not choose a payment. */
export async function getPaidBookingIntentByReservationId(reservationId: string): Promise<BookingIntent | null> {
  const db = await getDb();
  if (!db) throw new Error("Receipt database unavailable");
  const rows = await db.select().from(bookingIntents)
    .where(and(eq(bookingIntents.reservationId, reservationId), eq(bookingIntents.status, "paid")))
    .limit(2);
  if (rows.length > 1) throw new Error("Ambiguous receipt payment");
  return rows[0] ?? null;
}

/** Claim the server-confirmed paid transition once across app instances. */
export async function markBookingIntentPaid(id: string, reservationId: string, confirmationCode: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Cannot record payment confirmation without database");
  const result: any = await db.update(bookingIntents)
    .set({ status: "paid", reservationId, confirmationCode })
    .where(and(eq(bookingIntents.id, id), ne(bookingIntents.status, "paid")));
  const affected = Array.isArray(result) ? result[0]?.affectedRows : result?.affectedRows;
  return (affected ?? 0) > 0;
}

export async function updateBookingIntent(
  id: string,
  data: Partial<InsertBookingIntent>,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.update(bookingIntents).set(data).where(eq(bookingIntents.id, id));
    return true;
  } catch (error) {
    console.error("[Database] updateBookingIntent failed:", error);
    return false;
  }
}

/* ================================================================
   CHECKOUT RECOVERY — Fase 4 (spec §12/§16)
   ================================================================ */

/**
 * Abandoned intents eligible for a recovery email: guest left an email,
 * never paid, the resume link still works (expiresAt in the future) and
 * fewer than 2 recovery emails were sent. Sweep-friendly: capped, oldest
 * first, only intents past the 1h mark.
 */
export async function listRecoveryCandidates(limit = 200): Promise<BookingIntent[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const now = Date.now();
    const HOUR = 60 * 60 * 1000;
    const oneHourAgo = new Date(now - HOUR);
    const nineDaysAgo = new Date(now - 9 * 24 * HOUR);
    const threeDaysAgo = new Date(now - 72 * HOUR);
    const sevenDaysAgo = new Date(now - 7 * 24 * HOUR);
    const twoDaysAgo = new Date(now - 48 * HOUR);
    const minCheckIn = new Date(now + 2 * 24 * HOUR).toISOString().slice(0, 10);
    const base = [
      isNotNull(bookingIntents.email),
      inArray(bookingIntents.status, ["draft", "contact_captured", "payment_pending"]),
      gt(bookingIntents.checkIn, minCheckIn),
      sql`${bookingIntents.reservationId} IS NULL`,
      // Bloco 2: quem carregou em "Não quero receber estes lembretes"
      // sai da automação para sempre
      eq(bookingIntents.recoveryOptout, false),
    ];

    // Duas filas, cada uma com o seu limite, as mais recentes primeiro.
    //
    // Até out/2026 era UMA consulta de 200 intents, do mais antigo para o mais
    // recente, numa janela de 9 dias. Os intents que nunca avançam (grupo de
    // controlo, sem consentimento para os contactos 3/4) ficavam lá 9 dias e
    // enchiam as 200 vagas: com mais tráfego, os checkouts novos, que precisam
    // do contacto de 1 h, nunca entravam, e quando entravam a cotação já tinha
    // expirado. Resultado: o funil deixou de enviar sem dar erro.

    // 1) Contactos 1 e 2 (cotação ainda válida) e o alerta ao concierge
    //    (abandono no pagamento, até 48 h). Janela curta por natureza.
    const early = await db
      .select()
      .from(bookingIntents)
      .where(
        and(
          ...base,
          lt(bookingIntents.createdAt, oneHourAgo),
          or(
            and(lt(bookingIntents.recoveryStage, 2), gt(bookingIntents.expiresAt, new Date(now))),
            and(
              eq(bookingIntents.status, "payment_pending"),
              eq(bookingIntents.conciergeAlerted, false),
              gt(bookingIntents.createdAt, twoDaysAgo),
            ),
          ),
        ),
      )
      .orderBy(desc(bookingIntents.createdAt))
      .limit(limit);

    // 2) Contactos 3 (3 dias) e 4 (7 dias): só com consentimento de marketing,
    //    filtrado aqui para que quem não deu consentimento não ocupe vagas.
    const late = await db
      .select()
      .from(bookingIntents)
      .where(
        and(
          ...base,
          lt(bookingIntents.createdAt, threeDaysAgo),
          gt(bookingIntents.createdAt, nineDaysAgo),
          or(
            lt(bookingIntents.recoveryStage, 3),
            and(lt(bookingIntents.recoveryStage, 4), lt(bookingIntents.createdAt, sevenDaysAgo)),
          ),
          sql`EXISTS (SELECT 1 FROM ${leads} WHERE ${leads.email} = ${bookingIntents.email} AND ${leads.source} LIKE ${"newsletter%"})`,
        ),
      )
      .orderBy(desc(bookingIntents.createdAt))
      .limit(limit);

    const seen = new Set<string>();
    return [...early, ...late].filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  } catch (error) {
    console.error("[Database] listRecoveryCandidates failed:", error);
    return [];
  }
}

/**
 * Intents de cartão com pagamento iniciado mas nunca fechados: PI criado,
 * status ainda não paid, sem mexidas há >10 min. O sweep de settle tenta
 * fechá-los (spec §14: retry persistente — sobrevive a restarts porque vive
 * na base de dados, não num setTimeout). Janela de 48h contada da última
 * mexida no intent (o pagamento grava o paymentIntentId e atualiza-o), não da
 * criação: um hóspede que paga pelo email de recuperação dos 3 ou 7 dias
 * ficava fora da janela e o settle falhado nunca era retomado. Mais recentes
 * primeiro e com folga no limite, para os abandonados com PI não taparem um
 * pagamento real (a mesma classe de falha do PR #147 da recuperação).
 */
export async function listUnsettledCardIntents(limit = 200): Promise<BookingIntent[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    return await db
      .select()
      .from(bookingIntents)
      .where(
        and(
          isNotNull(bookingIntents.paymentIntentId),
          inArray(bookingIntents.status, ["contact_captured", "payment_pending"]),
          lt(bookingIntents.updatedAt, tenMinAgo),
          gt(bookingIntents.updatedAt, twoDaysAgo),
        ),
      )
      .orderBy(desc(bookingIntents.updatedAt))
      .limit(limit);
  } catch (error) {
    console.error("[Database] listUnsettledCardIntents failed:", error);
    return [];
  }
}

/** Consentimento de marketing atual deste email: o captureLead mantém o
 *  source do lead em "newsletter-*" enquanto a caixa estiver marcada e
 *  retira-o quando é desmarcada, por isso é a fonte de verdade. */
export async function hasNewsletterConsent(email: string): Promise<boolean> {
  const db = await getDb();
  if (!db || !email) return false;
  try {
    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.email, email), like(leads.source, "newsletter%")))
      .limit(1);
    return rows.length > 0;
  } catch (error) {
    console.error("[Database] hasNewsletterConsent failed:", error);
    return false;
  }
}

/** Claim do alerta "ligar ao hóspede": só o primeiro sweep o envia. */
export async function claimConciergeAlert(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    const res: any = await db
      .update(bookingIntents)
      .set({ conciergeAlerted: true })
      .where(and(eq(bookingIntents.id, id), eq(bookingIntents.conciergeAlerted, false)));
    const affected = Array.isArray(res) ? res[0]?.affectedRows : res?.affectedRows;
    return (affected ?? 0) > 0;
  } catch (error) {
    console.error("[Database] claimConciergeAlert failed:", error);
    return false;
  }
}

export async function listIntentsForRecoveryStay(intent: BookingIntent): Promise<BookingIntent[]> {
  const db = await getDb();
  if (!db || !intent.email) return [];
  return db.select().from(bookingIntents).where(and(
    sql`lower(trim(${bookingIntents.email})) = ${intent.email.trim().toLowerCase()}`,
    eq(bookingIntents.listingId, intent.listingId),
    eq(bookingIntents.checkIn, intent.checkIn),
    eq(bookingIntents.checkOut, intent.checkOut),
  ));
}

/**
 * Bloco 2: marca o opt-out dos lembretes de recuperação. Idempotente — marcar
 * duas vezes é um no-op. Devolve false só quando a DB está indisponível ou o
 * intent não existe.
 */
export async function markRecoveryOptout(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    const res: any = await db
      .update(bookingIntents)
      .set({ recoveryOptout: true })
      .where(eq(bookingIntents.id, id));
    const affected = Array.isArray(res) ? res[0]?.affectedRows : res?.affectedRows;
    if ((affected ?? 0) > 0) return true;
    // affectedRows 0 pode ser "já estava true" (MySQL não conta updates sem
    // alteração) — confirma que o intent existe antes de devolver false
    const row = await db.select({ id: bookingIntents.id }).from(bookingIntents).where(eq(bookingIntents.id, id)).limit(1);
    return row.length > 0;
  } catch (error) {
    console.error("[Database] markRecoveryOptout failed:", error);
    return false;
  }
}

/**
 * Atomically claim a recovery stage before sending: the UPDATE only wins if
 * the row is still at `fromStage`, so a concurrent sweep (or second server
 * instance) can never double-send. Claim-then-send: a failed send loses one
 * email, never repeats one.
 */
export async function claimRecoveryStage(
  id: string,
  fromStage: number,
  toStage: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    const res: any = await db
      .update(bookingIntents)
      .set({ recoveryStage: toStage })
      .where(and(
        eq(bookingIntents.id, id), eq(bookingIntents.recoveryStage, fromStage),
        inArray(bookingIntents.status, ['draft', 'contact_captured', 'payment_pending']),
        eq(bookingIntents.recoveryOptout, false),
        // Os contactos 1 e 2 falam do preço garantido: só com a cotação viva.
        // Os contactos 3 e 4 refazem a cotação ou mostram alternativas.
        ...(toStage <= 2 ? [gt(bookingIntents.expiresAt, new Date())] : []),
        sql`${bookingIntents.reservationId} IS NULL`,
      ));
    const affected = Array.isArray(res) ? res[0]?.affectedRows : res?.affectedRows;
    return (affected ?? 0) > 0;
  } catch (error) {
    console.error("[Database] claimRecoveryStage failed:", error);
    return false;
  }
}

/* ================================================================
   PAGAMENTO EM DUAS PARTES — Fase 1 (docs/pagamento_duas_partes.md, 5.2)
   Tabelas criadas no arranque (services/two-parts-migrations.ts).
   ================================================================ */

function affectedRowsOf(res: any): number {
  const affected = Array.isArray(res) ? res[0]?.affectedRows : res?.affectedRows;
  return affected ?? 0;
}

/** Chave única repetida (ER_DUP_ENTRY, 1062). O drizzle embrulha o erro do
 *  mysql2 num "Failed query: …" com o original em .cause. A mensagem do
 *  drizzle traz os parâmetros (telefone, nome da casa): o texto só se lê no
 *  erro do driver, nunca no embrulho, para um valor escrito pelo hóspede não
 *  fazer passar uma falha verdadeira por "já existe". */
function isDuplicateEntryError(err: any): boolean {
  const driver = err?.cause ?? err;
  if (driver?.code === "ER_DUP_ENTRY" || driver?.errno === 1062) return true;
  // A mensagem do MySQL começa por "Duplicate entry"; a do embrulho começa por
  // "Failed query" e é a que traz os parâmetros, por isso nunca se lê.
  return /^Duplicate entry /i.test(String(driver?.message ?? ""));
}

/** Corta por caracteres, não por unidades UTF-16: o varchar(500) do MySQL
 *  conta caracteres e um par substituto partido ao meio não é texto válido. */
function truncateChars(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join("") : text;
}

/**
 * Grava o customer Stripe do intent, uma vez. Só escreve se o intent ainda
 * não está pago e não tem outro customer: dois pedidos em paralelo com
 * customers diferentes não podem trocar o cartão guardado debaixo de um PI
 * já criado. true se gravou ou se a linha já tem exatamente este id (o
 * customer é criado com idempotency key por intent, por isso a repetição
 * devolve o mesmo); false sem BD, com outro customer ou com erro.
 */
export async function setIntentStripeCustomer(intentId: string, customerId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    const res: any = await db
      .update(bookingIntents)
      .set({ stripeCustomerId: customerId })
      .where(and(
        eq(bookingIntents.id, intentId),
        ne(bookingIntents.status, "paid"),
        or(isNull(bookingIntents.stripeCustomerId), eq(bookingIntents.stripeCustomerId, customerId)),
      ));
    if (affectedRowsOf(res) > 0) return true;
    // affectedRows 0 também pode ser "já tinha este id" num MySQL que conte
    // só linhas alteradas: confirma na linha antes de dizer que falhou.
    const rows = await db
      .select({ stripeCustomerId: bookingIntents.stripeCustomerId })
      .from(bookingIntents)
      .where(eq(bookingIntents.id, intentId))
      .limit(1);
    return rows[0]?.stripeCustomerId === customerId;
  } catch (error) {
    console.error("[Database] setIntentStripeCustomer failed:", error);
    return false;
  }
}

/**
 * Regista a prova do mandato (spec 6.2). "exists" quando o mesmo PI já tem
 * mandato (retoma do pagamento, duplo clique): o primeiro registo é o que
 * vale. Sem BD ou com outro erro lança: sem prova do mandato não se pode
 * guardar o cartão para cobrar mais tarde.
 */
export async function insertCardMandate(row: InsertCheckoutCardMandate): Promise<"inserted" | "exists"> {
  const db = await getDb();
  if (!db) throw new Error("Cannot record card mandate without database");
  try {
    await db.insert(checkoutCardMandates).values(row);
    return "inserted";
  } catch (error) {
    if (isDuplicateEntryError(error)) return "exists";
    throw error;
  }
}

/**
 * No settle, liga os mandatos do checkout deste intent ao agendamento e ao
 * cartão que a Stripe confirmou (no createCardCharge o cartão ainda não é
 * conhecido). Só toca em mandatos ainda por ligar e nunca nos de troca de
 * cartão. Nunca lança: o agendamento já existe e a ligação é rastreio, que
 * se refaz a partir do intent; uma falha aqui não pode travar o settle.
 */
export async function linkCardMandatesToSchedule(
  intentId: string,
  paymentIntentId: string,
  scheduledPaymentId: string,
  paymentMethodId: string,
  cardLast4: string | null,
): Promise<void> {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot link card mandates: database not available"); return; }
  try {
    await db
      .update(checkoutCardMandates)
      // Sem last4 não se apaga um que já lá esteja.
      .set({ scheduledPaymentId, paymentMethodId, ...(cardLast4 ? { cardLast4 } : {}) })
      .where(and(
        eq(checkoutCardMandates.intentId, intentId),
        // Só o mandato do PI que foi pago: os de PIs cancelados (outro valor,
        // outra data) ficam como registo do que foi aceite e nunca cobrado.
        eq(checkoutCardMandates.paymentIntentId, paymentIntentId),
        isNull(checkoutCardMandates.scheduledPaymentId),
        eq(checkoutCardMandates.source, "checkout"),
      ));
  } catch (error) {
    console.error("[Database] linkCardMandatesToSchedule failed:", error);
  }
}

/**
 * Agenda a 2.ª parte: uma linha por intent (UNIQUE intent_id). "exists"
 * quando um settle anterior já agendou (retoma pelo sweep, webhook e
 * redirect em paralelo). Sem BD ou com outro erro lança, para o settle
 * falhar e o sweep o retomar: um depósito cobrado sem saldo agendado é
 * dinheiro que nunca se cobraria.
 */
export async function insertScheduledPayment(row: InsertCheckoutScheduledPayment): Promise<"inserted" | "exists"> {
  const db = await getDb();
  if (!db) throw new Error("Cannot schedule balance payment without database");
  try {
    await db.insert(checkoutScheduledPayments).values(row);
    return "inserted";
  } catch (error) {
    if (isDuplicateEntryError(error)) return "exists";
    throw error;
  }
}

/** Agendamento do intent, ou null sem BD. Outros erros propagam: quem chama
 *  não pode confundir "BD falhou" com "não há agendamento". */
export async function getScheduledPaymentByIntent(intentId: string): Promise<CheckoutScheduledPayment | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(checkoutScheduledPayments)
    .where(eq(checkoutScheduledPayments.intentId, intentId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Deduplicação dos webhooks Stripe (spec 5.4): insert antes de processar.
 * fresh = primeira vez que se vê o evento; processed = já foi tratado até
 * ao fim (reentrega a ignorar). Uma reentrega de um evento que falhou a
 * meio volta com processed=false e processa-se outra vez. Fail-open: sem
 * BD ou com erro devolve null e o webhook segue como antes desta tabela
 * (o settle tem a sua própria idempotência).
 */
export async function recordStripeWebhookEvent(e: {
  eventId: string;
  type: string;
  livemode: boolean;
}): Promise<{ fresh: boolean; processed: boolean } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    await db.insert(stripeWebhookEvents).values({
      eventId: e.eventId,
      type: truncateChars(e.type, 64),
      livemode: e.livemode,
    });
    return { fresh: true, processed: false };
  } catch (error) {
    if (!isDuplicateEntryError(error)) {
      console.error("[Database] recordStripeWebhookEvent failed:", error);
      return null;
    }
  }
  try {
    const rows = await db
      .select({ processedAt: stripeWebhookEvents.processedAt })
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, e.eventId))
      .limit(1);
    return { fresh: false, processed: rows[0]?.processedAt != null };
  } catch (error) {
    console.error("[Database] recordStripeWebhookEvent read failed:", error);
    return null;
  }
}

/** Evento tratado até ao fim. Nunca lança: o webhook já respondeu e, no
 *  pior caso, uma reentrega volta a processar (os efeitos são idempotentes). */
export async function markStripeWebhookEventProcessed(eventId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db
      .update(stripeWebhookEvents)
      .set({ processedAt: new Date(), lastError: null })
      .where(eq(stripeWebhookEvents.eventId, eventId));
  } catch (error) {
    console.error("[Database] markStripeWebhookEventProcessed failed:", error);
  }
}

/** Guarda o último erro do evento (processed_at fica NULL, a reentrega
 *  processa outra vez). Nunca lança. */
export async function markStripeWebhookEventFailed(eventId: string, error: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db
      .update(stripeWebhookEvents)
      .set({ lastError: truncateChars(String(error ?? ""), 500) })
      .where(eq(stripeWebhookEvents.eventId, eventId));
  } catch (err) {
    console.error("[Database] markStripeWebhookEventFailed failed:", err);
  }
}

/** Store validated field Core Web Vitals rows (server/routes/vitals.ts). */
export async function insertWebVitals(rows: InsertWebVital[]): Promise<void> {
  const db = await getDb();
  if (!db || !rows.length) return;
  await db.insert(webVitals).values(rows);
}
