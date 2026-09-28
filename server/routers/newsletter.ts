/**
 * tRPC: newsletter.config (public, read-only), newsletter.subscribe and
 * newsletter.interest (public mutations), newsletter.stats (admin). The rules
 * live in ../services/newsletter.ts; this file wires the request to them.
 *
 * Rate limit: server/lib/newsletter-rate-limit.ts, mounted on /api/trpc,
 * applies the lead limiter to any request that names these mutations,
 * batched or not. Per address: at most one confirmation email per hour and
 * three per 24 hours, with the same success answer.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getPropertiesForSite } from "../services/properties-store";
import { sendNewsletterConfirmation } from "../services/transactional-email";
import { parseVisitOriginPayload } from "../services/visit-origin";
import { getDisplayName } from "@shared/displayName";
import { cleanLandingPath } from "@shared/visit-origin";
import {
  NEWSLETTER_DEVICES,
  NEWSLETTER_INTERESTS,
  NEWSLETTER_ORIGINS,
  NEWSLETTER_TRIGGERS,
  consentRecord,
  isNewsletterHouse,
  newsletterLang,
  pageKind,
} from "@shared/newsletter";
import {
  DAY_MS,
  FLOW_VERSION,
  brevoAddConfirmed,
  confirmExpiry,
  confirmUrl,
  decoyRef,
  doiAllowed,
  interestRef,
  isHouseAlertsEnabled,
  isNewsletterAvailable,
  isProxyEmail,
  newsletterConfigPayload,
  normaliseEmail,
  parseInterestRef,
  pendingSource,
  safeErrorLabel,
  visitOriginMetadata,
} from "../services/newsletter";

const subscribeInput = z.object({
  email: z.string().trim().max(320).email(),
  /** i18n.language, two letters */
  locale: z.string().trim().min(2).max(5),
  origin: z.enum(NEWSLETTER_ORIGINS),
  /** Route without the language prefix. Cleaned on the server (no query, ids replaced). */
  page: z.string().max(300).default("/"),
  propertySlug: z.string().max(255).optional(),
  /** Pop-up only: what opened it. */
  trigger: z.enum(NEWSLETTER_TRIGGERS).optional(),
  device: z.enum(NEWSLETTER_DEVICES).optional(),
  /** lib/visitOrigin.ts payload: UTM and click id type, only with the "Aceitar tudo" cookie choice. */
  visitOrigin: z.unknown().optional(),
  /** Honeypot: people never fill it. */
  hp: z.string().max(200).optional(),
});

/**
 * Never trust a house name from the browser: resolve it by slug. Only houses
 * the PA manages (a Guesty id, not a partner home) are recorded as interest.
 */
async function resolveHouse(slug: string | undefined): Promise<{ name: string; listingId: string; slug: string } | null> {
  if (!slug) return null;
  try {
    const props = await getPropertiesForSite();
    const hit = props.find((p: any) => p?.slug === slug);
    if (!hit || !isNewsletterHouse(hit)) return null;
    return { name: getDisplayName(hit), listingId: String((hit as any).guestyId), slug };
  } catch {
    return null;
  }
}

/**
 * Addresses with a sign-up being processed right now. The per-address limit
 * reads the leads table and then writes to it; without this, parallel
 * requests for the same address would all pass the check and each send an
 * email. One server process (Render), so memory is enough.
 */
const inFlight = new Set<string>();

function withoutEmpty(values: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) if (value) out[key] = value;
  return out;
}

type SubscribeInput = z.infer<typeof subscribeInput>;

