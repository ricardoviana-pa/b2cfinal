import { isPreviewDeployment } from "./lib/preview-isolation";
import { dbErrorSummary } from "./lib/db-error-log";
import { ne, eq, desc, asc, and, or, like, sql, inArray, notInArray, isNotNull, isNull, gt, gte, lt, lte } from "drizzle-orm";
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
  checkoutAdminActions, CheckoutAdminAction, InsertCheckoutAdminAction,
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

/** Vários settings numa só consulta (chave → valor). Lança se a BD falhar. */
export async function getSettingsByKeys(keys: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!keys.length) return out;
  const db = await getDb();
  if (!db) return out;
  const rows = await db
    .select({ key: siteSettings.settingKey, value: siteSettings.settingValue })
    .from(siteSettings)
    .where(inArray(siteSettings.settingKey, keys));
  for (const r of rows) out.set(r.key, r.value ?? null);
  return out;
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

/** Claim the server-confirmed paid transition once across app instances.
 *  `extra.email` (PayPal/Klarna: the email the guest paid with) is written in
 *  the same claim, so only the caller that wins the transition writes it. */
export async function markBookingIntentPaid(
  id: string,
  reservationId: string,
  confirmationCode: string,
  extra: { email?: string } = {},
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Cannot record payment confirmation without database");
  const result: any = await db.update(bookingIntents)
    .set({ status: "paid", reservationId, confirmationCode, ...(extra.email ? { email: extra.email } : {}) })
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
          // Sem efeito no resultado (nextRecoveryStage desiste aos 9 dias e o
          // alerta ao concierge só vale até 48 h), mas com o índice de
          // createdAt troca uma leitura da tabela inteira por um intervalo.
          gt(bookingIntents.createdAt, nineDaysAgo),
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
export async function listUnsettledCardIntents(limit = 200): Promise<Array<{ id: string; paymentIntentId: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    // Só as duas colunas que o sweep usa: cada linha completa leva a cotação
    // em JSON, e a BD (TiDB) cobra cada KiB lido.
    return await db
      .select({ id: bookingIntents.id, paymentIntentId: bookingIntents.paymentIntentId })
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

/**
 * A caixa de marketing do passo 1 do checkout, tal como o hóspede a deixou:
 * o captureLead mantém os leads do checkout deste email em
 * "newsletter-checkout" enquanto a caixa estiver marcada e passa-os a
 * "checkout" quando é desmarcada. (Uma subscrição no rodapé não conta: o
 * checkout nunca lhe mexe.) null = não se sabe (sem BD ou leitura falhada):
 * quem chama não repõe nada e o captureLead não mexe no consentimento.
 */
export async function checkoutNewsletterConsent(email: string): Promise<boolean | null> {
  if (!email) return null;
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.email, email), eq(leads.source, "newsletter-checkout")))
      .limit(1);
    return rows.length > 0;
  } catch (error) {
    // Sem o email do hóspede: o erro do Drizzle traz os parâmetros da query
    console.error("[Database] checkoutNewsletterConsent failed:", dbErrorSummary(error));
    return null;
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

/* ================================================================
   PAGAMENTO EM DUAS PARTES — Fase 2a: motor da 2.ª parte
   (docs/pagamento_duas_partes.md, 2.4, 2.5, 3.1, 5.2 e 5.3). Usado pelo
   sweep, pelo link do hóspede, pelo webhook e pelo digest
   (services/checkout-balance.ts).
   Regras comuns a tudo o que está abaixo:
   - Cada mudança de estado é um UPDATE condicional (WHERE status …): com
     dois sweeps, um restart a meio ou o hóspede a pagar ao mesmo tempo, só
     um processo ganha. true só com affectedRows > 0. O mysql2 liga
     FOUND_ROWS por omissão, por isso affectedRows conta as linhas que o
     WHERE encontrou, mesmo quando o valor gravado já era o mesmo.
   - As listas filtram sempre por livemode e site_origin (BalanceScope): a
     BD é partilhada com o DEV e produção nunca pode ver linhas de teste,
     nem o DEV linhas reais.
   - Sem BD (preview, DATABASE_URL em falta): listas devolvem [], claims e
     transições devolvem false, e nada corre.
   - Erro de BD propaga sempre. false quer dizer só "a linha não estava no
     estado esperado". Se também quisesse dizer "não sei", quem chama podia
     concluir que outro processo já tratou a linha e reembolsar, ou cobrar
     outra vez, por cima de uma falha passageira da BD.
   - Os instantes vêm de quem chama (now) e passam sempre pelos operadores
     do drizzle com a coluna, para serem gravados e comparados em UTC: um
     Date metido em sql`` cru seria formatado pelo mysql2 no fuso do
     processo.
   ================================================================ */

/** Ambiente das linhas que um processo pode tocar (regra 3 do motor). */
export interface BalanceScope { livemode: boolean; siteOrigin: string }

/** Estados da spec 2.5 (o enum `status` de checkout_scheduled_payments). */
export type ScheduledPaymentStatus =
  | "scheduled" | "charging" | "retry" | "needs_action" | "succeeded" | "paid_externally"
  | "needs_review" | "cancelling" | "cancelled_unpaid" | "cancelled_by_guest";

/** Colunas de claim por efeito (claim-then-act, spec 3.1 ponto 2). */
export type BalanceEffectColumn =
  | "guestyBalanceClaimedAt" | "noteClaimedAt" | "emailPaidClaimedAt"
  | "cancelPisClaimedAt" | "guestyCancelClaimedAt" | "refundClaimedAt" | "emailCancelClaimedAt";

/** Quem reclamou a tentativa de cobrança (enum `claim_source`). */
export type BalanceClaimSource = "sweep" | "guest" | "webhook" | "admin";

/** Fotografia da reserva no Guesty gravada pela reconciliação (spec 5.10). */
export interface BalanceReconciliationSnapshot {
  guestyStatus: string | null;
  guestyCheckIn: string | null;
  guestyCheckOut: string | null;
  guestyListingId: string | null;
  guestyTotalCents: number | null;
  guestyTotalPaidCents: number | null;
  guestyPendingForeignCents: number | null;
  error?: string | null;
}

/** Tudo o que o digest diário mostra (spec 3.3), por scope. */
export interface BalanceDigest {
  counts: Record<ScheduledPaymentStatus, number>;
  /** Por cobrar nos próximos 7 dias, incluindo as que já deviam ter sido
   *  cobradas (charge_at no passado e ainda scheduled): atraso visível. */
  upcoming7d: CheckoutScheduledPayment[];
  /** retry e needs_action: "A RESOLVER PELO HÓSPEDE". */
  failing: CheckoutScheduledPayment[];
  /** needs_review: "A RESOLVER POR NÓS". */
  review: CheckoutScheduledPayment[];
  cancelled24h: CheckoutScheduledPayment[];
  postChargeIncomplete: CheckoutScheduledPayment[];
  /** charging há mais de 30 min. */
  stuckCharging: CheckoutScheduledPayment[];
  /** cancelling sem mexidas há mais de 30 min (a spec 3.3 pede as duas). */
  stuckCancelling: CheckoutScheduledPayment[];
  /** Reembolso falhado por resolver (spec 3.1 #13): refund_status fora de
   *  succeeded/pending/nothing/manual, em qualquer estado e de qualquer data
   *  (o refund.failed chega muitas vezes dias depois do cancelamento). */
  refundFailures: CheckoutScheduledPayment[];
}

// Falha a compilar se o enum do schema ganhar ou perder um valor sem estes
// tipos acompanharem: um estado esquecido aqui ficava fora do digest.
type SameUnion<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const BALANCE_TYPES_MATCH_SCHEMA: [
  SameUnion<ScheduledPaymentStatus, CheckoutScheduledPayment["status"]>,
  SameUnion<BalanceClaimSource, NonNullable<CheckoutScheduledPayment["claimSource"]>>,
] = [true, true];
void BALANCE_TYPES_MATCH_SCHEMA;

const sp = checkoutScheduledPayments;

const BALANCE_EFFECT_COLUMNS: readonly BalanceEffectColumn[] = [
  "guestyBalanceClaimedAt", "noteClaimedAt", "emailPaidClaimedAt",
  "cancelPisClaimedAt", "guestyCancelClaimedAt", "refundClaimedAt", "emailCancelClaimedAt",
];

/** Por pagar e ainda vivas: as únicas que o hard stop pode cancelar. */
const OPEN_UNPAID: ScheduledPaymentStatus[] = ["scheduled", "retry", "needs_action"];
/** O sweep só cobra o que nada impede (regra 1): needs_action é só do hóspede. */
const AUTO_CHARGEABLE: ScheduledPaymentStatus[] = ["scheduled", "retry"];
/** Estados de onde nunca se entra em cancelling: com uma cobrança em curso
 *  (o caminho de charging preso resolve primeiro, lendo o PI) ou já lá. */
const NEVER_CANCEL_FROM: ReadonlySet<ScheduledPaymentStatus> = new Set<ScheduledPaymentStatus>([
  "charging", "cancelling", "cancelled_unpaid", "cancelled_by_guest",
]);
/** Uma linha onde o hóspede agiu nesta janela (guest_active_at) está a ser
 *  paga (3DS a meio) ou a mudar de cartão: o hard stop não lhe toca (spec
 *  2.4, "nunca por cima de um hóspede que está a pagar"). */
const GUEST_CLAIM_SHIELD_MS = 60 * 60_000;
/** Resultados de reembolso que não pedem ninguém: feito, em curso, nada a
 *  devolver, ou resolvido à mão pelo CS (markRefundManual). */
const REFUND_SETTLED = ["succeeded", "pending", "nothing", "manual"];
const STUCK_AFTER_MS = 30 * 60_000;

/** Condições do scope. Um scope mal formado lança em vez de virar "todas
 *  as linhas": é exatamente o filtro que separa produção de teste. */
function scopeConditions(scope: BalanceScope) {
  if (typeof scope?.livemode !== "boolean" || typeof scope?.siteOrigin !== "string" || !scope.siteOrigin.trim()) {
    throw new Error("BalanceScope inválido: livemode (boolean) e siteOrigin são obrigatórios");
  }
  return [eq(sp.livemode, scope.livemode), eq(sp.siteOrigin, scope.siteOrigin)];
}

/** "Preciso de ajuda" pausa a automação até uma data (spec 2.4). */
function notHelpPaused(now: Date) {
  return or(isNull(sp.helpPausedUntil), lte(sp.helpPausedUntil, now));
}

/** O hóspede não agiu na página na última hora: guest_active_at NULL (sem
 *  escudo) ou mais antigo do que a janela. Mede-se só por guest_active_at,
 *  que nenhum claim do sweep ou do admin reescreve (claimed_at e
 *  claim_source mudam a cada claim e escondiam um hóspede a meio do 3DS). */
function notRecentGuestClaim(now: Date) {
  const cutoff = new Date(now.getTime() - GUEST_CLAIM_SHIELD_MS);
  return or(isNull(sp.guestActiveAt), lte(sp.guestActiveAt, cutoff));
}

function assertIntegerCents(value: number | null, label: string): void {
  if (value !== null && (!Number.isInteger(value) || value < 0)) {
    throw new Error(`${label} tem de ser um inteiro de cêntimos >= 0 (recebido ${value})`);
  }
}

/** Valores lidos do Guesty (euros convertidos em cêntimos por quem chama):
 *  arredonda o resto de vírgula flutuante, mas um NaN ou Infinity é uma
 *  leitura estragada e lança em vez de ser gravado como fotografia válida. */
function snapshotCents(value: number | null | undefined, label: string): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) throw new Error(`${label} inválido na reconciliação: ${value}`);
  return Math.round(value);
}

