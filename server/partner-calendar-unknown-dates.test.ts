/**
 * Datas sem calendário nunca aparecem como livres (verificação de produção,
 * 29 out 2026, Tripwix P1 e P2).
 *
 * P1: nove casas parceiras têm um calendário que pára a 2027-03-04 (a
 * Tripwix não devolve mais nada, mesmo pedindo o ano; 26 casas devolvem os
 * 366 dias com o mesmo pedido). O site desenhava os ~8 meses seguintes como
 * livres, e escolhidos davam "não foi possível calcular o preço".
 * P2: quatro casas não têm calendário nenhum (Quinta da Lameirinha: HTTP 404;
 * 3Br Cabana Villa, Villa Arroz, Villa Trevo: calendário vazio) e todas as
 * datas apareciam livres.
 *
 * Agora um dia que a Tripwix não publicou é "a pedido": nem livre nem
 * ocupado, escolhe-se (o painel é por pedido), não tem preço, e o painel diz
 * que o concierge confirma a disponibilidade e o preço.
 *
 * Revisão do PR #180: os textos já não afirmam nada sobre a casa que o site
 * não sabe (sem calendário na Tripwix, por carregar no servidor ou pedido
 * falhado dão o mesmo ao cliente), e as datas depois da janela de 12 meses só
 * são "a pedido" numa casa cujo calendário não chega ao fim da janela. A
 * ligação ao painel e ao cartão está em partner-calendar-panel.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const h = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock("./db", () => ({
  getSettingsByKeys: async (keys: string[]) => new Map(keys.filter((k) => h.store.has(k)).map((k) => [k, h.store.get(k)!])),
  upsertSetting: async (key: string, value: string) => { h.store.set(key, value); },
}));
const UID = "a77ade65-0000-4000-8000-000000000001";
vi.mock("./services/properties-store", () => ({
  getPropertiesForSite: async () => [{ source: "tripwix", isActive: true, supplierUid: UID, name: "Beachfront Sintra", minNights: 7, maxGuests: 10 }],
}));

import { partnerCalendarDays } from "./services/tripwix";
import {
  applyDayClick,
  buildRangeRules,
  dayRole,
  isBlocked,
  isUnknown,
  stayNightStatus,
  statusOf,
  UNKNOWN_STATUS,
  type DayRule,
} from "../client/src/lib/dateRangeSelection";
import { partnerCalendarView, partnerQuoteNotice, partnerRequestQuoteStatus } from "../client/src/lib/partnerAvailability";
import { noPriceLabelKey } from "../client/src/lib/partnerPriceLabel";

const DAY = 86_400_000;
const T0 = Date.parse("2026-10-29T08:00:00Z");
const ymdFrom = (start: string, i: number) => new Date(Date.parse(start + "T00:00:00Z") + i * DAY).toISOString().slice(0, 10);
/** What Tripwix returns for Beachfront Sintra on 29 Oct: 127 days, 2026-10-29 → 2027-03-04, all free at €1 000 net. */
const sintra = () => Array.from({ length: 127 }, (_, i) => ({ date: ymdFrom("2026-10-29", i), status: "available", price: "1000.00" }));

beforeEach(() => {
  h.store.clear();
});

