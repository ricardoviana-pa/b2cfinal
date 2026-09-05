/**
 * TRIPWIX PARTNER API — live availability and pricing
 * =========================================================================
 * The Tripwix partnership gives us 35 homes in regions we do not yet operate
 * in. They are not Guesty listings, so none of the Guesty pricing path applies
 * to them; this is the equivalent for partner inventory.
 *
 * "From €X per night" here means the same thing it means everywhere else on
 * the site — the lowest nightly rate a guest could ACTUALLY book in the next
 * 90 days — but it is read straight off their calendar, which returns a price
 * and an availability status for every single day. No quoting round-trip is
 * needed, so one call per property covers the whole horizon.
 *
 * Rate limits are the reason for the aggressive caching. Our partner tier
 * allows 100 requests/hour and we have 35 properties, so an uncached PLP would
 * exhaust the budget on a single page view. Results are cached in memory for
 * 8h, matching the Guesty path's TTL.
 * ========================================================================= */

const BASE = process.env.TRIPWIX_API_BASE
  ?? "https://admin.worldeluxevillas.com/api/v1/partner";

const TTL_MS = 8 * 60 * 60 * 1000; // 8h, same as the Guesty lowest-nightly cache
const NULL_TTL_MS = 30 * 60 * 1000; // retry failures sooner than successes
const HORIZON_DAYS = 90;

type CalendarDay = {
  date: string;
  status: string;
  price: string | null;
};

type Cached = { value: number | null; at: number };

const cache = new Map<string, Cached>();

/**
 * Last price we actually read from their calendar, kept beyond the cache TTL.
 *
 * The imported catalogue rate is the cheapest night of the whole year and is
 * wrong for almost every date — the same role the Guesty basePrice plays for
 * our own homes, which the pricing code there refuses to show for exactly this
 * reason. So when a live read fails we fall back to the last real price we saw,
 * and if we have never seen one we show nothing rather than a number the guest
 * cannot book.
 */
const lastGood = new Map<string, number>();

/** In-flight de-duplication, so a burst of PLP cards makes one request each. */
const inFlight = new Map<string, Promise<number | null>>();