function optionalText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const text = String(value);
  return text ? truncateChars(text, max) : null;
}

/** Linhas a cobrar agora pelo sweep: scheduled/retry vencidas, antes de H e
 *  sem pausa de ajuda, as mais antigas primeiro. */
export async function listDueScheduledPayments(
  scope: BalanceScope,
  now: Date,
  limit = 50,
): Promise<CheckoutScheduledPayment[]> {
  const where = scopeConditions(scope);
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sp)
    .where(and(
      ...where,
      inArray(sp.status, AUTO_CHARGEABLE),
      lte(sp.nextAttemptAt, now),
      gt(sp.hardStopAt, now),
      notHelpPaused(now),
    ))
    .orderBy(asc(sp.nextAttemptAt))
    .limit(limit);
}

/**
 * Claim da tentativa de cobrança, antes de qualquer chamada à Stripe
 * (regra 2): → charging, com claimed_at, claim_source e attempts+1. Nunca
 * depois de H (regra 1). O sweep (e o webhook, que nunca devia cobrar)
 * repete no WHERE o mesmo filtro da listDueScheduledPayments: entre a lista
 * e o claim o hóspede pode ter tentado e falhado (a linha volta a retry
 * com a próxima tentativa amanhã, ou a needs_action) e o sweep não pode
 * cobrar outra vez por cima. O hóspede e o admin, em nome dele, podem
 * pagar também a partir de needs_action e antes da data marcada.
 */
export async function claimScheduledPaymentForCharge(
  id: string,
  source: BalanceClaimSource,
  now: Date,
): Promise<boolean> {
  if (!["sweep", "guest", "webhook", "admin"].includes(source)) {
    throw new Error(`claim_source inválido: ${source}`);
  }
  const db = await getDb();
  if (!db) return false;
  const automatic = source === "sweep" || source === "webhook";
  // claim_prev_status = status no mesmo UPDATE: o drizzle escreve o SET pela
  // ordem do esquema (claim_prev_status antes de status) e o MySQL avalia da
  // esquerda para a direita, por isso lê o estado de antes do claim.
  const res = await db
    .update(sp)
    .set({ claimPrevStatus: sql`${sp.status}`, status: "charging", claimedAt: now, claimSource: source, attempts: sql`${sp.attempts} + 1` })
    .where(and(
      eq(sp.id, id),
      inArray(sp.status, automatic ? AUTO_CHARGEABLE : OPEN_UNPAID),
      gt(sp.hardStopAt, now),
      ...(automatic ? [lte(sp.nextAttemptAt, now), notHelpPaused(now)] : []),
    ));
  return affectedRowsOf(res) > 0;
}

/** Grava o PI criado (passo 1 dos dois: create → gravar → confirm), só
 *  enquanto a tentativa é nossa. Um crash a seguir deixa o id na linha e
 *  a recuperação relê-o em vez de criar outro. */
export async function setBalancePaymentIntentId(
  id: string,
  field: "balancePaymentIntentId" | "guestPaymentIntentId",
  piId: string,
): Promise<boolean> {
  if (field !== "balancePaymentIntentId" && field !== "guestPaymentIntentId") {
    throw new Error(`Campo de PI inválido: ${field}`);
  }
  if (!piId) throw new Error("setBalancePaymentIntentId sem id de PI");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set(field === "balancePaymentIntentId" ? { balancePaymentIntentId: piId } : { guestPaymentIntentId: piId })
    .where(and(eq(sp.id, id), eq(sp.status, "charging")));
  return affectedRowsOf(res) > 0;
}

/**
 * Saldo cobrado: → succeeded. Aceita charging (o caminho normal), retry e
 * needs_action (webhook atrasado de uma tentativa que a Stripe concluiu
 * depois de a linha ter saído de charging) e também scheduled, um acrescento
 * ao contrato: uma tentativa com erro técnico ambíguo devolvida a scheduled
 * cujo PI afinal sucedeu tem de ficar paga, senão o sweep seguinte cobrava
 * outra vez. Nunca de needs_review, paid_externally nem estados finais:
 * aí o dinheiro a mais decide-se fora daqui (reembolso e alerta).
 */