describe("partnerCalendarDays: every date of the window, the ones Tripwix did not return as unknown", () => {
  it("a calendar that stops on 2027-03-04 serves the rest of the year as unknown, with no price (P1)", () => {
    const days = partnerCalendarDays(sintra(), "2026-10-29", "2027-10-29");
    expect(days).toHaveLength(366);
    expect(days[0]).toEqual({ date: "2026-10-29", status: "available", price: 1060 });
    expect(days.find((d) => d.date === "2027-03-04")).toEqual({ date: "2027-03-04", status: "available", price: 1060 });
    const after = days.filter((d) => d.date > "2027-03-04");
    expect(after).toHaveLength(239);
    expect(after.every((d) => d.status === "unknown" && !("price" in d))).toBe(true);
    // Christmas inside the published part stays what Tripwix said; July is never free.
    expect(days.find((d) => d.date === "2027-07-10")).toEqual({ date: "2027-07-10", status: "unknown" });
  });

  it("no calendar at all: every date unknown, none free (P2)", () => {
    const days = partnerCalendarDays(null, "2026-10-29", "2026-12-31");
    expect(days).toHaveLength(64);
    expect(new Set(days.map((d) => d.status))).toEqual(new Set(["unknown"]));
  });

  it("a hole or a repeated date is unknown; a returned day without a valid price stays unavailable", () => {
    const days = partnerCalendarDays([
      { date: "2026-11-01", status: "available", price: 900 },
      { date: "2026-11-03", status: "available", price: 900 },
      { date: "2026-11-04", status: "available", price: 900 },
      { date: "2026-11-04", status: "unavailable", price: 900 },
      { date: "2026-11-05", status: "available", price: null },
      { date: "2026-11-06", status: "booked", price: 900 },
    ], "2026-11-01", "2026-11-06");
    expect(days.map((d) => d.status)).toEqual(["available", "unknown", "available", "unknown", "unavailable", "unavailable"]);
    expect(days[5]).toEqual({ date: "2026-11-06", status: "unavailable", price: 954 });
  });

  it("an impossible or oversized window gives nothing (a guest's input cannot make it build millions of days)", () => {
    expect(partnerCalendarDays(sintra(), "2026-10-29", "2026-10-28")).toEqual([]);
    expect(partnerCalendarDays(sintra(), "2026-02-30", "2026-03-04")).toEqual([]);
    expect(partnerCalendarDays(sintra(), "1900-01-01", "2900-01-01")).toEqual([]);
  });
});

describe("the job and the guest requests with a short calendar", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(T0));
    vi.stubEnv("TRIPWIX_API_KEY", "test-only");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("the property page calendar has the whole year, the tail unknown; dated quotes price inside it and not beyond", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(sintra()), { status: 200 })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { refreshTripwixCalendar } = await import("./services/tripwix-calendar");
    const { getPartnerCalendar, getPartnerQuote } = await import("./services/tripwix");
    expect(await refreshTripwixCalendar(UID, "Beachfront Sintra")).toMatchObject({ action: "refreshed" });

    const days = await getPartnerCalendar(UID, "2026-10-29", "2027-10-29");
    expect(days).toHaveLength(366); // antes: 127, e o calendário desenhava os outros 239 livres
    expect(days!.filter((d) => d.status === "available")).toHaveLength(127);
    expect(days!.filter((d) => d.status === "unknown")).toHaveLength(239);
    expect(await getPartnerQuote(UID, "2027-02-26", "2027-03-05")).toMatchObject({ available: true, nights: 7 });
    expect(await getPartnerQuote(UID, "2027-07-10", "2027-07-17")).toBeNull();
  });

  it("booking.partnerCalendar answers the unknown tail with the long edge cache; partnerQuote beyond it stays null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(sintra()), { status: 200 })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const headers = new Map<string, string>();
    const { bookingRouter } = await import("./routers/booking");
    const c = bookingRouter.createCaller({ req: { headers: {} }, res: { setHeader: (k: string, v: string) => headers.set(k, v) }, user: null } as any);
    const { refreshTripwixCalendar } = await import("./services/tripwix-calendar");
    await refreshTripwixCalendar(UID, "Beachfront Sintra");

    const days = await c.partnerCalendar({ tripwixUid: UID, startDate: "2026-10-29", endDate: "2027-10-29" });
    expect(days!.at(-1)).toEqual({ date: "2027-10-29", status: "unknown" });
    expect(days!.some((d) => d.date > "2027-03-04" && d.status === "available")).toBe(false);
    expect(headers.get("Cache-Control")).toContain("s-maxage=900");
    expect(await c.partnerQuote({ tripwixUid: UID, checkIn: "2027-07-10", checkOut: "2027-07-17" })).toBeNull();
    expect(headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=60");
  });

  it("logs a short calendar once (not every hour) and names it in the hourly summary", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const full = Array.from({ length: 366 }, (_, i) => ({ date: ymdFrom("2026-10-29", i), status: "available", price: "800.00" }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes(UID) ? sintra() : full), { status: 200 })));
    const { refreshTripwixCalendar, tripwixCalendarSummary } = await import("./services/tripwix-calendar");
    await refreshTripwixCalendar(UID, "Beachfront Sintra");
    await refreshTripwixCalendar("caiz", "Casa de Caiz");
    vi.setSystemTime(new Date(T0 + 61 * 60_000));
    await refreshTripwixCalendar(UID, "Beachfront Sintra");

    const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("só tem dias até"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Beachfront Sintra");
    expect(lines[0]).toContain("2027-03-04");
    expect(lines[0]).toContain("pedido até 2027-10-29");
    const summary = tripwixCalendarSummary([{ uid: UID, name: "Beachfront Sintra" }, { uid: "caiz", name: "Casa de Caiz" }]);
    expect(summary.short).toEqual(["Beachfront Sintra (até 2027-03-04)"]);
    expect(summary.withData).toBe(2);
  });
});