function isFresh(entry: Cached | undefined): entry is Cached {
  if (!entry) return false;
  const ttl = entry.value === null ? NULL_TTL_MS : TTL_MS;
  return Date.now() - entry.at < ttl;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchCalendar(uid: string): Promise<CalendarDay[] | null> {
  const key = process.env.TRIPWIX_API_KEY;
  if (!key) {
    console.warn("[Tripwix] TRIPWIX_API_KEY is not set; cannot price partner inventory.");
    return null;
  }

  const start = new Date();
  const end = new Date(start.getTime() + HORIZON_DAYS * 86400_000);
  const url = `${BASE}/properties/${uid}/calendar/?start_date=${ymd(start)}&end_date=${ymd(end)}`;

  try {
    const res = await fetch(url, { headers: { "X-Partner-API-Key": key } });
    if (!res.ok) {
      // 429 included: we do not retry here. The null result is cached for a
      // short window and the caller falls back to the imported rate, so a
      // throttled request degrades to a slightly stale price, not a blank one.
      console.warn(`[Tripwix] calendar ${uid} returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch (err) {
    console.warn(`[Tripwix] calendar ${uid} failed:`, err);
    return null;
  }
}

/**
 * Lowest nightly rate that is genuinely available in the next 90 days.
 *
 * Their calendar marks each day `available`, `booked` or `blocked`; only
 * `available` days can be sold, so the others are ignored even though they
 * still carry a price. Returns null when we cannot tell, and the caller keeps
 * its own fallback rather than showing a number we cannot stand behind.
 */
export async function getTripwixLowestNightly(uid: string): Promise<number | null> {
  if (!uid) return null;

  const cached = cache.get(uid);
  if (isFresh(cached)) return cached.value;

  const existing = inFlight.get(uid);
  if (existing) return existing;

  const task = (async () => {
    const days = await fetchCalendar(uid);
    let value: number | null = null;

    if (days) {
      const prices = days
        .filter((d) => d.status === "available")
        .map((d) => Number(d.price))
        .filter((n) => Number.isFinite(n) && n > 0);
      // VAT in, at the same point every other guest-facing figure gets it.
      if (prices.length) value = Math.round(partnerGuestPrice(Math.min(...prices)));
    }

    if (value !== null) lastGood.set(uid, value);
    else value = lastGood.get(uid) ?? null;

    cache.set(uid, { value, at: Date.now() });
    inFlight.delete(uid);
    return value;
  })();

  inFlight.set(uid, task);
  return task;
}

/**
 * Batch variant for the PLP. Requests run sequentially with a small gap: 35
 * properties inside a 100/hour budget leaves no room for bursts, and a blocked
 * page of cards is worse than cards that fill in a moment later.
 */
export async function getTripwixLowestNightlyBatch(
  uids: string[],
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};

  const misses: string[] = [];
  for (const uid of uids) {
    const cached = cache.get(uid);
    if (isFresh(cached)) out[uid] = cached.value;
    else misses.push(uid);
  }

  for (const uid of misses) {
    out[uid] = await getTripwixLowestNightly(uid);
    if (misses.length > 1) await new Promise((r) => setTimeout(r, 250));
  }

  return out;
}


/** VAT on accommodation in mainland Portugal, per the supplier's own terms. */
export const PARTNER_VAT_RATE = 0.06;

/**
 * Their calendar returns NET rates — the price before the 6% VAT the supplier
 * tells us to add. Nothing net may reach a guest: our own homes quote a single
 * all-in figure, and Portuguese price-indication rules expect a consumer to see
 * the price they will actually pay. Everything guest-facing goes through here,
 * so a partner home and one of ours can be compared on the same basis.
 */
export function partnerGuestPrice(net: number): number {
  return Math.round(net * (1 + PARTNER_VAT_RATE) * 100) / 100;
}

export type PartnerQuote = {
  available: boolean;
  nights: number;
  /** Nightly rates for the stay, in order, VAT included, so the UI can break it down. */
  perNight: Array<{ date: string; price: number; status: string }>;
  /** Accommodation for the whole stay, VAT included. */
  accommodation: number;
  /** Cleaning, when we know it for this house. */
  cleaningFee: number;
  /** Everything the guest pays us. */
  total: number;
  /** Refundable, held by the supplier — shown but never added to the total. */
  securityDeposit: number;
  /**
   * False when we hold no fee data for this house, i.e. the supplier may still
   * add cleaning and a deposit on top. The UI must not call `total` final.
   */
  feesKnown: boolean;
  /** Dates inside the range that cannot be booked, if any. */
  unavailable: string[];
  currency: "EUR";
};

/**
 * Price a specific stay off the supplier's calendar.
 *
 * Their rates are net and already include our commission; the 6% VAT is added
 * here so every figure that leaves this module is what a guest would pay.
 *
 * What this CANNOT tell you is the rest of the bill. The supplier quotes a
 * cleaning fee and a refundable security deposit per booking (Casa de Caiz,
 * Sep 2026: EUR 350 cleaning + EUR 844 deposit on a EUR 1,789 stay) and their
 * API exposes neither — no field for either exists anywhere in the payload.
 * Whatever we know per house is passed in by the caller; when we know nothing,
 * `feesKnown` is false and the UI must say the total is still to be confirmed
 * rather than presenting the accommodation figure as the full price.
 *
 * The checkout date is excluded: it is not a night that gets charged.
 */
export async function getPartnerQuote(
  uid: string,
  checkIn: string,
  checkOut: string,
  fees?: { cleaningFee?: number; securityDeposit?: number },
): Promise<PartnerQuote | null> {
  const key = process.env.TRIPWIX_API_KEY;
  if (!key || !uid || !checkIn || !checkOut || checkOut <= checkIn) return null;

  const url = `${BASE}/properties/${uid}/calendar/?start_date=${checkIn}&end_date=${checkOut}`;
  let days: CalendarDay[];
  try {
    const res = await fetch(url, { headers: { "X-Partner-API-Key": key } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    days = data;
  } catch {
    return null;
  }

  const nights = days.filter((d) => d.date < checkOut);
  if (!nights.length) return null;

  const unavailable = nights.filter((d) => d.status !== "available").map((d) => d.date);
  const net = nights.reduce((sum, d) => sum + (Number(d.price) || 0), 0);
  const accommodation = partnerGuestPrice(net);
  const cleaningFee = Math.round((fees?.cleaningFee ?? 0) * 100) / 100;
  const securityDeposit = Math.round((fees?.securityDeposit ?? 0) * 100) / 100;

  return {
    available: unavailable.length === 0,
    nights: nights.length,
    perNight: nights.map((d) => ({
      date: d.date,
      price: partnerGuestPrice(Number(d.price) || 0),
      status: d.status,
    })),
    accommodation,
    cleaningFee,
    securityDeposit,
    total: Math.round((accommodation + cleaningFee) * 100) / 100,
    feesKnown: (fees?.cleaningFee ?? 0) > 0,
    unavailable,
    currency: "EUR",
  };
}

/**
 * The supplier's day-by-day availability, in the shape AvailabilityCalendar
 * already speaks, so partner homes get the same calendar as the rest of the
 * portfolio instead of two native date inputs.
 */
export async function getPartnerCalendar(
  uid: string,
  startDate: string,
  endDate: string,
): Promise<Array<{ date: string; status: string; price?: number }> | null> {
  const key = process.env.TRIPWIX_API_KEY;
  if (!key || !uid) return null;

  const url = `${BASE}/properties/${uid}/calendar/?start_date=${startDate}&end_date=${endDate}`;
  try {
    const res = await fetch(url, { headers: { "X-Partner-API-Key": key } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return (data as CalendarDay[]).map((d) => ({
      date: d.date,
      // The calendar only ever sells "available"; everything else is closed.
      status: d.status === "available" ? "available" : "unavailable",
      price: d.price != null ? partnerGuestPrice(Number(d.price) || 0) : undefined,
    }));
  } catch {
    return null;
  }
}

/**
 * Defaults the partner feed does not carry. Partner homes are presented as
 * Portugal Active inventory (auditoria set/2026, N7), so they get the same
 * arrival window the rest of the portfolio publishes; the concierge adjusts
 * per stay when the supplier says otherwise.
 */
export const PARTNER_DEFAULT_CHECK_IN = "16:00";
export const PARTNER_DEFAULT_CHECK_OUT = "11:00";

/** Fill the fields a partner listing leaves empty so the PDP reads like our own. */
export function withPartnerDefaults<T extends Record<string, any>>(p: T): T {
  return {
    ...p,
    checkInTime: p.checkInTime || PARTNER_DEFAULT_CHECK_IN,
    checkOutTime: p.checkOutTime || PARTNER_DEFAULT_CHECK_OUT,
  };
}

/**
 * Partner amenities → the site's vocabulary (auditoria set/2026, N10).
 *
 * The feed carries 338 distinct strings, many of them supplier jargon that
 * never reached a guest on our own homes ("Outdoor dinning area",
 * "Family/kids friendly", "Family", "Theater", "Host checkin", "Tableware x2
 * sets"). Each raw string is mapped to the spelling our Guesty homes use, or
 * dropped when it names a service (the services section covers it), a
 * theme, or supplier logistics. Anything not in the map and not already in
 * our vocabulary is discarded — a partner home never shows a word our own
 * homes could not.
 */
const PARTNER_AMENITY_MAP: Record<string, string | string[] | null> = {
  // outdoor & pool
  "outdoor dinning area": "Outdoor dining area",
  "outdoor dining area": "Outdoor dining area",
  "sun loungers": "Outdoor seating (furniture)",
  "outdoor furniture": "Outdoor seating (furniture)",
  "deck/patio uncovered": "Patio or balcony",
  "terrace": "Patio or balcony",
  "balcony": "Patio or balcony",
  "veranda": "Patio or balcony",
  "lanai/gazebo covered": "Patio or balcony",
  "lawn garden": "Garden or backyard",
  "private outdoor pool": "Private pool",
  "outdoor pool": "Private pool",
  "pool": "Private pool",
  "private pool": "Private pool",
  "private heated outdoor pool": ["Private pool", "Heated pool"],
  "heated pool": "Heated pool",
  "salt water pool": "Salt water pool",
  "plunge pool": "Plunge pool",
  "private heated indoor pool": ["Indoor pool", "Heated pool"],
  "private indoor pool": "Indoor pool",
  "indoor pool": "Indoor pool",
  "communal pool": "Communal pool",
  "pool community": "Communal pool",
  "jacuzzi": "Hot tub",
  "outdoor jacuzzi": "Hot tub",
  "indoor jacuzzi": "Hot tub",
  "hot tub": "Hot tub",
  "outdoor shower": "Outdoor shower",
  "outdoor kitchen": "Outdoor kitchen",
  "bbq grill": "BBQ grill",
  "fire pit": "Fire Pit",
  "tennis court": "Tennis court",
  "tennis private": "Tennis court",
  "ping-pong table": "Ping pong table",
  "billiards / pool tables": "Pool table",
  "foosball": "Foosball table",
  "outdoor playground": "Outdoor playground",
  "vineyard": "Vineyard",
  "orchard": "Orchard",
  "gated community": "Gated community",
  // views & location
  "ocean view": "Sea view",
  "sea view": "Sea view",
  "beach view": "Beach View",
  "garden view": "Garden View",
  "mountain view": "Mountain view",
  "river view": "River view",
  "water view": "Water View",
  "golf course view": "Golf course view",
  "near ocean": "Near Ocean",
  "beach": "Beach",
  "beach access": "Beach access",
  "beachfront": "Beach Front",
  "oceanfront": "Ocean Front",
  "waterfront": "Waterfront",
  "rural": "Rural",
  "village": "Village",
  "town": "Town",
  "downtown": "Downtown",
  "mountain": "Mountain",
  "golf": "Golf - Optional",
  "beach essentials": "Beach essentials",
  // comfort & climate
  "fireplace": "Indoor fireplace",
  "indoor fireplace": "Indoor fireplace",
  "wood-burning fireplace": "Indoor fireplace",
  "gas fireplace": "Indoor fireplace",
  "heating": "Heating",
  "central heating": "Heating",
  "underfloor heating": "Underfloor heating",
  "air conditioning": "Air conditioning",
  "individual room ac": "Air conditioning",
  "ceiling fan": "Portable fans",
  "blackout blinds": "Room-darkening shades",
  "room-darkening shades": "Room-darkening shades",
  "shutters": "Room-darkening shades",
  "electric shutters": "Room-darkening shades",
  "electric blinds": "Room-darkening shades",
  // kitchen & dining
  "full kitchen": "Kitchen",
  "kitchen": "Kitchen",
  "kitchenette": "Kitchen",
  "dining area": "Dining table",
  "dining table": "Dining table",
  "cooking basics": "Cookware",
  "fridge": "Refrigerator",
  "fridge / freezer": "Refrigerator",
  "refrigerator": "Refrigerator",
  "freezer": "Freezer",
  "espresso machine": "Coffee maker",
  "coffee maker": "Coffee maker",
  "coffee": "Coffee",
  "electric kettle": "Kettle",
  "kettle": "Kettle",
  "gas/electric hob": "Stove",
  "hob burners": "Stove",
  "stove": "Stove",
  "oven": "Oven",
  "microwave": "Microwave",
  "dishwasher": "Dishwasher",
  "toaster": "Toaster",
  "blender": "Blender",
  "ice maker": "Ice maker",
  "wine cooler": "Wine cellar",
  "wine cellar": "Wine cellar",
  "dishes and silverware": "Dishes and silverware",
  "wine glasses": "Wine glasses",
  // entertainment
  "tv": "TV",
  "cable tv": "Cable TV",
  "satellite tv": "Cable TV",
  "smart tv": "Smart TV",
  "big screen tv": "Smart TV",
  "sound system": "Sound system",
  "stereo": "Sound system",
  "speakers": "Sound system",
  "hi-fi": "Sound system",
  "games": "Board games",
  "board games": "Board games",
  "video games": "Game console",
  "game room": "Game room",
  "books": "Books",
  "books and reading magazines": "Books",
  "library": "Books",
  "piano": "Piano",
  "movie theater": "Home cinema",
  "theater": "Home cinema",
  "media room": "Home cinema",
  "projector": "Home cinema",
  // connectivity & work
  "wireless internet": "Wireless Internet",
  "free wireless internet": "Wireless Internet",
  "free internet access": "Wireless Internet",
  "internet connection": "Wireless Internet",
  "high speed internet access": "Wireless Internet",
  "free cable internet": "Wireless Internet",
  "wifi speed (250 mbps)": "Wireless Internet",
  "dedicated workspace": "Laptop friendly workspace",
  "laptop friendly workspace": "Laptop friendly workspace",
  "office": "Laptop friendly workspace",
  "desk": "Desk",
  // wellness & fitness
  "gym": "Gym",
  "fitness room": "Gym",
  "fitness private": "Gym",
  "fitness community": "Gym",
  "fitness equipment": "Gym",
  "exercise equipment": "Gym",
  "fitness center or spa": "Gym",
  "a gym is in the building for guests to use": "Gym",
  "sauna": "Sauna",
  "sauna private": "Sauna",
  "sauna community": "Sauna",
  "spa": "Spa",
  "steam room": "Steam room",
  "hammam": "Steam room",
  "massage room": "Massage room",
  "bikes": "Bikes",
  "bicycle rentals": "Bicycles available",
  "kayak": "Kayak",
  "water sports": "Water Sports",
  "fishing": "Fishing",
  // parking & access
  "parking": "Free parking on premises",
  "private parking": "Free parking on premises",
  "free parking on premises": "Free parking on premises",
  "free parking on the street": "Free parking on street",
  "free parking with garage": "Garage",
  "garage": "Garage",
  "guarded parking": "Free parking on premises",
  "ev charger": "EV charger",
  "private entrance": "Private entrance",
  "elevator in building": "Elevator",
  "ground floor": "Single level home",
  "single level home": "Single level home",
  "step-free access": "Step-free access",
  "wheelchair access possible": "Wheelchair accessible",
  "wide doorway": "Wide doorway",
  "wide hallway clearance": "Wide hallway clearance",
  "wide clearance to bed": "Wide clearance to bed",
  // laundry
  "washer": "Washer",
  "washer on property": "Washer",
  "laundry": "Washer",
  "laundry on-site": "Washer",
  "laundry room": "Washer",
  "washing machine with dryer": ["Washer", "Dryer"],
  "washer and dryer": ["Washer", "Dryer"],
  "dryer": "Dryer",
  "dryer on property": "Dryer",
  "drying rack": "Drying rack",
  "iron": "Iron",
  "laundromat nearby": "Laundromat nearby",
  // bathroom
  "bathtub": "Bathtub",
  "hair dryer": "Hair dryer",
  "en suite bathroom": "En suite bathroom",
  // family
  "family": "Family/kid friendly",
  "family friendly": "Family/kid friendly",
  "family/kids friendly": "Family/kid friendly",
  "kids' amenities": "Family/kid friendly",
  "crib": "Crib",
  "free cot on request": "Crib",
  "high chair": "High chair",
  "baby high chair": "High chair",
  "baby chair on request": "High chair",
  "children’s books and toys": "Children’s books and toys",
  "children's playroom": "Children’s books and toys",
  "childrens pool": "Childrens pool",
  "child proofing for pool": "Fenced pool",
  "fenced pool": "Fenced pool",
  "trampoline": "Trampoline",
  // safety
  "smoke detector": "Smoke detector",
  "smoke alarm": "Smoke detector",
  "carbon monoxide detector": "Carbon monoxide detector",
  "fire extinguisher": "Fire extinguisher",
  "first aid kit": "First aid kit",
  "safe": "Safe",
  "alarm system": "Security system",
  "security system": "Security system",
  "24 hour security": "24-hour security",
  "emergency exit": "Emergency exit",
  // pets
  "pets allowed": "Pets allowed",
  "ask for pets": null,
  // services, themes, logistics and hygiene: not amenities of the house
  "concierge": null, "host checkin": null, "house cleaning included": null, "house cleaning optional": null,
  "cleaning available during stay": null, "daily housekeeper": null, "daily housekeeper fee": null,
  "daily housekeeper on request": null, "housekeeping service": null, "housekeeping": null, "site staff": null,
  "site staff on request": null, "wait staff": null, "staff quarters": null, "service entrance": null,
  "chef on request": null, "chef fee": null, "chef provided": null, "in-house chef": null, "bartender on request": null,
  "grocery on request": null, "grocery fee": null, "local groceries": null, "pantry items": null,
  "breakfast": null, "breakfast preparation": null, "continental breakfast": null, "breakfast booking possible": null,
  "breakfast room": null, "meal included": null, "babysitter fee": null, "babysitting/child services": null,
  "babysitter recommendations": null, "car recommended": null, "car necessary": null, "free car": null,
  "romantic": null, "luxury": null, "historic": null, "resort": null, "resort access": null, "access to hotel facilities": null,
  "restaurant": null, "bar": null, "minibar": null, "beach club": null, "multilingual": null,
  "long term stays allowed": null, "luggage dropoff allowed": null, "luggage storage facilities": null,
  "infants not allowed": null, "arrivals on sunday": null, "ask for smoking": null,
  "cleaned with disinfectant": null, "clean & safe (portugal)": null, "linens/towels high temperature washed": null,
  "toiletries": null, "towels": null, "bed linens": null, "shampoo": null, "conditioner": null, "shower gel": null, "body soap": null,
  "hangers": null, "hot water": null, "essentials": null, "cleaning products": null, "extra pillows and blankets": null,
  "private living room": null, "dining room": null, "lounge": null, "curtains": null, "mirror": null, "sofa": null, "armchair": null,
  "night table": null, "built-in wardrobes": null, "wardrobe": null, "clothing storage": null, "desk chair": null,
  "table and chairs": null, "kitchen island": null, "breakfast bar and stools": null, "tableware x2 sets": null,
  "tableware x3 or more sets": null, "barbecue utensils": null, "outdoor lighting": null, "heated towel bar": null,
  "handheld shower head": null, "shower": null, "bidet": null, "intercom": null, "lock on bedroom door": null,
  "mosquito net": null, "slippers": null, "robes": null, "music library": null, "video library": null, "dvd player": null,
  "dvd": null, "netflix": null, "apple tv": null, "tv (local channels only)": null, "tv room": null, "printer": null,
  "fireplace guards": null, "original artwork": null, "courtyard": null, "fenced yard": null, "boat slip": null,
  "dock": null, "private dock": null, "multi-use court": null, "volleyball court": null, "children area": null,
  "children’s dinnerware": null, "books for kids": null, "stroller": null, "elliptical trainer": null, "exercise bike": null,
  "free weights": null, "treadmill": null, "pilates ball": null, "ramp access to buildings": null,
};

/** Flatten the supplier's grouped amenities into the site vocabulary. */
export function normalizePartnerAmenities(
  grouped: Record<string, string[]> | string[] | undefined,
  siteVocabulary: ReadonlySet<string>,
): Record<string, string[]> {
  const raw = Array.isArray(grouped) ? grouped : Object.values(grouped || {}).flat();
  const vocabByLower = new Map<string, string>();
  for (const v of siteVocabulary) vocabByLower.set(v.toLowerCase(), v);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: string) => { if (!seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); } };
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const key = item.trim().toLowerCase();
    if (key in PARTNER_AMENITY_MAP) {
      const mapped = PARTNER_AMENITY_MAP[key];
      if (mapped === null) continue;
      for (const v of Array.isArray(mapped) ? mapped : [mapped]) push(v);
      continue;
    }
    const own = vocabByLower.get(key);
    if (own) push(own);
    // else: not a word our homes use — dropped.
  }
  return { property: out };
}
