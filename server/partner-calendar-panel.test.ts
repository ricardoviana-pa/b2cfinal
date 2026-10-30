/**
 * The partner panel and the listing card, rendered (revisão do PR #180, R4).
 *
 * The helpers in partner-calendar-unknown-dates.test.ts said what to draw,
 * but nothing checked that the panel and the card use them: replacing the
 * panel's "missing = unknown" with undefined, or the card's label with the old
 * "Select dates for price", left every test green. Here the real
 * PartnerBookingPanel (with the real AvailabilityCalendar) and PropertyCard
 * are rendered to HTML with the English copy; only the tRPC hooks, the date
 * picker's open state and the phone field are stubbed.
 */
import path from "node:path";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { Router } from "wouter";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The app compiles JSX with the automatic runtime; vitest uses tsconfig's
// classic transform, which expects a React global.
(globalThis as any).React = React;

const q = vi.hoisted(() => ({
  calendar: { data: undefined as unknown, isLoading: false, isError: false },
  quote: { data: undefined as unknown, isFetching: false, isError: false },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    booking: {
      partnerCalendar: { useQuery: () => ({ ...q.calendar, refetch: async () => ({}) }) },
      partnerQuote: { useQuery: () => q.quote },
    },
    leads: { create: { useMutation: () => ({ mutateAsync: async () => ({}), isPending: false }) } },
  },
}));
// The calendar is open (a guest clicked the check-in field).
vi.mock("../client/src/components/booking/useDateRangePicker", () => ({
  useDateRangePicker: () => ({ open: true, phase: "check-in", setPhase: () => {}, openField: () => {}, close: () => {}, containerRef: { current: null } }),
}));
vi.mock("../client/src/components/booking/PhoneInput", () => ({ default: () => null }));

import { PartnerBookingPanel } from "../client/src/components/booking/PartnerBookingPanel";
import PropertyCard from "../client/src/components/property/PropertyCard";

const ROOT = process.cwd();
const en = JSON.parse(fs.readFileSync(path.join(ROOT, "client/src/i18n/locales/en.json"), "utf8"));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
  await i18next.use(initReactI18next).init({
    lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false }, showSupportNotice: false,
  } as any);
});
afterAll(() => { vi.useRealTimers(); });

const DAY = 86_400_000;
const ymd = (start: string, i: number) => new Date(Date.parse(start + "T00:00:00Z") + i * DAY).toISOString().slice(0, 10);
/** Casa de Caiz on 29 Oct: the whole window (2026-10-29 → 2027-10-29), free, guest price. */
const FULL = Array.from({ length: 366 }, (_, i) => ({ date: ymd("2026-10-29", i), status: "available", price: 954 }));
/** Beachfront Sintra: free to 2027-03-04, then every day "unknown" (the server's answer since this PR). */
const SHORT = [
  ...Array.from({ length: 127 }, (_, i) => ({ date: ymd("2026-10-29", i), status: "available", price: 1203 })),
  ...Array.from({ length: 239 }, (_, i) => ({ date: ymd("2027-03-05", i), status: "unknown" })),
];
const QUOTE = { available: true, nights: 7, perNight: [], accommodation: 5565, cleaningFee: 0, total: 5565, securityDeposit: 0, feesKnown: false, unavailable: [], currency: "EUR", source: "live" };

const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
function block(html: string, role: string): string[] {
  return [...html.matchAll(new RegExp(`<(p|div)[^>]*role="${role}"[^>]*>([\\s\\S]*?)</\\1>`, "g"))].map((m) => textOf(m[2]));
}