/** Free every day from `today` for `n` days, then whatever `tail` says. */
function partnerDays(today: string, n: number, tail: Record<string, string> = {}): DayRule[] {
  const days: DayRule[] = Array.from({ length: n }, (_, i) => ({ date: ymdFrom(today, i), status: "available" }));
  for (const [date, status] of Object.entries(tail)) days.push({ date, status });
  return days.sort((a, b) => (a.date < b.date ? -1 : 1));
}
const TODAY = "2027-02-20";
const sel = (checkIn: string, checkOut: string, phase: "check-in" | "check-out" = "check-in") => ({ checkIn, checkOut, phase });

describe("the calendar: an unknown day is on request — chosen like a free day, never drawn or counted as one", () => {
  // Sintra: free up to 4 Mar, nothing published after (the server sends "unknown").
  const served = partnerDays(TODAY, 13, Object.fromEntries(Array.from({ length: 30 }, (_, i) => [ymdFrom("2027-03-05", i), UNKNOWN_STATUS])));

  it("an unknown day starts a stay, and a stay runs through unknown days (it is not a booked night)", () => {
    const r = buildRangeRules(served, 7, TODAY, { missing: UNKNOWN_STATUS });
    expect(isUnknown(r, "2027-03-10")).toBe(true);
    expect(isBlocked(r, "2027-03-10")).toBe(false);
    expect(dayRole(r, sel("", ""), "2027-03-10")).toBe("check-in");
    const a = applyDayClick(r, sel("", ""), "2027-03-01")!;
    expect(applyDayClick(r, a, "2027-03-15")).toEqual({ checkIn: "2027-03-01", checkOut: "2027-03-15", phase: "check-in", done: true });
  });

  it("with missing: 'unknown', a date the partner calendar does not have is unknown; our own homes keep absent = free", () => {
    const partner = buildRangeRules([], 2, TODAY, { missing: UNKNOWN_STATUS }); // Quinta da Lameirinha: no calendar
    expect(isUnknown(partner, "2027-05-01")).toBe(true);
    expect(dayRole(partner, sel("", ""), "2027-05-01")).toBe("check-in");
    const own = buildRangeRules([], 2, TODAY);
    expect(isUnknown(own, "2027-05-01")).toBe(false);
    expect(isBlocked(own, "2027-05-01")).toBe(false);
  });

  it("a booked night still ends a stay at the turnover morning, also after unknown days", () => {
    const r = buildRangeRules([...served, { date: "2027-03-12", status: "unavailable" }], 2, TODAY, { missing: UNKNOWN_STATUS });
    expect(dayRole(r, sel("2027-03-06", "", "check-out"), "2027-03-12")).toBe("check-out");
    // Past the booked night the stay cannot reach: a click there starts a new stay (as with free days).
    expect(dayRole(r, sel("2027-03-06", "", "check-out"), "2027-03-13")).toBe("restart");
    expect(dayRole(r, sel("", ""), "2027-03-12")).toBe("disabled");
  });

  it("stayNightStatus sorts a stay's nights into taken and unknown (the check-out day is not a night)", () => {
    const r = buildRangeRules([...served, { date: "2027-03-02", status: "unavailable" }], 2, TODAY, { missing: UNKNOWN_STATUS });
    expect(stayNightStatus(r, "2027-02-27", "2027-03-07")).toEqual({ nights: 8, taken: ["2027-03-02"], unknown: ["2027-03-05", "2027-03-06"] });
    expect(stayNightStatus(r, "2027-02-21", "2027-02-25")).toEqual({ nights: 4, taken: [], unknown: [] });
    expect(stayNightStatus(r, "2027-03-10", "2027-03-10")).toBeNull();
  });
});