/** One sign-up, the address already normalised and reserved (see inFlight). */
async function subscribeOne(input: SubscribeInput, email: string, ctx: { req?: { headers?: Record<string, unknown> } }) {
  const locale = newsletterLang(input.locale);
  const now = new Date();
  const nowIso = now.toISOString();

  let sends: number[];
  try {
    sends = await db.recentNewsletterSends(email, DAY_MS);
  } catch (err: unknown) {
    console.error("[Newsletter] could not read previous sign-ups:", safeErrorLabel(err));
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "NEWSLETTER_STORE_FAILED" });
  }
  if (!doiAllowed(sends, now.getTime())) {
    // Same answer as a success, nothing sent: nobody can use the form to
    // flood an address with confirmation emails, nor learn its state.
    console.info(`[Newsletter] confirmation throttled origin=${input.origin}`);
    return { ok: true as const, ref: decoyRef() };
  }

  const page = cleanLandingPath(input.page) || "/";
  const house = await resolveHouse(input.propertySlug);
  const consent = consentRecord(locale);
  const country = String(ctx.req?.headers?.["cf-ipcountry"] ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  const visit = input.visitOrigin === undefined ? null : parseVisitOriginPayload(input.visitOrigin, now);

  let leadId: number;
  try {
    const created = await db.createLead({
      email,
      source: pendingSource(input.origin),
      metadata: {
        ...withoutEmpty({
          flow: FLOW_VERSION,
          origin: input.origin,
          locale,
          page,
          pageKind: pageKind(page),
          trigger: input.origin === "popup" ? input.trigger : undefined,
          device: input.device,
          propertySlug: house?.slug,
          propertyName: house?.name,
          listingId: house?.listingId,
          // The form promised an alert for this house (house page with the
          // alert version on): the CRM owes this subscriber that email.
          alertListingId: house && isHouseAlertsEnabled() ? house.listingId : undefined,
          country,
          consent: "true",
          consentAt: nowIso,
          consentVersion: consent.version,
          consentText: consent.text,
        }),
        ...visitOriginMetadata(visit),
      },
    });
    leadId = created.id;
  } catch (err: unknown) {
    // createLead throws "Database not available" without DATABASE_URL (dev).
    console.error("[Newsletter] could not store the pending lead:", safeErrorLabel(err));
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "NEWSLETTER_STORE_FAILED" });
  }

  try {
    await sendNewsletterConfirmation({
      email,
      locale,
      leadId,
      confirmUrl: confirmUrl(leadId, locale, confirmExpiry(now.getTime())),
      houseName: house?.name,
    });
  } catch (err: unknown) {
    console.error(`[Newsletter] confirmation email failed for lead #${leadId}:`, safeErrorLabel(err));
    try {
      await db.markNewsletterSendFailed(leadId);
    } catch {
      /* best effort */
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "NEWSLETTER_SEND_FAILED" });
  }

  console.info(`[Newsletter] confirmation sent for lead #${leadId} origin=${input.origin} lang=${locale}`);
  return { ok: true as const, ref: interestRef(leadId) };
}

export const newsletterRouter = router({
  /** What the forms may do here (services/newsletter.ts); the server render seeds the same answer. */
  config: publicProcedure.query(() => newsletterConfigPayload()),

  subscribe: publicProcedure.input(subscribeInput).mutation(async ({ input, ctx }) => {
    // Honeypot filled: a bot. Same answer as a success, nothing stored or sent.
    if (input.hp) {
      console.info("[Newsletter] honeypot hit, ignored");
      return { ok: true as const, ref: decoyRef() };
    }
    if (!isNewsletterAvailable()) {
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "NEWSLETTER_UNAVAILABLE" });
    }

    const email = normaliseEmail(input.email);
    if (isProxyEmail(email)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROXY_EMAIL" });

    if (inFlight.has(email)) {
      console.info(`[Newsletter] parallel sign-up for the same address ignored origin=${input.origin}`);
      return { ok: true as const, ref: decoyRef() };
    }
    inFlight.add(email);
    try {
      return await subscribeOne(input, email, ctx);
    } finally {
      inFlight.delete(email);
    }
  }),
  /** The optional question after subscribing. Always answers ok: a wrong reference learns nothing. */
  interest: publicProcedure
    .input(z.object({ ref: z.string().max(80), interest: z.enum(NEWSLETTER_INTERESTS) }))
    .mutation(async ({ input }) => {
      const leadId = parseInterestRef(input.ref);
      if (!leadId) return { ok: true as const };
      try {
        const lead = await db.setNewsletterInterest(leadId, input.interest, new Date().toISOString());
        if (lead && lead.source.startsWith("newsletter-")) {
          const result = await brevoAddConfirmed(lead.email, lead.metadata || {});
          if (result && !result.ok) console.warn(`[Newsletter] Brevo update failed for lead #${leadId}: status=${result.status}`);
        }
      } catch (err: unknown) {
        console.error(`[Newsletter] interest not stored for lead #${leadId}:`, safeErrorLabel(err));
      }
      return { ok: true as const };
    }),

  /**
   * Learning: sign-ups of the last `days` by origin and state (pending,
   * confirmed, left, expired), trigger, device, page, campaign source and
   * interest. Admin only; shown on /admin/leads. Counts only.
   */
  stats: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }).optional())
    .query(({ input }) => db.newsletterFunnel(input?.days ?? 30)),
});
