/**
 * tRPC: newsletter.config (public, read-only) and newsletter.subscribe
 * (public mutation). The rules live in ../services/newsletter.ts; this file
 * only wires the request to them.
 *
 * Rate limit: server/_core/index.ts applies the leadLimiter to
 * /api/trpc/newsletter.subscribe. The client calls the mutation alone (never
 * in a tRPC batch), otherwise the per-path limiter would not see it.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getPropertiesForSite } from "../services/properties-store";
import { getDisplayName } from "@shared/displayName";
import { NL_POPUP_COOLDOWN_DAYS, NL_POPUP_SCROLL_PCT } from "@shared/newsletterPopup";
import {
  NEWSLETTER_ORIGINS,
  PENDING_REUSE_MS,
  brevoAttributes,
  confirmUrl,
  createDoiContact,
  isNewsletterConfigured,
  isNewsletterEnabled,
  isProxyEmail,
  newsletterLocales,
  normaliseEmail,
  pendingSource,
  popupDelayMs,
} from "../services/newsletter";

const subscribeInput = z.object({
  email: z.string().trim().max(320).email(),
  /** i18n.language, two letters */
  locale: z.string().trim().min(2).max(5),
  origin: z.enum(NEWSLETTER_ORIGINS),
  /** pathname without the language prefix */
  page: z.string().max(200).default("/"),
  propertySlug: z.string().max(255).optional(),
  /** Consent is explicit: the checkbox starts unchecked and the server refuses anything else. */
  consent: z.literal(true),
  /** Honeypot: humans never fill it. */
  hp: z.string().max(200).optional(),
});

/** Never trust a house name from the browser: resolve it by slug on the server. */
async function resolveHouse(slug: string | undefined): Promise<{ name: string; listingId: string; slug: string } | null> {
  if (!slug) return null;
  try {
    const props = await getPropertiesForSite();
    const hit = props.find((p: any) => p?.slug === slug);
    if (!hit) return null;
    return { name: getDisplayName(hit), listingId: String(hit.guestyId || hit.listingId || hit.id || ""), slug };
  } catch {
    return null;
  }
}

export const newsletterRouter = router({
  config: publicProcedure.query(() => ({
    enabled: isNewsletterEnabled(),
    locales: newsletterLocales(),
    popup: { delayMs: popupDelayMs(), scrollPct: NL_POPUP_SCROLL_PCT, cooldownDays: NL_POPUP_COOLDOWN_DAYS },
  })),

  subscribe: publicProcedure.input(subscribeInput).mutation(async ({ input, ctx }) => {
    // Honeypot filled: a bot. Same answer as a success, nothing stored.
    if (input.hp) {
      console.info("[Newsletter] honeypot hit, ignored");
      return { ok: true as const };
    }

    // TODO(humano): BREVO_API_KEY (chave própria do site), BREVO_NEWSLETTER_LIST_ID and
    // BREVO_DOI_TEMPLATE_ID_PT in Render Production. Until then the endpoint answers 503.
    if (!isNewsletterConfigured()) {
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "NEWSLETTER_NOT_CONFIGURED: set BREVO_API_KEY, BREVO_NEWSLETTER_LIST_ID and BREVO_DOI_TEMPLATE_ID_PT",
      });
    }

    const email = normaliseEmail(input.email);
    if (isProxyEmail(email)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "PROXY_EMAIL" });
    }

    const locale = input.locale.slice(0, 2).toLowerCase();
    const house = await resolveHouse(input.propertySlug);
    const country = String(ctx.req?.headers?.["cf-ipcountry"] ?? "")
      .toUpperCase()
      .slice(0, 2);
    const now = new Date().toISOString();

    let leadId: number;
    let subscribedAt = now;
    try {
      const pending = await db.findPendingNewsletterLead(email, input.origin, PENDING_REUSE_MS);
      if (pending) {
        leadId = pending.id;
        subscribedAt = pending.metadata?.consentAt || new Date(pending.createdAt).toISOString();
      } else {
        const created = await db.createLead({
          email,
          source: pendingSource(input.origin),
          metadata: {
            locale,
            origin: input.origin,
            page: input.page.slice(0, 200),
            propertySlug: house?.slug ?? "",
            propertyName: house?.name ?? "",
            listingId: house?.listingId ?? "",
            country,
            consent: "true",
            consentAt: now,
          },
        });
        leadId = created.id;
      }
    } catch (err: any) {
      // createLead throws "Database not available" without DATABASE_URL (dev).
      console.error("[Newsletter] could not store the pending lead:", err?.message ?? err);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "NEWSLETTER_STORE_FAILED" });
    }

    const result = await createDoiContact({
      email,
      locale,
      redirectionUrl: confirmUrl(leadId, locale),
      attributes: brevoAttributes({
        locale,
        country,
        origin: input.origin,
        page: input.page,
        propertyName: house?.name,
        listingId: house?.listingId,
        subscribedAt,
      }),
    });

    if (result.ok || result.blocked) {
      // A contact who unsubscribed before gets the same answer: the state is
      // never revealed to the browser. Counted in the log for the daily sync.
      console.info(`[Newsletter] DOI requested for lead #${leadId} origin=${input.origin} lang=${locale}${result.blocked ? " (blocked contact)" : ""}`);
      return { ok: true as const };
    }

    console.warn(`[Newsletter] Brevo DOI failed for lead #${leadId}: status=${result.status} code=${result.code ?? ""}`);
    try {
      const current = await db.getLeadById(leadId);
      await db.updateLead(leadId, { metadata: { ...(current?.metadata || {}), doiError: "1" } });
    } catch {
      /* best effort */
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "NEWSLETTER_DOI_FAILED" });
  }),
});