describe("the partner panel: what it says when a stay has no price", () => {
  const base = { checkIn: "2027-07-10", checkOut: "2027-07-17", quote: null, quoteFetching: false, quoteError: false, calendarError: false, windowEnd: "2027-10-29" };
  const short = partnerDays("2026-10-29", 127).concat(
    Array.from({ length: 239 }, (_, i) => ({ date: ymdFrom("2027-03-05", i), status: UNKNOWN_STATUS })),
  );

  it("dates after the last published day: 'on request', not the red pricing error (P1)", () => {
    expect(partnerQuoteNotice({ ...base, calendar: short })).toBe("on-request");
  });
  it("a home with no calendar: 'on request' for any dates (P2)", () => {
    expect(partnerQuoteNotice({ ...base, calendar: null })).toBe("on-request");
    expect(partnerQuoteNotice({ ...base, quote: undefined, quoteError: true, calendar: null })).toBe("on-request");
  });
  it("booked nights in a stay that also could not be priced: 'some nights are taken'", () => {
    // A dated search can land here: 1–8 Mar has a booked night and nights not published yet.
    const withBooking = short.map((d) => (d.date === "2027-03-02" ? { ...d, status: "unavailable" } : d));
    expect(partnerQuoteNotice({ ...base, checkIn: "2027-03-01", checkOut: "2027-03-08", calendar: withBooking })).toBe("taken");
  });
  it("no price with every night published and free: a real fault, the red error stays", () => {
    expect(partnerQuoteNotice({ ...base, checkIn: "2026-12-01", checkOut: "2026-12-08", calendar: short })).toBe("error");
    expect(partnerQuoteNotice({ ...base, calendar: undefined, calendarError: true })).toBe("error");
  });
  it("nothing to say while pricing, once priced, without dates; waits for the calendar before choosing a message", () => {
    expect(partnerQuoteNotice({ ...base, quoteFetching: true, calendar: short })).toBe("none");
    expect(partnerQuoteNotice({ ...base, quote: { available: true }, calendar: short })).toBe("none");
    expect(partnerQuoteNotice({ ...base, checkOut: "", calendar: short })).toBe("none");
    expect(partnerQuoteNotice({ ...base, quote: undefined, calendar: short })).toBe("none");
    expect(partnerQuoteNotice({ ...base, calendar: undefined })).toBe("pending");
  });
  it("revisão R1-far: a home whose calendar runs to the window's end, a far stay with no price is the red error, not 'on request'", () => {
    // Casa de Caiz: Tripwix publishes past our window and the far read prices it;
    // a null there is our own on-demand limit (≤ 10/h, ~103 s apart), a real "could not price just now".
    const full = partnerDays("2026-10-29", 366);
    expect(partnerQuoteNotice({ ...base, checkIn: "2027-11-01", checkOut: "2027-11-08", calendar: full })).toBe("error");
    expect(partnerQuoteNotice({ ...base, checkIn: "2028-10-01", checkOut: "2028-10-08", calendar: full })).toBe("error");
    // A stay across the window's end, too.
    expect(partnerQuoteNotice({ ...base, checkIn: "2027-10-25", checkOut: "2027-11-02", calendar: full })).toBe("error");
    // The short calendar's tail continues past the window: still on request.
    expect(partnerQuoteNotice({ ...base, checkIn: "2027-11-01", checkOut: "2027-11-08", calendar: short })).toBe("on-request");
    expect(partnerQuoteNotice({ ...base, checkIn: "2027-11-01", checkOut: "2027-11-08", calendar: null })).toBe("on-request");
  });

  it("the concierge's request says 'unknown' when there was no price, not 'unavailable'", () => {
    expect(partnerRequestQuoteStatus(null)).toBe("unknown");
    expect(partnerRequestQuoteStatus(undefined)).toBe("unknown");
    expect(partnerRequestQuoteStatus({ available: false, feesKnown: false })).toBe("unavailable");
    expect(partnerRequestQuoteStatus({ available: true, feesKnown: false })).toBe("partial");
    expect(partnerRequestQuoteStatus({ available: true, feesKnown: true })).toBe("complete");
  });
});