export async function markScheduledPaymentSucceeded(id: string, piId: string, now: Date): Promise<boolean> {
  if (!piId) throw new Error("markScheduledPaymentSucceeded sem id de PI");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ status: "succeeded", succeededAt: now, balancePaymentIntentId: piId })
    .where(and(eq(sp.id, id), inArray(sp.status, ["scheduled", "charging", "retry", "needs_action"])));
  return affectedRowsOf(res) > 0;
}

/**
 * Saldo pago a meio de um cancelamento (cancelling → succeeded): o PI do
 * saldo sucedeu quando o cancelamento ia fechá-lo. Só enquanto nada de
 * irreversível foi reclamado: sem claim nem marca de cancelamento no
 * Guesty, sem claim nem id de reembolso, sem E5. Depois disso a reserva
 * já está (ou pode estar) cancelada e marcar "pago" mandava registar o
 * saldo e enviar o E4 de uma reserva que já não existe; aí devolve false e
 * o dinheiro decide-se pelo alerta. Limpa cancel_pis_claimed_at para um
 * cancelamento futuro (o hóspede, dentro do prazo) correr do início.
 */
export async function markCancellingAsSucceeded(id: string, piId: string, now: Date): Promise<boolean> {
  if (!piId) throw new Error("markCancellingAsSucceeded sem id de PI");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ status: "succeeded", succeededAt: now, balancePaymentIntentId: piId, cancelPisClaimedAt: null })
    .where(and(
      eq(sp.id, id),
      eq(sp.status, "cancelling"),
      // Uma linha já paga a cancelar (o hóspede cancela depois da 2.ª parte)
      // nunca volta a succeeded por um webhook atrasado: desfazia o pedido
      // de cancelamento e, com outro PI, escondia um pagamento duplicado.
      isNull(sp.succeededAt),
      isNull(sp.guestyCancelClaimedAt),
      isNull(sp.guestyCancelledAt),
      isNull(sp.refundClaimedAt),
      isNull(sp.refundId),
      isNull(sp.emailCancelClaimedAt),
    ));
  return affectedRowsOf(res) > 0;
}

/**
 * Pagamento do hóspede (ou de uma tentativa anterior) que sucede com a linha
 * em revisão: needs_review → succeeded. O dinheiro entrou; deixá-lo de fora
 * deixava a linha "a rever", sem E4 nem registo no Guesty, e um "Retomar"
 * voltava a pedir a 2.ª parte. Quem chama confirma que o PI é desta linha
 * (o PI do hóspede ou do sweep gravado, ou a metadata scheduledPaymentId) e
 * avisa o ops (o motivo da revisão pode ser um pagamento por fora).
 */
export async function markReviewAsSucceeded(id: string, piId: string, now: Date): Promise<boolean> {
  if (!piId) throw new Error("markReviewAsSucceeded sem id de PI");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ status: "succeeded", succeededAt: now, balancePaymentIntentId: piId })
    .where(and(eq(sp.id, id), eq(sp.status, "needs_review"), isNull(sp.succeededAt)));
  return affectedRowsOf(res) > 0;
}

/**
 * 2.ª parte paga com a linha a rever por causa do Guesty (reserva cancelada
 * ou alterada, pagamento por fora): o pagamento fica gravado na linha
 * (balance_payment_intent_id e succeeded_at), que continua `needs_review`.
 * Nada corre sozinho (os efeitos só correm em `succeeded`): a equipa decide
 * manter (closeReviewAsPaid) ou cancelar e devolver (o reembolso inclui a
 * 2.ª parte, porque a linha já a tem como paga).
 */
export async function recordPaymentDuringReview(id: string, piId: string, now: Date): Promise<boolean> {
  if (!piId) throw new Error("recordPaymentDuringReview sem id de PI");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ balancePaymentIntentId: piId, succeededAt: now })
    .where(and(eq(sp.id, id), eq(sp.status, "needs_review"), isNull(sp.succeededAt)));
  return affectedRowsOf(res) > 0;
}

/** A equipa mantém a estadia de uma linha paga durante a revisão: → succeeded
 *  com o pagamento já gravado (o mesmo PI); os efeitos correm a seguir. */
export async function closeReviewAsPaid(id: string, piId: string): Promise<boolean> {
  if (!piId) throw new Error("closeReviewAsPaid sem id de PI");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ status: "succeeded" })
    .where(and(eq(sp.id, id), eq(sp.status, "needs_review"), isNotNull(sp.succeededAt), eq(sp.balancePaymentIntentId, piId)));
  return affectedRowsOf(res) > 0;
}

/** Recusa soft: → retry com a próxima tentativa marcada (spec 2.4). */
export async function markScheduledPaymentRetry(
  id: string,
  p: { declineCode: string | null; error: string | null; nextAttemptAt: Date },
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({
      status: "retry",
      lastDeclineCode: optionalText(p.declineCode, 64),
      lastError: optionalText(p.error, 500),
      nextAttemptAt: p.nextAttemptAt,
    })
    .where(and(eq(sp.id, id), eq(sp.status, "charging")));
  return affectedRowsOf(res) > 0;
}

/** 3DS pedido ou recusa hard: → needs_action, só o hóspede resolve pelo
 *  link; o sweep nunca mais tenta sozinho (spec 2.4). */
export async function markScheduledPaymentNeedsAction(
  id: string,
  p: { declineCode: string | null; error: string | null },
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({
      status: "needs_action",
      lastDeclineCode: optionalText(p.declineCode, 64),
      lastError: optionalText(p.error, 500),
    })
    .where(and(eq(sp.id, id), eq(sp.status, "charging")));
  return affectedRowsOf(res) > 0;
}

/**
 * Falha técnica (Stripe ou Guesty em baixo, não uma recusa): devolve a
 * linha ao estado de onde veio e desconta a tentativa, porque o banco não
 * chegou a recusar nada e as 3 tentativas da spec são de cobrança, não de
 * rede. Só depois de quem chama ter relido o PI e confirmado que não há
 * dinheiro em jogo.
 */
export async function releaseChargeClaim(
  id: string,
  p: { toStatus: "scheduled" | "retry" | "needs_action"; nextAttemptAt: Date; error: string },
): Promise<boolean> {
  if (!OPEN_UNPAID.includes(p.toStatus)) throw new Error(`releaseChargeClaim para estado inválido: ${p.toStatus}`);
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({
      status: p.toStatus,
      nextAttemptAt: p.nextAttemptAt,
      lastError: optionalText(p.error, 500),
      attempts: sql`GREATEST(${sp.attempts} - 1, 0)`,
    })
    .where(and(eq(sp.id, id), eq(sp.status, "charging")));
  return affectedRowsOf(res) > 0;
}

/** Tentativas em charging reclamadas antes de claimedBefore (processo que
 *  morreu a meio). Inclui claimed_at NULL, que nunca devia existir mas, a
 *  existir, ficava presa para sempre. Quem chama lê o PI antes de mexer. */
export async function listStuckCharging(scope: BalanceScope, claimedBefore: Date): Promise<CheckoutScheduledPayment[]> {
  const where = scopeConditions(scope);
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sp)
    .where(and(...where, eq(sp.status, "charging"), or(isNull(sp.claimedAt), lt(sp.claimedAt, claimedBefore))))
    .orderBy(asc(sp.claimedAt));
}

/** Saldo recebido por outra via (transferência, admin com referência):
 *  → paid_externally. Nunca a meio de uma cobrança nossa (charging). */
export async function markPaidExternally(id: string, ref: string): Promise<boolean> {
  const text = String(ref ?? "").trim();
  if (!text) throw new Error("markPaidExternally exige uma referência");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ status: "paid_externally", paidExternallyRef: truncateChars(text, 120) })
    .where(and(eq(sp.id, id), inArray(sp.status, ["scheduled", "retry", "needs_action", "needs_review"])));
  return affectedRowsOf(res) > 0;
}

