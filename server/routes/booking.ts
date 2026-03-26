import type { Express, Request, Response } from "express";
import express from "express";
import crypto from "node:crypto";
import { cacheManager } from "../lib/cacheManager";
import { guestyClient, GuestyClientError } from "../lib/guesty";
import { getPropertiesForSite } from "../services/properties-store";

const TTL_LISTING_MS = 6 * 60 * 60 * 1000;
const TTL_CALENDAR_MS = 60 * 1000;

function toIsoDate(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function mapGuestyError(err: unknown, res: Response): void {
  if (err instanceof GuestyClientError) {
    if (err.status === 409) {
      res.status(409).json({
        message: "Estas datas ja nao estao disponiveis.",
        code: "DATES_UNAVAILABLE",
        details: err.details,
      });
      return;
    }

    if (err.status === 422) {
      res.status(422).json({
        message: "Alguns dados nao sao validos.",
        code: "VALIDATION_ERROR",
        details: err.details,
      });
      return;
    }

    if (err.status === 429) {
      res.status(429).json({
        message: "O servico de reservas esta temporariamente sobrecarregado. Aguarde 1-2 minutos e tente novamente.",
        code: "RATE_LIMITED",
      });
      return;
    }

    res.status(500).json({
      message: "Falha de comunicacao com o Guesty.",
      code: "GUESTY_ERROR",
      details: err.details,
    });
    return;
  }

  res.status(500).json({
    message: "Erro inesperado.",
    code: "INTERNAL_ERROR",
  });
}

function classifyRatePlan(name: string, cancellationPolicy?: string[]): "flexible" | "non_refundable" | "other" {
  const hay = `${name} ${(cancellationPolicy || []).join(" ")}`.toLowerCase();
  if (hay.includes("non-refundable") || hay.includes("nao reembols") || hay.includes("não reembols")) {
    return "non_refundable";
  }
  if (hay.includes("flex") || hay.includes("free cancellation") || hay.includes("cancel")) {
    return "flexible";
  }
  return "other";
}

function parseGuestCounts(input: unknown): { adultsCount: number; childrenCount: number; guestsCount: number } {
  const adultsCount = Math.max(1, Number(input && (input as any).adultsCount ? (input as any).adultsCount : 1));
  const childrenCount = Math.max(0, Number(input && (input as any).childrenCount ? (input as any).childrenCount : 0));
  const guestsCount = adultsCount + childrenCount;
  return { adultsCount, childrenCount, guestsCount };
}

function buildGoogleCalendarLink(input: {
  title: string;
  checkIn: string;
  checkOut: string;
  description: string;
  location?: string;
}): string {
  const start = input.checkIn.replaceAll("-", "");
  const end = input.checkOut.replaceAll("-", "");
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", input.title);
  url.searchParams.set("dates", `${start}/${end}`);
  url.searchParams.set("details", input.description);
  if (input.location) url.searchParams.set("location", input.location);
  return url.toString();
}

function buildIcsContent(input: {
  uid: string;
  summary: string;
  checkIn: string;
  checkOut: string;
  description: string;
  location?: string;
}): string {
  const dtStamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dtStart = input.checkIn.replaceAll("-", "");
  const dtEnd = input.checkOut.replaceAll("-", "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Portugal Active//Booking//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${dtStart}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${input.summary.replace(/\n/g, " ")}`,
    `DESCRIPTION:${input.description.replace(/\n/g, "\\n")}`,
    input.location ? `LOCATION:${input.location.replace(/\n/g, " ")}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return `${lines.join("\r\n")}\r\n`;
}

async function getListingCached(listingId: string): Promise<any> {
  const key = `listing:${listingId}`;
  const cached = cacheManager.get<any>(key);
  if (cached) return cached;

  const listing = await guestyClient.getListing(listingId);
  cacheManager.set(key, listing, TTL_LISTING_MS);
  return listing;
}

export function registerGuestyWebhookRoute(app: Express): void {
  app.post("/api/webhooks/guesty", express.raw({ type: "*/*" }), (req: Request, res: Response) => {
    const signatureHeader = String(req.header("X-Guesty-Signature") || "");
    const secret = process.env.GUESTY_WEBHOOK_SECRET || "";
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");

    const isValid = (() => {
      if (!secret || !signatureHeader || rawBody.length === 0) return false;
      try {
        const digestHex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
        const digestBase64 = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
        const received = signatureHeader.trim();
        return received === digestHex || received === digestBase64;
      } catch {
        return false;
      }
    })();

    if (!isValid) {
      res.status(401).json({ ok: false, message: "Invalid webhook signature" });
      return;
    }

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      payload = {};
    }

    res.status(200).json({ ok: true });

    setImmediate(() => {
      const eventType = String(payload?.event || payload?.type || "unknown");
      const listingId = payload?.data?.listingId || payload?.listingId || payload?.data?.reservation?.listingId;

      console.info(
        JSON.stringify({
          source: "guesty.webhook",
          eventType,
          listingId,
          receivedAt: new Date().toISOString(),
          payload,
        })
      );

      if (
        listingId &&
        (
          eventType === "listing.updated" ||
          eventType === "reservation.created" ||
          eventType === "reservation.updated" ||
          eventType === "reservation.canceled" ||
          eventType === "reservation.cancelled"
        )
      ) {
        cacheManager.invalidate(`listing:${listingId}`);
        cacheManager.invalidateByPrefix(`calendar:${listingId}:`);
      }

      if (eventType === "reservation.created") {
        console.info(
          JSON.stringify({
            source: "guesty.webhook.email_stub",
            action: "send_confirmation_email",
            reservationId: payload?.data?._id || payload?._id,
            payload,
          })
        );
      }
    });
  });
}

export function registerBookingRoutes(app: Express): void {
  app.get("/api/debug/guesty", async (_req: Request, res: Response) => {
    try {
      const listings = await guestyClient.getListings({ limit: 3 });
      const results = Array.isArray(listings?.results) ? listings.results : Array.isArray(listings) ? listings : [];
      res.json({
        status: "ok",
        count: results.length,
        titles: results.map((l: any) => l?.title).filter(Boolean),
      });
    } catch (err: any) {
      res.status(500).json({
        status: "error",
        message: err?.message || "Unknown Guesty error",
      });
    }
  });

  app.get("/api/listings/:id", async (req: Request, res: Response) => {
    try {
      const listing = await getListingCached(req.params.id);
      const properties = await getPropertiesForSite();
      const fallbackProperty = properties.find((p: any) => String(p.guestyId || "") === String(req.params.id));
      res.json({
        id: listing?._id || req.params.id,
        name: listing?.title || listing?.nickname || fallbackProperty?.name || "Property",
        images: Array.isArray(listing?.pictures)
          ? listing.pictures.map((p: any) => p?.original || p?.thumbnail).filter(Boolean)
          : fallbackProperty?.images || [],
        locality: listing?.address?.city || listing?.address?.region || fallbackProperty?.locality || "",
        maxGuests: listing?.accommodates || fallbackProperty?.maxGuests || 0,
        minNights: listing?.terms?.minNights ?? listing?.terms?.minNight ?? 1,
        checkInInstructions: listing?.checkInInstructions || "",
      });
    } catch (err) {
      mapGuestyError(err, res);
    }
  });

  app.get("/api/listings/:id/rate-plans", async (req: Request, res: Response) => {
    try {
      const raw = await guestyClient.getListingRatePlans(req.params.id);
      const list = Array.isArray(raw?.results) ? raw.results : Array.isArray(raw) ? raw : [];

      const plans = list.map((plan: any) => ({
        id: plan?._id || plan?.id || "",
        name: plan?.name || "Tarifa",
        type: classifyRatePlan(plan?.name || "", plan?.cancellationPolicy),
        cancellationPolicy: plan?.cancellationPolicy || [],
        cancellationFee: plan?.cancellationFee || null,
        priceAdjustment: plan?.priceAdjustment || null,
      }));

      res.json({ ratePlans: plans });
    } catch (err) {
      if (err instanceof GuestyClientError && err.status === 404) {
        // Some Guesty workspaces don't expose rate plans endpoint in Open API.
        res.json({ ratePlans: [] });
        return;
      }
      mapGuestyError(err, res);
    }
  });

  app.get("/api/listings/:id/calendar", async (req: Request, res: Response) => {
    const id = req.params.id;
    const from = toIsoDate(String(req.query.from || ""));
    const to = toIsoDate(String(req.query.to || ""));

    if (!from || !to) {
      res.status(400).json({ message: "Invalid from/to date params" });
      return;
    }

    const cacheKey = `calendar:${id}:${from}:${to}`;
    const cached = cacheManager.get<any>(cacheKey);
    if (cached) {
      res.json({ ...cached, cached: true });
      return;
    }

    try {
      const calendar = await guestyClient.getListingCalendar(id, from, to);
      cacheManager.set(cacheKey, calendar, TTL_CALENDAR_MS);
      res.json({ ...calendar, cached: false });
    } catch (err) {
      mapGuestyError(err, res);
    }
  });

  app.get("/api/listings/:id/quote", async (req: Request, res: Response) => {
    const listingId = req.params.id;
    const checkIn = toIsoDate(String(req.query.checkIn || ""));
    const checkOut = toIsoDate(String(req.query.checkOut || ""));
    const guestsCount = Number(req.query.guests || 2);
    const ratePlanId = req.query.ratePlanId ? String(req.query.ratePlanId) : undefined;

    if (!checkIn || !checkOut || !Number.isFinite(guestsCount) || guestsCount < 1) {
      res.status(400).json({ message: "Invalid query params" });
      return;
    }

    try {
      const q = await guestyClient.createQuote(listingId, checkIn, checkOut, guestsCount, ratePlanId);
      const p = q.pricingCents;
      const rawPlans = Array.isArray(q.raw?.rates?.ratePlans)
        ? q.raw.rates.ratePlans
        : q.raw?.rates?.ratePlan
          ? [q.raw.rates.ratePlan]
          : [];
      const ratePlanOptions = rawPlans.map((plan: any) => {
        const money = plan?.money || {};
        return {
          ratePlanId: plan?._id || plan?.id || "",
          name: plan?.name || "Tarifa",
          type: classifyRatePlan(plan?.name || "", plan?.cancellationPolicy),
          cancellationPolicy: plan?.cancellationPolicy || [],
          cancellationFee: plan?.cancellationFee || null,
          total: Math.round(Number(money.totalPrice ?? money.total ?? money.totalAmount ?? money.hostPayout ?? 0) * 100),
          baseRent: Math.round(Number(money.fareAccommodation ?? money.accommodationFare ?? 0) * 100),
          cleaningFee: Math.round(Number(money.fareCleaning ?? money.cleaningFee ?? 0) * 100),
        };
      });
      res.json({
        quoteId: q.raw?._id || null,
        nights: q.nights,
        baseRent: p.baseRentCents,
        cleaningFee: p.cleaningFeeCents,
        serviceFee: p.serviceFeeCents,
        touristTax: p.touristTaxCents,
        vat: p.vatCents,
        totalBeforeTax: p.totalBeforeTaxCents,
        totalAfterTax: p.totalAfterTaxCents,
        currency: p.currency,
        ratePlanId: q.ratePlanId,
        ratePlanOptions,
        money: q.raw?.rates?.ratePlan?.money || q.raw?.money || null,
      });
    } catch (err) {
      mapGuestyError(err, res);
    }
  });

  app.post("/api/reservations", async (req: Request, res: Response) => {
    const body = req.body || {};
    const listingId = String(body.listingId || "");
    const checkIn = toIsoDate(String(body.checkInDateLocalized || body.checkIn || ""));
    const checkOut = toIsoDate(String(body.checkOutDateLocalized || body.checkOut || ""));
    const guest = body.guest || {};
    const ratePlanId = body.ratePlanId ? String(body.ratePlanId) : undefined;
    const policyAccepted = Boolean(body.policyAccepted);
    const termsAccepted = Boolean(body.termsAccepted);

    if (!listingId || !checkIn || !checkOut || !guest?.firstName || !guest?.lastName || !guest?.email || !guest?.phone) {
      res.status(422).json({
        message: "Missing required booking fields",
        code: "VALIDATION_ERROR",
      });
      return;
    }

    if (!policyAccepted || !termsAccepted) {
      res.status(422).json({
        message: "You must accept terms and cancellation policy",
        code: "TERMS_REQUIRED",
      });
      return;
    }

    const counts = parseGuestCounts(body);
    const payload = body.quoteId
      ? {
          status: "confirmed",
          reservedUntil: -1,
          quoteId: String(body.quoteId),
          ...(ratePlanId ? { ratePlanId } : {}),
          guest: {
            firstName: String(guest.firstName),
            lastName: String(guest.lastName),
            email: String(guest.email),
            phones: [String(guest.phone)],
          },
          ignoreCalendar: false,
          ignoreTerms: false,
          ignoreBlocks: false,
        }
      : {
          listingId,
          checkInDateLocalized: checkIn,
          checkOutDateLocalized: checkOut,
          guestsCount: counts.guestsCount,
          guest: {
            firstName: String(guest.firstName),
            lastName: String(guest.lastName),
            email: String(guest.email),
            phone: String(guest.phone),
          },
          source: "Website Direct",
          status: "inquiry",
        };

    try {
      const reservation = await guestyClient.createReservation(payload as Record<string, unknown>);
      res.status(201).json({
        reservationId: reservation?._id || "",
        confirmationCode: reservation?.confirmationCode || reservation?._id?.slice(-8) || "",
        status: reservation?.status || "reserved",
      });
    } catch (err) {
      mapGuestyError(err, res);
    }
  });

  app.get("/api/reservations/:id", async (req: Request, res: Response) => {
    try {
      const reservation = await guestyClient.getReservation(req.params.id);
      const listingId = reservation?.listingId || reservation?.listing?._id || reservation?.listing?._idStr || "";
      let listingName = "";
      let checkInInstructions = "";

      if (listingId) {
        try {
          const listing = await getListingCached(String(listingId));
          listingName = listing?.title || "";
          checkInInstructions = listing?.checkInInstructions || "";
        } catch {
          /* non-blocking */
        }
      } else {
        const props = await getPropertiesForSite();
        const maybe = props.find((p: any) => p.guestyId && String(p.guestyId) === String(listingId));
        listingName = maybe?.name || "";
      }

      const title = listingName || "Portugal Active Reservation";
      const checkIn = toIsoDate(String(reservation?.checkInDateLocalized || reservation?.checkIn || ""));
      const checkOut = toIsoDate(String(reservation?.checkOutDateLocalized || reservation?.checkOut || ""));
      const calendarDescription = `Reservation ${reservation?.confirmationCode || reservation?._id || ""}`;
      const googleCalendarUrl =
        checkIn && checkOut
          ? buildGoogleCalendarLink({
              title,
              checkIn,
              checkOut,
              description: calendarDescription,
              location: reservation?.listing?.address?.full || "",
            })
          : "";
      const ics = checkIn && checkOut
        ? buildIcsContent({
            uid: String(reservation?._id || crypto.randomUUID()),
            summary: title,
            checkIn,
            checkOut,
            description: calendarDescription,
            location: reservation?.listing?.address?.full || "",
          })
        : "";

      res.json({
        reservationId: reservation?._id || req.params.id,
        confirmationCode: reservation?.confirmationCode || reservation?._id?.slice(-8) || "",
        status: reservation?.status || "",
        paymentStatus: reservation?.paymentStatus || reservation?.money?.paymentStatus || "unknown",
        listingName: title,
        checkIn: checkIn || reservation?.checkInDateLocalized || "",
        checkOut: checkOut || reservation?.checkOutDateLocalized || "",
        guestsCount: reservation?.guestsCount || reservation?.guests || 0,
        totalCents:
          reservation?.money?.hostPayout !== undefined
            ? Math.round(Number(reservation.money.hostPayout || 0) * 100)
            : reservation?.money?.total !== undefined
              ? Math.round(Number(reservation.money.total || 0) * 100)
              : null,
        currency: reservation?.money?.currency || "EUR",
        cancellationPolicy:
          reservation?.cancellationPolicy ||
          reservation?.ratePlan?.cancellationPolicy ||
          [],
        checkInInstructions,
        googleCalendarUrl,
        icsFileName: `portugal-active-booking-${reservation?._id || req.params.id}.ics`,
        icsContent: ics,
      });
    } catch (err) {
      mapGuestyError(err, res);
    }
  });

  app.get("/api/reservations/:id/ics", async (req: Request, res: Response) => {
    try {
      const reservation = await guestyClient.getReservation(req.params.id);
      const checkIn = toIsoDate(String(reservation?.checkInDateLocalized || reservation?.checkIn || ""));
      const checkOut = toIsoDate(String(reservation?.checkOutDateLocalized || reservation?.checkOut || ""));
      if (!checkIn || !checkOut) {
        res.status(400).send("Invalid reservation dates");
        return;
      }
      const content = buildIcsContent({
        uid: String(reservation?._id || req.params.id),
        summary: String(reservation?.listing?.title || "Portugal Active Reservation"),
        checkIn,
        checkOut,
        description: `Reservation ${reservation?.confirmationCode || reservation?._id || ""}`,
        location: reservation?.listing?.address?.full || "",
      });
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="portugal-active-booking-${reservation?._id || req.params.id}.ics"`
      );
      res.send(content);
    } catch (err) {
      mapGuestyError(err, res);
    }
  });

  app.post("/api/cache/invalidate/listing/:id", async (req: Request, res: Response) => {
    const listingId = req.params.id;
    cacheManager.invalidate(`listing:${listingId}`);
    cacheManager.invalidateByPrefix(`calendar:${listingId}:`);
    res.json({ ok: true });
  });

  app.get("/api/listings/:id/calendar-window", async (req: Request, res: Response) => {
    const listingId = req.params.id;
    const months = Math.max(1, Math.min(6, Number(req.query.months || 3)));
    const now = new Date();
    const fromDate = startOfMonth(now);
    const toDate = endOfMonth(new Date(now.getFullYear(), now.getMonth() + months - 1, 1));
    const from = toIsoDate(fromDate.toISOString());
    const to = toIsoDate(toDate.toISOString());

    const cacheKey = `calendar:${listingId}:${from}:${to}`;
    const cached = cacheManager.get<any>(cacheKey);
    if (cached) {
      res.json({ ...cached, cached: true, from, to });
      return;
    }
    try {
      const calendar = await guestyClient.getListingCalendar(listingId, from, to);
      cacheManager.set(cacheKey, calendar, TTL_CALENDAR_MS);
      res.json({ ...calendar, cached: false, from, to });
    } catch (err) {
      mapGuestyError(err, res);
    }
  });
}