describe("partnerCalendarView: what the panel's calendar draws, and the line under it (revisão do PR #180)", () => {
  const WINDOW_END = "2027-10-29";
  const full = partnerDays("2026-10-29", 366); // Casa de Caiz: the whole window
  const short = partnerDays("2026-10-29", 127).concat(
    Array.from({ length: 239 }, (_, i) => ({ date: ymdFrom("2027-03-05", i), status: UNKNOWN_STATUS })),
  ); // Beachfront Sintra: free to 4 Mar, then nothing published
  const rulesOf = (v: ReturnType<typeof partnerCalendarView>) =>
    buildRangeRules(v.days, 1, "2026-10-29", { missing: v.missing, missingUntil: v.missingUntil });

  it("R1-far/R2-far: a calendar that runs to the window's end leaves the dates after it free (priced on demand), not on request", () => {
    const v = partnerCalendarView({ calendar: full, calendarError: false, windowEnd: WINDOW_END });
    expect(v.missingUntil).toBe(WINDOW_END);
    const r = rulesOf(v);
    for (const date of ["2027-10-30", "2027-10-31", "2027-11-01", "2027-11-30", "2028-10-01"]) {
      expect(isUnknown(r, date), date).toBe(false);
      expect(isBlocked(r, date), date).toBe(false);
    }
    expect(dayRole(r, sel("", ""), "2027-11-01")).toBe("check-in");
  });

  it("…also when the server's copy is a day older (its last day comes back unknown): that day only", () => {
    const lagging = [...partnerDays("2026-10-29", 365), { date: WINDOW_END, status: UNKNOWN_STATUS }];
    const r = rulesOf(partnerCalendarView({ calendar: lagging, calendarError: false, windowEnd: WINDOW_END }));
    expect(isUnknown(r, WINDOW_END)).toBe(true);
    expect(isUnknown(r, "2027-11-01")).toBe(false);
  });

  it("a short calendar (or none): the dates after the window stay on request, as its tail", () => {
    const v = partnerCalendarView({ calendar: short, calendarError: false, windowEnd: WINDOW_END });
    expect(v.missingUntil).toBeUndefined();
    expect(isUnknown(rulesOf(v), "2027-11-01")).toBe(true);
    expect(isUnknown(rulesOf(partnerCalendarView({ calendar: null, calendarError: false, windowEnd: WINDOW_END })), "2027-11-01")).toBe(true);
    // A calendar that stops 31 days early is short; 30 days early still runs to the end (the job's rule).
    const at = (n: number) => partnerCalendarView({ calendar: partnerDays("2026-10-29", 366 - n), calendarError: false, windowEnd: WINDOW_END }).missingUntil;
    expect(at(30)).toBe(WINDOW_END);
    expect(at(31)).toBeUndefined();
  });

  it("R1/R2: no calendar from the server (none at Tripwix, not loaded, or older than 48 h): every date on request, with the neutral line", () => {
    const v = partnerCalendarView({ calendar: null, calendarError: false, windowEnd: WINDOW_END });
    expect(v).toMatchObject({ days: [], missing: UNKNOWN_STATUS, noteKey: "bookingWidget.onRequestAll", retry: false });
    expect(v.missingUntil).toBeUndefined();
    // Every day of the window unknown, as the server sends for a home it holds nothing for.
    const allUnknown = Array.from({ length: 366 }, (_, i) => ({ date: ymdFrom("2026-10-29", i), status: UNKNOWN_STATUS }));
    expect(partnerCalendarView({ calendar: allUnknown, calendarError: false, windowEnd: WINDOW_END }).noteKey).toBe("bookingWidget.onRequestAll");
  });

  it("R1/R2: the calendar request failed: dates on request, the load-error line and 'Try again' — not the no-calendar line", () => {
    const v = partnerCalendarView({ calendar: undefined, calendarError: true, windowEnd: WINDOW_END });
    expect(v).toMatchObject({ days: [], missing: UNKNOWN_STATUS, noteKey: "bookingWidget.calendarLoadError", retry: true });
    expect(isUnknown(rulesOf(v), "2026-12-01")).toBe(true);
    // A failed refetch keeps the days it had: they are still what it draws.
    expect(partnerCalendarView({ calendar: full, calendarError: true, windowEnd: WINDOW_END })).toMatchObject({ noteKey: "bookingWidget.onRequestNote", retry: false, missingUntil: WINDOW_END });
  });

  it("some dates on request (a short calendar): the general on-request line", () => {
    expect(partnerCalendarView({ calendar: short, calendarError: false, windowEnd: WINDOW_END }).noteKey).toBe("bookingWidget.onRequestNote");
  });

  it("statusOf: missingUntil only applies to absent dates; a day the calendar has keeps its status", () => {
    const r = buildRangeRules([{ date: "2027-11-02", status: "unavailable" }], 1, "2026-10-29", { missing: UNKNOWN_STATUS, missingUntil: WINDOW_END });
    expect(statusOf(r, "2027-10-29")).toBe(UNKNOWN_STATUS);
    expect(statusOf(r, "2027-10-30")).toBeUndefined();
    expect(statusOf(r, "2027-11-02")).toBe("unavailable");
    // Without `missing` (our own homes) missingUntil means nothing.
    expect(buildRangeRules([], 1, "2026-10-29", { missingUntil: WINDOW_END }).missingUntil).toBeUndefined();
  });
});