/** Humano tem de decidir, com prazo: → needs_review. Nunca de um estado
 *  final (spec 2.5); o hard stop nunca cancela uma linha em needs_review. */
export async function markNeedsReview(id: string, reason: string, dueAt: Date | null): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  // Sem motivo ainda se põe a linha em revisão: é a direção segura.
  const text = String(reason ?? "").trim() || "sem motivo indicado";
  const res = await db
    .update(sp)
    .set({ status: "needs_review", reviewReason: truncateChars(text, 120), reviewDueAt: dueAt })
    .where(and(eq(sp.id, id), inArray(sp.status, ["scheduled", "retry", "needs_action", "charging"])));
  return affectedRowsOf(res) > 0;
}

/** Candidatas a E1 (C−7) e E2 (C−1): ainda scheduled, C dentro do
 *  horizonte e com lembretes por enviar. */
export async function listScheduledForReminders(scope: BalanceScope, horizon: Date): Promise<CheckoutScheduledPayment[]> {
  const where = scopeConditions(scope);
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sp)
    .where(and(...where, eq(sp.status, "scheduled"), lte(sp.chargeAt, horizon), lt(sp.reminderStage, 2)))
    .orderBy(asc(sp.chargeAt));
}

/** Claim do lembrete antes de o enviar (molde claimRecoveryStage): uma
 *  falha de envio perde um email, nunca o repete. */
export async function claimReminderStage(id: string, from: number, to: number): Promise<boolean> {
  if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error("reminder_stage tem de ser inteiro");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ reminderStage: to })
    .where(and(eq(sp.id, id), eq(sp.reminderStage, from), eq(sp.status, "scheduled")));
  return affectedRowsOf(res) > 0;
}

/** Candidatas a E3 (aviso de falha, estágio 0→1) e E3b (véspera de H,
 *  1→2). */
export async function listFailureNoticeCandidates(scope: BalanceScope): Promise<CheckoutScheduledPayment[]> {
  const where = scopeConditions(scope);
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sp)
    .where(and(...where, inArray(sp.status, ["retry", "needs_action"]), inArray(sp.failureNoticeStage, [0, 1])))
    .orderBy(asc(sp.hardStopAt));
}

/**
 * Claim do aviso de falha antes de o enviar. No E3 grava, no mesmo UPDATE,
 * failure_notice_sent_at e o H recalculado: os 7 dias da Visa contam do
 * aviso escrito, por isso H e o aviso mudam juntos ou não mudam.
 */
export async function claimFailureNoticeStage(
  id: string,
  from: number,
  to: number,
  patch: { failureNoticeSentAt?: Date; hardStopAt?: Date } = {},
): Promise<boolean> {
  if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error("failure_notice_stage tem de ser inteiro");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({
      failureNoticeStage: to,
      ...(patch.failureNoticeSentAt ? { failureNoticeSentAt: patch.failureNoticeSentAt } : {}),
      ...(patch.hardStopAt ? { hardStopAt: patch.hardStopAt } : {}),
    })
    .where(and(eq(sp.id, id), eq(sp.failureNoticeStage, from), inArray(sp.status, ["retry", "needs_action"])));
  return affectedRowsOf(res) > 0;
}

/** Linhas por pagar cujo H já chegou, exceto aquelas em que o hóspede agiu
 *  na página na última hora (guest_active_at: está a pagar ou a trocar de
 *  cartão). Nunca needs_review nem paid_externally. */
export async function listHardStopDue(scope: BalanceScope, now: Date): Promise<CheckoutScheduledPayment[]> {
  const where = scopeConditions(scope);
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sp)
    .where(and(...where, inArray(sp.status, OPEN_UNPAID), lte(sp.hardStopAt, now), notRecentGuestClaim(now)))
    .orderBy(asc(sp.hardStopAt));
}

/**
 * Claim do cancelamento (hard stop ou hóspede): → cancelling, antes de
 * cancelar PIs, reserva ou reembolsar. Lança se fromStatuses incluir
 * charging ou um estado de cancelamento: cancelar por cima de uma cobrança
 * em curso é um erro de quem chama, não um caso a ignorar.
 * opts.hardStopNow (acrescento ao contrato, para o caminho do hard stop):
 * repete no WHERE a condição da listHardStopDue (H já passou, sem ação do
 * hóspede na última hora), para um hóspede que voltou à página entre a
 * lista e este claim nunca ver a reserva cancelada debaixo do 3DS.
 */
export async function claimScheduledPaymentForCancel(
  id: string,
  fromStatuses: ScheduledPaymentStatus[],
  /** reason: grava em review_reason quem pediu o cancelamento ("cancel:unpaid",
   *  "cancel:guest"), para uma passagem retomada saber que reembolsos fazer. */
  opts: { hardStopNow?: Date; reason?: string } = {},
): Promise<boolean> {
  const allowed = Array.from(new Set(fromStatuses));
  if (allowed.length === 0) throw new Error("claimScheduledPaymentForCancel sem estados de origem");
  const forbidden = allowed.filter((s) => NEVER_CANCEL_FROM.has(s));
  if (forbidden.length) throw new Error(`Nunca se cancela a partir de ${forbidden.join(", ")}`);
  const db = await getDb();
  if (!db) return false;
  const hardStop = opts.hardStopNow;
  const res = await db
    .update(sp)
    .set({ status: "cancelling", ...(opts.reason ? { reviewReason: opts.reason.slice(0, 120) } : {}) })
    .where(and(
      eq(sp.id, id),
      inArray(sp.status, allowed),
      ...(hardStop ? [lte(sp.hardStopAt, hardStop), notRecentGuestClaim(hardStop)] : []),
    ));
  return affectedRowsOf(res) > 0;
}

/* ── Fase 2b: ações do hóspede na página do saldo ─────────────────── */

/**
 * Guarda o PI que o hóspede vai confirmar no browser ("Pagar agora"), também
 * quando é o mesmo PI reutilizado. A linha não muda de estado (o sweep
 * continua a vê-la), mas guest_active_at fica com esta hora: a paragem dura
 * e o sweep esperam 60 min por ele, e o sweep lê este PI antes de cobrar. Só
 * em linhas por pagar e antes de H.
 */
export async function setGuestPaymentIntent(id: string, piId: string, now: Date): Promise<boolean> {
  if (!piId) throw new Error("setGuestPaymentIntent sem id de PI");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ guestPaymentIntentId: piId, claimSource: "guest", claimedAt: now, guestActiveAt: now })
    .where(and(eq(sp.id, id), inArray(sp.status, OPEN_UNPAID), gt(sp.hardStopAt, now)));
  return affectedRowsOf(res) > 0;
}

/**
 * O hóspede começou a trocar de cartão ("Usar outro cartão"): refresca o
 * escudo de 60 min (guest_active_at) sem mexer em mais nada. Só em linhas
 * por pagar e antes de H, como setGuestPaymentIntent.
 */
export async function markGuestActive(id: string, now: Date): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ guestActiveAt: now })
    .where(and(eq(sp.id, id), inArray(sp.status, OPEN_UNPAID), gt(sp.hardStopAt, now)));
  return affectedRowsOf(res) > 0;
}

/** SMS do saldo enviado (1 = S1 com o E3, 2 = S2 na véspera de H). Só sobe:
 *  um S1 atrasado nunca apaga o registo de um S2 já enviado. */
export async function setSmsStage(id: string, stage: 1 | 2): Promise<boolean> {
  if (stage !== 1 && stage !== 2) throw new Error(`sms_stage inválido: ${stage}`);
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ smsStage: stage })
    .where(and(eq(sp.id, id), lt(sp.smsStage, stage)));
  return affectedRowsOf(res) > 0;
}

