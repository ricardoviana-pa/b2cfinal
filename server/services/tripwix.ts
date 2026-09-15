/** Tripwix rates remain subject to supplier confirmation; fees may be incomplete. */
import { readTripwixCalendar, validDate, type TripwixDay } from './tripwix-calendar';

/** Existing supplier contract treatment; no change to VAT or commission rules. */
export const PARTNER_VAT_RATE = 0.06;
export function partnerGuestPrice(net: number): number {
  return Math.round(net * (1 + PARTNER_VAT_RATE) * 100) / 100;
}

export type PartnerFees = { cleaningFee?: number; securityDeposit?: number; minNights?: number; maxGuests?: number; guests?: number };
export type PartnerQuote = {
  available: boolean;
  nights: number;
  perNight: Array<{ date: string; price: number; status: string }>;
  accommodation: number;
  cleaningFee: number;
  total: number;
  securityDeposit: number;
  feesKnown: boolean;
  unavailable: string[];
  currency: 'EUR';
  source?: 'live' | 'cached';
  fetchedAt?: number;
};

/** Require one valid price for every charged night; never sum a partial calendar. */
export function pricePartnerStay(days: TripwixDay[], checkIn: string, checkOut: string, fees: PartnerFees = {}): PartnerQuote | null {
  if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn) return null;
  const count = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400_000;
  if (count > 90) return null;
  const selected: TripwixDay[] = [];
  for (let n = 0; n < count; n++) {
    const date = new Date(Date.parse(checkIn) + n * 86400_000).toISOString().slice(0, 10);
    const matches = days.filter(d => d.date === date);
    if (matches.length !== 1 || !Number.isFinite(Number(matches[0].price)) || Number(matches[0].price) <= 0) return null;
    selected.push(matches[0]);
  }
  const unavailable = selected.filter(d => d.status !== 'available').map(d => d.date);
  const accommodation = partnerGuestPrice(selected.reduce((sum, d) => sum + Number(d.price), 0));
  const cleaningFee = Math.round(Math.max(0, fees.cleaningFee ?? 0) * 100) / 100;
  const securityDeposit = Math.round(Math.max(0, fees.securityDeposit ?? 0) * 100) / 100;
  return {
    available: !unavailable.length && count >= (fees.minNights ?? 1) && !(fees.maxGuests && fees.guests && fees.guests > fees.maxGuests),
    nights: count,
    perNight: selected.map(d => ({ date: d.date, price: partnerGuestPrice(Number(d.price)), status: d.status })),
    accommodation, cleaningFee, securityDeposit,
    total: Math.round((accommodation + cleaningFee) * 100) / 100,
    // Imported zero is unknown, not a promise of no charge.
    feesKnown: cleaningFee > 0,
    unavailable, currency: 'EUR',
  };
}

export async function getPartnerQuote(uid: string, checkIn: string, checkOut: string, fees?: PartnerFees): Promise<PartnerQuote | null> {
  if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn || Date.parse(checkOut) - Date.parse(checkIn) > 90 * 86400_000) return null;
  const snapshot = await readTripwixCalendar(uid, checkIn, checkOut);
  if (!snapshot) return null;
  const quote = pricePartnerStay(snapshot.days, checkIn, checkOut, fees);
  return quote ? { ...quote, source: snapshot.source, fetchedAt: snapshot.fetchedAt } : null;
}

const fromCache = new Map<string, { value: number | null; at: number }>();

/** The lowest average nightly rate of an available minimum-length stay in 90 days. */
export async function getTripwixLowestNightly(uid: string, minNights = 1): Promise<number | null> {
  const cacheKey = `${uid}:${minNights}`;
  const cached = fromCache.get(cacheKey);
  if (cached && Date.now() - cached.at < (cached.value === null ? 60_000 : 8 * 3600_000)) return cached.value;
  const start = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.parse(start) + 90 * 86400_000).toISOString().slice(0, 10);
  const snapshot = await readTripwixCalendar(uid, start, end);
  if (!snapshot) { fromCache.set(cacheKey, { value: null, at: Date.now() }); return null; }
  const prices = snapshot.days.filter(d => d.date < end).map(d => {
    const checkOut = new Date(Date.parse(d.date) + Math.max(1, minNights) * 86400_000).toISOString().slice(0, 10);
    if (checkOut > end) return null;
    const q = pricePartnerStay(snapshot.days, d.date, checkOut);
    return q?.available ? q.accommodation / q.nights : null;
  }).filter((v): v is number => v !== null && v > 0);
  const value = prices.length ? Math.round(Math.min(...prices)) : null;
  if (fromCache.size >= 120 && !fromCache.has(cacheKey)) fromCache.delete(fromCache.keys().next().value!);
  fromCache.set(cacheKey, { value, at: Date.now() });
  return value;
}

export async function getPartnerCalendar(uid: string, startDate: string, endDate: string) {
  const snapshot = await readTripwixCalendar(uid, startDate, endDate);
  return snapshot?.days.map(d => ({ date: d.date,
    status: d.status === 'available' && Number(d.price) > 0 ? 'available' : 'unavailable',
    price: Number(d.price) > 0 ? partnerGuestPrice(Number(d.price)) : undefined,
  })) ?? null;
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