function panel(opts: { calendar: unknown; calendarError?: boolean; quote?: unknown; checkIn: string; checkOut: string; fromPrice?: number | null }) {
  q.calendar = { data: opts.calendar, isLoading: false, isError: !!opts.calendarError };
  q.quote = { data: opts.quote, isFetching: false, isError: false };
  const html = renderToStaticMarkup(React.createElement(PartnerBookingPanel, {
    tripwixUid: "71776293-1e7f-4eb9-bd2c-d9733621716f", propertyName: "Casa de Caiz", propertySlug: "casa-de-caiz",
    fromPrice: opts.fromPrice, maxGuests: 10, minNights: 1, initialCheckIn: opts.checkIn, initialCheckOut: opts.checkOut,
    whatsappUrl: "https://wa.me/000",
  }));
  return {
    html,
    onRequest: (html.match(/data-day-status="unknown"/g) ?? []).length,
    days: (html.match(/aria-label="\d{4}-\d{2}-\d{2}/g) ?? []).length,
    notes: block(html, "note"),
    statuses: block(html, "status"),
    alerts: block(html, "alert"),
  };
}

describe("the partner panel, rendered: what the calendar draws and says", () => {
  it("R1/R2: a home the server holds no calendar for — every date on request, and the line claims nothing about the home", () => {
    // Quinta da Lameirinha (404 at Tripwix) and Mirante 1 before the job has
    // read it get the same answer from the server: null.
    const p = panel({ calendar: null, quote: null, checkIn: "2026-11-12", checkOut: "2026-11-19", fromPrice: null });
    expect(p.days).toBe(30); // November 2026 is the month on screen
    expect(p.onRequest).toBe(30);
    expect(p.notes).toEqual([en.bookingWidget.onRequestAll]);
    expect(p.statuses).toEqual([`i ${en.partnerBooking.onRequestDates}`]);
    expect(p.alerts).toEqual([]);
    expect(textOf(p.html)).not.toMatch(/has not opened|not open for booking/i);
  });

  it("R1/R2: the calendar request failed — dates on request, the load-error line with 'Try again', and the price it still gets", () => {
    const p = panel({ calendar: undefined, calendarError: true, quote: QUOTE, checkIn: "2026-12-01", checkOut: "2026-12-08", fromPrice: 795 });
    expect(p.onRequest).toBe(31);
    expect(p.notes).toEqual([`${en.bookingWidget.calendarLoadError} ${en.bookingWidget.tryAgain}`]);
    expect(p.html).toMatch(/role="note"[^>]*>[^]*?<button type="button"[^>]*>Try again<\/button>/);
    expect(textOf(p.html)).toContain("€5,565");
    expect(textOf(p.html)).not.toMatch(/has not opened|not open for booking/i);
  });

  it("R1-far/R2-far: a calendar that runs to the window's end — November 2027 is free, with no on-request line", () => {
    const p = panel({ calendar: FULL, quote: QUOTE, checkIn: "2027-11-01", checkOut: "2027-11-08", fromPrice: 795 });
    expect(p.days).toBe(30);
    expect(p.onRequest).toBe(0);
    expect(p.notes).toEqual([]);
    expect(p.statuses).toEqual([]);
    expect(textOf(p.html)).toContain("€5,565");
  });

  it("R1-far: the same far stay with no price (our on-demand limit) is the red 'could not price', not 'on request'", () => {
    const p = panel({ calendar: FULL, quote: null, checkIn: "2028-10-01", checkOut: "2028-10-08", fromPrice: 795 });
    expect(p.onRequest).toBe(0);
    expect(p.alerts).toEqual([`! ${en.partnerBooking.quoteError}`]);
    expect(p.statuses).toEqual([]);
    expect(textOf(p.html)).toContain(en.partnerBooking.pickDates);
  });

  it("P1: a short calendar — its tail continues past the window on request, and a stay there says so", () => {
    const p = panel({ calendar: SHORT, quote: null, checkIn: "2027-11-01", checkOut: "2027-11-08", fromPrice: 1135 });
    expect(p.onRequest).toBe(30);
    expect(p.notes).toEqual([en.bookingWidget.onRequestNote]);
    expect(p.statuses).toEqual([`i ${en.partnerBooking.onRequestDates}`]);
    expect(p.alerts).toEqual([]);
    expect(textOf(p.html)).toContain(en.partnerBooking.onRequestHint);
  });

  it("P1: inside the published part of a short calendar nothing is on request", () => {
    const p = panel({ calendar: SHORT, quote: QUOTE, checkIn: "2026-12-01", checkOut: "2026-12-08", fromPrice: 1135 });
    expect(p.onRequest).toBe(0);
    expect(p.notes).toEqual([]);
  });
});

describe("the listing card, rendered: a partner home with no 'from' reads 'Price on request'", () => {
  const home = (source?: string) => ({
    id: "p1", slug: "quinta-da-lameirinha", name: "Quinta da Lameirinha", guestyId: "g-test-1", locality: "Ponte de Lima",
    destination: "minho", bedrooms: 5, bathrooms: 5, maxGuests: 10, isActive: true, ...(source ? { source } : {}),
    images: ["https://assets.guesty.com/image/upload/v1/production/a.jpg"],
  }) as any;
  const card = (property: any, fromPrice: number | null | undefined) => textOf(renderToStaticMarkup(
    React.createElement(Router, { base: "/en", ssrPath: "/en/homes" }, React.createElement(PropertyCard, { property, fromPrice })),
  ));

  it("partner home whose 'from' came back as none: 'Price on request'", () => {
    const t = card(home("tripwix"), null);
    expect(t).toContain(en.property.priceOnRequest);
    expect(t).not.toContain(en.property.selectDatesForPrice);
  });
  it("not computed yet, or one of our own homes: 'Select dates for price' as before", () => {
    expect(card(home("tripwix"), undefined)).toContain(en.property.selectDatesForPrice);
    expect(card(home(), null)).toContain(en.property.selectDatesForPrice);
  });
});

describe("the partner panel's price line: 'not computed yet' is not 'none' (verificação de 29 out 2026, Property PP-3)", () => {
  // No dates: the line above the calendar is the "from" price, as on first paint.
  const line = (fromPrice: number | null | undefined) =>
    textOf(panel({ calendar: null, quote: undefined, checkIn: "", checkOut: "", fromPrice }).html);

  it("no 'from' yet (seed missing, query in flight): 'Select dates for price', as the cards and the phone bar say", () => {
    const t = line(undefined);
    expect(t).toContain(en.property.selectDatesForPrice);
    expect(t).toContain(en.partnerBooking.pickDates);
    expect(t).not.toContain(en.property.priceOnRequest);
  });
  it("'from' came back as none: 'Price on request' and the concierge line, no promise of an exact total", () => {
    const t = line(null);
    expect(t).toContain(en.property.priceOnRequest);
    expect(t).toContain(en.partnerBooking.onRequestHint);
    expect(t).not.toContain(en.partnerBooking.pickDates);
    expect(t).not.toContain(en.property.selectDatesForPrice);
  });
  it("a price: 'From €795 per night' and the dates hint", () => {
    const t = line(795);
    expect(t).toContain(`${en.property.fromPerNight.replace("{{price}}", "795")} ${en.partnerBooking.perNight}`);
    expect(t).toContain(en.partnerBooking.pickDates);
    expect(t).not.toContain(en.property.priceOnRequest);
  });
});