/** Troca do cartão pelo hóspede: só em linhas por pagar. */
export async function updateScheduledPaymentCard(
  id: string,
  card: { paymentMethodId: string; brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null },
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({
      paymentMethodId: card.paymentMethodId,
      cardBrand: card.brand?.slice(0, 32) ?? null,
      cardLast4: card.last4?.slice(0, 4) ?? null,
      cardExpMonth: card.expMonth,
      cardExpYear: card.expYear,
    })
    .where(and(eq(sp.id, id), inArray(sp.status, OPEN_UNPAID)));
  return affectedRowsOf(res) > 0;
}

/** O mandato anterior deixa de valer quando o hóspede autoriza outro cartão. */
export async function supersedeCardMandates(scheduledPaymentId: string, keepPaymentMethodId: string, now: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(checkoutCardMandates)
    .set({ supersededAt: now })
    .where(and(
      eq(checkoutCardMandates.scheduledPaymentId, scheduledPaymentId),
      isNull(checkoutCardMandates.supersededAt),
      ne(checkoutCardMandates.paymentMethodId, keepPaymentMethodId),
    ));
}

/** "Preciso de ajuda": pausa a automação até uma data e entrega a linha a um humano. */
export async function pauseForHelp(id: string, until: Date, reason: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ status: "needs_review", helpPausedUntil: until, reviewReason: reason.slice(0, 120), reviewDueAt: until })
    .where(and(eq(sp.id, id), inArray(sp.status, OPEN_UNPAID)));
  return affectedRowsOf(res) > 0;
}

/** Cancelamentos em curso (para repetir os passos que faltam). */
export async function listCancelling(scope: BalanceScope): Promise<CheckoutScheduledPayment[]> {
  const where = scopeConditions(scope);
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sp).where(and(...where, eq(sp.status, "cancelling"))).orderBy(asc(sp.updatedAt));
}

/**
 * Claim de um efeito externo (registo Guesty, nota, email, cancelar PIs,
 * reembolso): grava now na coluna se estiver vazia ou se o claim anterior
 * tiver mais de staleMs (o processo morreu a meio; repete-se). Atenção: o
 * claim volta a ganhar passado staleMs mesmo que o efeito tenha corrido;
 * para efeitos sem marca de "feito" (nota, emails) quem chama só reclama
 * com a coluna a NULL, ou passa staleMs = null (acrescento ao contrato):
 * uma vez só, nunca repetível.
 */
export async function claimEffect(
  id: string,
  column: BalanceEffectColumn,
  now: Date,
  staleMs: number | null = 30 * 60_000,
): Promise<boolean> {
  if (!BALANCE_EFFECT_COLUMNS.includes(column)) throw new Error(`Coluna de efeito inválida: ${column}`);
  if (staleMs !== null && !(staleMs >= 0)) throw new Error(`staleMs inválido: ${staleMs}`);
  const db = await getDb();
  if (!db) return false;
  const col = sp[column];
  const repeatable = staleMs !== null && Number.isFinite(staleMs);
  const res = await db
    .update(sp)
    .set({ [column]: now } as Partial<InsertCheckoutScheduledPayment>)
    .where(and(
      eq(sp.id, id),
      repeatable ? or(isNull(col), lt(col, new Date(now.getTime() - (staleMs as number)))) : isNull(col),
    ));
  return affectedRowsOf(res) > 0;
}

/**
 * Liberta o claim de um efeito que falhou (email não aceite, nota que o
 * Guesty recusou, reembolso que deu erro): a passagem seguinte tenta outra
 * vez. Só para efeitos cujo falhanço é certo; um resultado ambíguo fica com o
 * claim (expira sozinho passados 30 min).
 */
export async function releaseEffect(id: string, column: BalanceEffectColumn): Promise<void> {
  if (!BALANCE_EFFECT_COLUMNS.includes(column)) throw new Error(`Coluna de efeito inválida: ${column}`);
  const db = await getDb();
  if (!db) return;
  await db.update(sp).set({ [column]: null } as Partial<InsertCheckoutScheduledPayment>).where(eq(sp.id, id));
}

/**
 * Depois de o hóspede autorizar um cartão novo numa linha que já falhou:
 * volta à cobrança automática dentro de minutos, no cartão novo (é o que a
 * autorização dele diz: "cobrar hoje neste novo cartão"). Só antes de H.
 */
export async function requeueAfterCardChange(id: string, nextAttemptAt: Date): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ status: "retry", nextAttemptAt, lastDeclineCode: null, lastError: null })
    .where(and(eq(sp.id, id), inArray(sp.status, ["retry", "needs_action"]), gt(sp.hardStopAt, nextAttemptAt)));
  return affectedRowsOf(res) > 0;
}

/** Marca de 1.ª parte registada no Guesty (settle): a partir daqui o total do
 *  folio serve de referência para detetar alterações. */
export async function markGuestyDepositRecordedByIntent(intentId: string, now: Date): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(sp).set({ guestyDepositRecordedAt: now }).where(and(eq(sp.intentId, intentId), isNull(sp.guestyDepositRecordedAt)));
}

/** Saldo registado no Guesty. O primeiro registo é o que vale: false quer
 *  dizer que já estava marcado. */
export async function markGuestyBalanceRecorded(id: string, now: Date): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ guestyBalanceRecordedAt: now })
    .where(and(eq(sp.id, id), isNull(sp.guestyBalanceRecordedAt)));
  return affectedRowsOf(res) > 0;
}

/** Reserva cancelada no Guesty. false quer dizer que já estava marcado. */
export async function markGuestyCancelled(id: string, now: Date): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ guestyCancelledAt: now })
    .where(and(eq(sp.id, id), isNull(sp.guestyCancelledAt)));
  return affectedRowsOf(res) > 0;
}

/**
 * Resultado do reembolso. Um resultado sem reembolso (refundId null, o
 * remanescente já era 0) só se grava se a linha ainda não tiver um: uma
 * repetição do passo depois de um reembolso verdadeiro não pode apagar o
 * id nem pôr o valor a 0 (o E5 dizia "devolvemos 0 €"). false nesse caso.
 */
export async function markRefund(
  id: string,
  p: { refundId: string | null; refundCents: number; refundStatus: string },
): Promise<boolean> {
  assertIntegerCents(p.refundCents, "refundCents");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ refundId: p.refundId, refundCents: p.refundCents, refundStatus: optionalText(p.refundStatus, 32) })
    .where(and(eq(sp.id, id), ...(p.refundId ? [] : [isNull(sp.refundId)])));
  return affectedRowsOf(res) > 0;
}

/**
 * refund.failed da Stripe (spec 3.1 #13). Numa linha com dois reembolsos (1.ª
 * e 2.ª parte) podem falhar os dois: o valor por resolver é a soma das falhas
 * e refund_id guarda os ids separados por vírgula. Um evento repetido (a
 * Stripe reenvia depois de um 500) não muda nada, nem desfaz um "manual" que
 * o CS já gravou para essa falha; uma falha nova depois do "manual" volta a
 * abrir a linha só com o valor novo. A escrita é condicional ao que foi lido:
 * "conflict" quando outra escrita passou entretanto (o webhook responde 500 e
 * a Stripe reenvia).
 */