describe("cards and the property page's bar: a partner home with no 'from' reads 'Price on request'", () => {
  it("partner home whose 'from' came back as none", () => {
    expect(noPriceLabelKey(true, null)).toBe("property.priceOnRequest");
  });
  it("not computed yet, or one of our own homes: 'Select dates for price' as before", () => {
    expect(noPriceLabelKey(true, undefined)).toBe("property.selectDatesForPrice");
    expect(noPriceLabelKey(false, null)).toBe("property.selectDatesForPrice");
  });
});

describe("the new strings exist in the 9 languages, translated", () => {
  const read = (lang: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "client/src/i18n/locales", `${lang}.json`), "utf8"));
  const KEYS = [
    "bookingWidget.onRequestLabel", "bookingWidget.onRequestNote", "bookingWidget.onRequestAll",
    "bookingWidget.calendarLoadError", "bookingWidget.tryAgain",
    "partnerBooking.onRequestHint", "partnerBooking.onRequestDates",
  ];
  const get = (o: any, k: string) => k.split(".").reduce((x, p) => x?.[p], o);
  const en = read("en");
  for (const lang of ["pt", "fr", "es", "it", "de", "nl", "sv", "fi"]) {
    it(`${lang}: present, not English, no forbidden words`, () => {
      const loc = read(lang);
      for (const key of KEYS) {
        const v = get(loc, key);
        expect(typeof v, `${lang} ${key}`).toBe("string");
        expect(v.length).toBeGreaterThan(3);
        expect(v, `${lang} ${key} is still English`).not.toBe(get(en, key));
        expect(v).not.toMatch(/\b(hotel|hôtel|hotell|insurance|seguro|assurance|versicherung|sinal|depósito|prestaç)/i);
      }
    });
  }
  it("en: present", () => {
    for (const key of KEYS) expect(typeof get(en, key)).toBe("string");
  });

  // Revisão R1/R2: the same lines show for a home with no calendar at Tripwix,
  // one the server has not loaded, and a failed request — they must hold in
  // all three, so none says the home "has not opened its calendar" or that
  // the dates "are not open for booking yet".
  const CLAIMS: Record<string, RegExp> = {
    en: /has not opened|not open for booking/i,
    pt: /ainda não abriu|ainda não estão abertas/i,
    fr: /pas encore ouvert/i,
    es: /aún no ha abierto|aún no están abiertas/i,
    it: /non ha ancora aperto|non sono ancora prenotabili/i,
    de: /noch nicht geöffnet|noch nicht zur Buchung/i,
    nl: /nog niet geopend|nog niet te boeken/i,
    sv: /ännu inte öppnat|går ännu inte att boka/i,
    fi: /ei ole vielä avannut|ei voi vielä varata/i,
  };
  for (const [lang, claim] of Object.entries(CLAIMS)) {
    it(`${lang}: the on-request lines say what the page can show, not a fact about the home`, () => {
      const loc = read(lang);
      for (const key of ["bookingWidget.onRequestNote", "bookingWidget.onRequestAll", "bookingWidget.calendarLoadError", "partnerBooking.onRequestDates"]) {
        expect(get(loc, key), `${lang} ${key}`).toEqual(expect.any(String));
        expect(get(loc, key), `${lang} ${key}`).not.toMatch(claim);
      }
      expect(get(loc, "partnerBooking.notOpenYet"), `${lang}: the old key is gone`).toBeUndefined();
    });
  }
});