export async function markRefundFailed(
  id: string,
  p: { refundId: string; refundCents: number },
): Promise<"marked" | "unchanged" | "missing" | "conflict"> {
  assertIntegerCents(p.refundCents, "refundCents");
  const db = await getDb();
  if (!db) throw new Error("BD indisponível");
  const [row] = await db
    .select({ refundId: sp.refundId, refundCents: sp.refundCents, refundStatus: sp.refundStatus })
    .from(sp)
    .where(eq(sp.id, id))
    .limit(1);
  if (!row) return "missing";
  const known = String(row.refundId ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if ((row.refundStatus === "failed" || row.refundStatus === "manual") && known.includes(p.refundId)) return "unchanged";
  const accumulate = row.refundStatus === "failed";
  const joined = accumulate ? [...known, p.refundId].join(",") : p.refundId;
  const res = await db
    .update(sp)
    .set({
      refundId: joined.length <= 64 ? joined : p.refundId,
      refundCents: accumulate ? Number(row.refundCents ?? 0) + p.refundCents : p.refundCents,
      refundStatus: "failed",
    })
    .where(and(
      eq(sp.id, id),
      row.refundId == null ? isNull(sp.refundId) : eq(sp.refundId, row.refundId),
      row.refundStatus == null ? isNull(sp.refundStatus) : eq(sp.refundStatus, row.refundStatus),
    ));
  return affectedRowsOf(res) > 0 ? "marked" : "conflict";
}

/**
 * Reembolso falhado resolvido à mão pelo CS (transferência, por exemplo;
 * spec 3.1 #13: sem nova tentativa automática): refund_status de um valor de
 * falha passa a "manual" e a linha sai de "REEMBOLSOS POR RESOLVER". Só a
 * partir de uma falha: nunca por cima de um reembolso feito, em curso ou
 * sem nada a devolver. A referência fica no registo da ação do admin.
 */
export async function markRefundManual(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ refundStatus: "manual" })
    .where(and(eq(sp.id, id), isNotNull(sp.refundStatus), notInArray(sp.refundStatus, REFUND_SETTLED)));
  return affectedRowsOf(res) > 0;
}

/** Fim do hard stop: cancelada pela PA por falta de pagamento. */
export async function markCancelledUnpaid(id: string, now: Date): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ status: "cancelled_unpaid", cancelledAt: now })
    .where(and(eq(sp.id, id), eq(sp.status, "cancelling")));
  return affectedRowsOf(res) > 0;
}

/** Fim do cancelamento pelo hóspede (link ou Guesty). */
export async function markCancelledByGuest(id: string, now: Date): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ status: "cancelled_by_guest", cancelledAt: now })
    .where(and(eq(sp.id, id), eq(sp.status, "cancelling")));
  return affectedRowsOf(res) > 0;
}

/** Saldos cobrados com passos de pós-cobrança por fazer (registo Guesty,
 *  nota, E4): ficam no digest até fecharem. */
export async function listPostChargeIncomplete(scope: BalanceScope): Promise<CheckoutScheduledPayment[]> {
  const where = scopeConditions(scope);
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sp)
    .where(and(
      ...where,
      eq(sp.status, "succeeded"),
      or(isNull(sp.guestyBalanceRecordedAt), isNull(sp.noteClaimedAt), isNull(sp.emailPaidClaimedAt)),
    ))
    .orderBy(asc(sp.succeededAt));
}

/**
 * Linhas a reconciliar com o Guesty: as que têm ação (cobrança ou H) até
 * actionBefore e, uma vez por dia, todas as abertas (nunca reconciliadas
 * ou reconciliadas antes de staleBefore). Primeiro as reconciliadas há
 * mais tempo (NULL primeiro no MySQL), para nenhuma ficar sempre de fora
 * do limite.
 */
export async function listForReconciliation(
  scope: BalanceScope,
  p: { actionBefore: Date; staleBefore: Date; limit?: number },
): Promise<CheckoutScheduledPayment[]> {
  const where = scopeConditions(scope);
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sp)
    .where(and(
      ...where,
      inArray(sp.status, ["scheduled", "retry", "needs_action", "needs_review"]),
      or(
        lte(sp.nextAttemptAt, p.actionBefore),
        lte(sp.hardStopAt, p.actionBefore),
        isNull(sp.lastReconciledAt),
        lt(sp.lastReconciledAt, p.staleBefore),
      ),
    ))
    .orderBy(asc(sp.lastReconciledAt), asc(sp.nextAttemptAt))
    .limit(p.limit ?? 100);
}

/**
 * Grava a leitura do Guesty e last_reconciled_at = now. Com snap.error
 * preenchido a leitura falhou: guarda só o erro (como markReconcileError) e
 * deixa a última fotografia válida e last_reconciled_at como estavam.
 * Gravar NULLs por cima apagava o total de referência com que se detetam
 * alterações no Guesty, e um last_reconciled_at novo escondia durante um
 * dia uma reserva que já não se consegue ler (spec 3.1 ponto 4: nunca se
 * age sem leitura válida e alerta-se ao fim de seis horas).
 */
export async function applyReconciliation(
  id: string,
  snap: BalanceReconciliationSnapshot,
  now: Date,
): Promise<boolean> {
  if (snap.error != null && String(snap.error).trim()) return markReconcileError(id, String(snap.error));
  const totalCents = snapshotCents(snap.guestyTotalCents, "guestyTotalCents");
  const totalPaidCents = snapshotCents(snap.guestyTotalPaidCents, "guestyTotalPaidCents");
  const pendingForeignCents = snapshotCents(snap.guestyPendingForeignCents, "guestyPendingForeignCents");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({
      guestyStatus: optionalText(snap.guestyStatus, 32),
      guestyCheckIn: optionalText(snap.guestyCheckIn, 10),
      guestyCheckOut: optionalText(snap.guestyCheckOut, 10),
      guestyListingId: optionalText(snap.guestyListingId, 64),
      guestyTotalCents: totalCents,
      guestyTotalPaidCents: totalPaidCents,
      guestyPendingForeignCents: pendingForeignCents,
      lastReconciledAt: now,
      lastReconcileError: null,
    })
    .where(eq(sp.id, id));
  return affectedRowsOf(res) > 0;
}

/** Leitura do Guesty falhada (acrescento ao contrato): guarda só o erro,
 *  sem tocar em last_reconciled_at nem na última fotografia válida, para o
 *  "adia 1 h, alerta ao fim de 6" (spec 3.1 ponto 4) contar desde a última
 *  leitura boa. */
export async function markReconcileError(id: string, error: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ lastReconcileError: truncateChars(String(error ?? "") || "erro desconhecido", 500) })
    .where(eq(sp.id, id));
  return affectedRowsOf(res) > 0;
}

/** Linha por id, ou null sem BD ou sem linha. Erro de BD propaga. */
export async function getScheduledPaymentById(id: string): Promise<CheckoutScheduledPayment | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(sp).where(eq(sp.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Linha dona de um PI de saldo (o do sweep ou o do hóspede). Duas linhas
 *  com o mesmo PI lança: uma ligação ambígua nunca escolhe um pagamento. */
export async function getScheduledPaymentByBalancePi(piId: string): Promise<CheckoutScheduledPayment | null> {
  if (!piId) return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(sp)
    .where(or(eq(sp.balancePaymentIntentId, piId), eq(sp.guestPaymentIntentId, piId)))
    .limit(2);
  if (rows.length > 1) throw new Error(`PI ${piId} ligado a mais de uma linha de saldo`);
  return rows[0] ?? null;
}

function emptyBalanceCounts(): Record<ScheduledPaymentStatus, number> {
  return Object.fromEntries(sp.status.enumValues.map((s) => [s, 0])) as Record<ScheduledPaymentStatus, number>;
}

/**
 * Dados do digest diário (spec 3.3) para um scope. Sem limites nas listas:
 * o digest repete todas as exceções abertas até fecharem, e cortar em
 * silêncio era esconder uma. Erro de BD propaga, para o digest não sair
 * a dizer "nada a fazer" quando não conseguiu ler.
 */
export async function listBalanceDigest(scope: BalanceScope, now: Date): Promise<BalanceDigest> {
  const where = scopeConditions(scope);
  const db = await getDb();
  const counts = emptyBalanceCounts();
  if (!db) {
    return {
      counts, upcoming7d: [], failing: [], review: [], cancelled24h: [],
      postChargeIncomplete: [], stuckCharging: [], stuckCancelling: [], refundFailures: [],
    };
  }
  const grouped = await db
    .select({ status: sp.status, n: sql<number>`count(*)` })
    .from(sp)
    .where(and(...where))
    .groupBy(sp.status);
  for (const g of grouped) counts[g.status] = Number(g.n);

  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const upcoming7d = await db
    .select().from(sp)
    .where(and(...where, eq(sp.status, "scheduled"), lte(sp.chargeAt, in7d)))
    .orderBy(asc(sp.chargeAt));
  const failing = await db
    .select().from(sp)
    .where(and(...where, inArray(sp.status, ["retry", "needs_action"])))
    .orderBy(asc(sp.hardStopAt));
  const review = await db
    .select().from(sp)
    .where(and(...where, eq(sp.status, "needs_review")))
    .orderBy(asc(sp.reviewDueAt));
  const cancelled24h = await db
    .select().from(sp)
    .where(and(...where, inArray(sp.status, ["cancelled_unpaid", "cancelled_by_guest"]), gte(sp.cancelledAt, dayAgo)))
    .orderBy(desc(sp.cancelledAt));
  const postChargeIncomplete = await listPostChargeIncomplete(scope);
  const stuckCharging = await listStuckCharging(scope, new Date(now.getTime() - STUCK_AFTER_MS));
  // cancelling não grava claimed_at; updated_at muda em cada passo do
  // cancelamento (ON UPDATE CURRENT_TIMESTAMP). É um timestamp no fuso da
  // sessão, por isso compara-se com o relógio da própria BD e não com now.
  const stuckCancelling = await db
    .select().from(sp)
    .where(and(...where, eq(sp.status, "cancelling"), sql`${sp.updatedAt} < (CURRENT_TIMESTAMP - INTERVAL 30 MINUTE)`))
    .orderBy(asc(sp.updatedAt));
  // Reembolsos falhados por resolver, de qualquer idade e em qualquer estado:
  // o refund.failed chega muitas vezes dias depois de a linha fechar.
  const refundFailures = await db
    .select().from(sp)
    .where(and(...where, isNotNull(sp.refundStatus), notInArray(sp.refundStatus, REFUND_SETTLED)))
    .orderBy(asc(sp.cancelledAt));
  return { counts, upcoming7d, failing, review, cancelled24h, postChargeIncomplete, stuckCharging, stuckCancelling, refundFailures };
}

/* Heartbeat do sweep (spec 3.1 ponto 8): o GET /api/health/balance-scheduler
   lê-o e um monitor externo avisa se parar. Vive na app_config, a mesma
   tabela chave/valor do segredo do webhook (stripe-card-webhook-setup.ts). */
const BALANCE_HEARTBEAT_KEY = "balance_sweep_last_run_at";
/** O mesmo DDL de stripe-card-webhook-setup.ts: esse só cria a tabela
 *  quando auto-regista o webhook, e com o segredo na env nunca a cria. */
const APP_CONFIG_DDL =
  "CREATE TABLE IF NOT EXISTS `app_config` (`k` varchar(128) NOT NULL PRIMARY KEY, `v` text NOT NULL, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)";

/** A BD é partilhada com o DEV: um sweep de teste (scope com livemode
 *  false) escreve noutra chave e nunca refresca o heartbeat que o monitor
 *  de produção lê. Sem scope, a chave do contrato. */
function balanceHeartbeatKey(scope?: BalanceScope): string {
  return scope && scope.livemode === false ? `${BALANCE_HEARTBEAT_KEY}_test` : BALANCE_HEARTBEAT_KEY;
}

function isNoSuchTableError(err: any): boolean {
  const driver = err?.cause ?? err;
  return driver?.code === "ER_NO_SUCH_TABLE" || driver?.errno === 1146;
}

/** Fim de uma passagem do sweep. Nunca lança: o sweep já fez o trabalho;
 *  se a escrita falhar, o monitor externo dá pela falta, que é o que se
 *  quer. true só se gravou. */
export async function setBalanceHeartbeat(now: Date, scope?: BalanceScope): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const key = balanceHeartbeatKey(scope);
  const write = () =>
    db.execute(sql`INSERT INTO \`app_config\` (\`k\`, \`v\`) VALUES (${key}, ${now.toISOString()}) ON DUPLICATE KEY UPDATE \`v\` = VALUES(\`v\`)`);
  try {
    await write();
    return true;
  } catch (error) {
    if (!isNoSuchTableError(error)) {
      console.error("[Database] setBalanceHeartbeat failed:", error);
      return false;
    }
  }
  try {
    await db.execute(sql.raw(APP_CONFIG_DDL));
    await write();
    return true;
  } catch (error) {
    console.error("[Database] setBalanceHeartbeat failed after creating app_config:", error);
    return false;
  }
}

/** Última passagem do sweep, ou null (nunca correu, sem BD, valor
 *  ilegível ou erro). Nunca lança: null faz o health check falhar, que é
 *  a direção segura. */
export async function getBalanceHeartbeat(scope?: BalanceScope): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const res: any = await db.execute(
      sql`SELECT \`v\` FROM \`app_config\` WHERE \`k\` = ${balanceHeartbeatKey(scope)} LIMIT 1`,
    );
    const rows = Array.isArray(res) ? res[0] : res;
    const raw = Array.isArray(rows) ? rows[0]?.v : undefined;
    if (raw == null) return null;
    const at = new Date(String(raw));
    return Number.isNaN(at.getTime()) ? null : at;
  } catch (error) {
    if (!isNoSuchTableError(error)) console.error("[Database] getBalanceHeartbeat failed:", error);
    return null;
  }
}

/* ── Fase 2c: ecrã "Saldos" do CS (routers/balance-admin.ts) ─────────
   Spec 3.2, 3.4 e 5.12. As regras da Fase 2a valem aqui também: scope em
   todas as listas, transições por UPDATE condicional, erro de BD propaga e
   false quer dizer só "a linha não estava no estado esperado". A exceção é
   o registo das ações: lança também sem BD, porque o router só age depois
   de o registo ter ficado gravado (sem registo, a ação não se faz). */

/** Estados de onde o CS pode pausar: os por pagar e uma revisão já aberta
 *  (para alargar ou encurtar a pausa). Nunca charging: há uma cobrança a
 *  meio e o caminho das presas resolve-a primeiro, lendo o PI. */
const ADMIN_PAUSABLE: ScheduledPaymentStatus[] = ["scheduled", "retry", "needs_action", "needs_review"];
/** A nota de crédito só existe depois de um reembolso, ou seja, de um cancelamento. */
const CREDIT_NOTE_STATUSES: ScheduledPaymentStatus[] = ["cancelling", "cancelled_unpaid", "cancelled_by_guest"];
const ADMIN_LIST_DEFAULT = 200;
const ADMIN_LIST_MAX = 500;

/**
 * Linhas do ecrã Saldos, do ambiente deste processo (scope). Primeiro as
 * que esperam por alguém (needs_review e needs_action), depois por data da
 * 2.ª cobrança: o CS abre o ecrã e vê em cima o que tem de decidir. Um
 * estado desconhecido no filtro lança em vez de ser ignorado: um filtro
 * que deixasse de filtrar mostrava tudo como se fosse a resposta pedida.
 */
export async function listScheduledPaymentsForAdmin(
  scope: BalanceScope,
  opts: { statuses?: readonly string[]; limit?: number } = {},
): Promise<CheckoutScheduledPayment[]> {
  const where = scopeConditions(scope);
  const known = new Set<string>(sp.status.enumValues);
  const statuses = opts.statuses?.length ? Array.from(new Set(opts.statuses)) : null;
  const unknown = statuses?.filter((s) => !known.has(s)) ?? [];
  if (unknown.length) throw new Error(`Estado desconhecido no filtro: ${unknown.join(", ")}`);
  const requested = Number.isFinite(opts.limit) ? Math.floor(opts.limit as number) : ADMIN_LIST_DEFAULT;
  const limit = Math.min(Math.max(requested, 1), ADMIN_LIST_MAX);
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(sp)
    .where(and(...where, ...(statuses ? [inArray(sp.status, statuses as ScheduledPaymentStatus[])] : [])))
    .orderBy(
      sql`case when ${sp.status} in ('needs_review', 'needs_action') then 0 else 1 end`,
      asc(sp.chargeAt),
    )
    .limit(limit);
}

/** Contagem por estado no scope, para os filtros do ecrã (todas as linhas,
 *  não só as da página, para um número nunca esconder linhas cortadas). */
export async function countScheduledPaymentsForAdmin(scope: BalanceScope): Promise<Record<ScheduledPaymentStatus, number>> {
  const where = scopeConditions(scope);
  const counts = emptyBalanceCounts();
  const db = await getDb();
  if (!db) return counts;
  const grouped = await db
    .select({ status: sp.status, n: sql<number>`count(*)` })
    .from(sp)
    .where(and(...where))
    .groupBy(sp.status);
  for (const g of grouped) counts[g.status] = Number(g.n);
  return counts;
}

/**
 * Regista uma ação do CS, antes de a ação correr. Lança sem BD e com
 * qualquer erro: quem chama não pode avançar sem o registo gravado. O
 * created_at vai explícito (o mesmo instante UTC que o resto do motor usa):
 * o DEFAULT do MySQL seria a hora da sessão, lida depois como UTC.
 */
export async function insertAdminAction(row: InsertCheckoutAdminAction): Promise<void> {
  if (!row?.id || !row.scheduledPaymentId) throw new Error("insertAdminAction sem id ou sem linha de saldo");
  const action = String(row.action ?? "").trim();
  if (!action || action.length > 40) throw new Error(`Ação inválida no registo: "${action}"`);
  const db = await getDb();
  if (!db) throw new Error("Cannot record admin action without database");
  await db.insert(checkoutAdminActions).values({
    ...row,
    action,
    userEmail: row.userEmail ? truncateChars(String(row.userEmail), 320) : null,
    createdAt: row.createdAt ?? new Date(),
  });
}

/**
 * Acrescenta o resultado ao registo de uma ação já feita (substitui o
 * details pelo objeto completo, que quem chama ainda tem em memória). Nunca
 * lança: a ação já correu e o registo do pedido já existe; um resultado por
 * gravar não pode fazer o CS julgar que nada aconteceu e repetir. true só
 * se gravou.
 */
export async function setAdminActionResult(id: string, details: Record<string, unknown>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    const res = await db.update(checkoutAdminActions).set({ details }).where(eq(checkoutAdminActions.id, id));
    return affectedRowsOf(res) > 0;
  } catch (error) {
    console.error("[Database] setAdminActionResult failed:", error);
    return false;
  }
}

/** Histórico de uma linha, o mais recente primeiro. Erro de BD propaga: um
 *  histórico vazio por falha passava por "ninguém mexeu nesta linha". */
export async function listAdminActions(scheduledPaymentId: string, limit = 200): Promise<CheckoutAdminAction[]> {
  if (!scheduledPaymentId) return [];
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(checkoutAdminActions)
    .where(eq(checkoutAdminActions.scheduledPaymentId, scheduledPaymentId))
    .orderBy(desc(checkoutAdminActions.createdAt))
    .limit(Math.min(Math.max(Math.floor(limit), 1), 500));
}

/**
 * "Retomar" no ecrã Saldos: needs_review → automação outra vez.
 * - Antes de C: scheduled, com next_attempt_at = charge_at (cobra na data
 *   que o hóspede autorizou, nunca antes).
 * - Entre C e H: `pastChargeStatus` com next_attempt_at = now. O contrato
 *   diz retry; quem chama passa scheduled quando nunca houve tentativa
 *   (retry quer dizer "recusa soft" e faria sair o aviso de falha E3 sem
 *   nenhuma falha; scheduled vencida cobra na passagem seguinte na mesma).
 * - `holdForGuest` (acrescento ao contrato): a última recusa foi hard ou
 *   3DS. Volta a needs_action, antes ou depois de C: repetir sozinho um
 *   cartão recusado de vez é proibido pelas redes, e só o hóspede resolve
 *   (pagar ou trocar de cartão pelo link). O hard stop continua a valer.
 * - Em H ou depois: null. Depois de H nunca se cobra; só cancelar e
 *   devolver, ou marcar pago fora.
 * Limpa a pausa e o motivo da revisão: um humano decidiu, e uma pausa
 * futura deixada na linha travava a cobrança em silêncio (notHelpPaused).
 * O motivo anterior fica no registo da ação. Devolve o estado novo, ou null
 * se a linha já não estava em needs_review ou se H já passou.
 */
export async function adminResume(
  id: string,
  now: Date,
  opts: { pastChargeStatus?: "retry" | "scheduled"; holdForGuest?: boolean } = {},
): Promise<"scheduled" | "retry" | "needs_action" | null> {
  const past = opts.pastChargeStatus ?? "retry";
  if (past !== "retry" && past !== "scheduled") throw new Error(`adminResume para estado inválido: ${past}`);
  const db = await getDb();
  if (!db) return null;
  const cleared = { helpPausedUntil: null, reviewReason: null, reviewDueAt: null };
  if (opts.holdForGuest) {
    const held = await db
      .update(sp)
      .set({ status: "needs_action", nextAttemptAt: now, ...cleared })
      .where(and(eq(sp.id, id), eq(sp.status, "needs_review"), gt(sp.hardStopAt, now)));
    return affectedRowsOf(held) > 0 ? "needs_action" : null;
  }
  const before = await db
    .update(sp)
    .set({ status: "scheduled", nextAttemptAt: sql`${sp.chargeAt}`, ...cleared })
    .where(and(eq(sp.id, id), eq(sp.status, "needs_review"), gt(sp.chargeAt, now), gt(sp.hardStopAt, now)));
  if (affectedRowsOf(before) > 0) return "scheduled";
  const after = await db
    .update(sp)
    .set({ status: past, nextAttemptAt: now, ...cleared })
    .where(and(eq(sp.id, id), eq(sp.status, "needs_review"), lte(sp.chargeAt, now), gt(sp.hardStopAt, now)));
  return affectedRowsOf(after) > 0 ? past : null;
}

/**
 * "Pausar até data" pelo CS: → needs_review com help_paused_until e prazo
 * de revisão nessa data. Também a partir de needs_review (alargar ou
 * encurtar). Em needs_review nada é cobrado nem cancelado sozinho, e no fim
 * da pausa a linha não volta sozinha: o digest mostra-a até alguém decidir.
 * O limite da data (nunca depois do fim do cancelamento gratuito) é de
 * quem chama, que tem o D da linha.
 */
export async function adminPause(id: string, until: Date, reason: string): Promise<boolean> {
  if (!(until instanceof Date) || !Number.isFinite(until.getTime())) throw new Error("adminPause sem data válida");
  const db = await getDb();
  if (!db) return false;
  const text = truncateChars(String(reason ?? "").trim() || "pausa pedida no ecrã Saldos", 120);
  const res = await db
    .update(sp)
    .set({ status: "needs_review", helpPausedUntil: until, reviewReason: text, reviewDueAt: until })
    .where(and(eq(sp.id, id), inArray(sp.status, ADMIN_PAUSABLE)));
  return affectedRowsOf(res) > 0;
}

/** Número da nota de crédito emitida (spec 5.13): só em linhas canceladas
 *  ou a cancelar, e entra no E5/E7 se o email ainda não saiu. */
export async function markCreditNote(id: string, ref: string): Promise<boolean> {
  const text = String(ref ?? "").trim();
  if (!text) throw new Error("markCreditNote exige o número da nota de crédito");
  const db = await getDb();
  if (!db) return false;
  const res = await db
    .update(sp)
    .set({ creditNoteRef: truncateChars(text, 64), creditNoteDue: false })
    .where(and(eq(sp.id, id), inArray(sp.status, CREDIT_NOTE_STATUSES)));
  return affectedRowsOf(res) > 0;
}

/** Store validated field Core Web Vitals rows (server/routes/vitals.ts). */
export async function insertWebVitals(rows: InsertWebVital[]): Promise<void> {
  const db = await getDb();
  if (!db || !rows.length) return;
  await db.insert(webVitals).values(rows);
}
