/**
 * Amenities on the home's page (PropertyDetail): Guesty exports ~60–90 raw
 * English strings per home ("Grab-rails for shower and toilet", "Water
 * Parks", "Coin Laundry"…). This module turns them into
 *   - the KEY amenities: the features that sell the home, each with an icon
 *     and a translated label (amenityHighlight.* in the nine locales);
 *   - the full list by category, one pictogram each, for the "Show all"
 *     dialog, with the junk hidden and the near-synonyms folded.
 * Pure functions, no React: server/pdp-amenities.test.ts covers them.
 */
import {
  Accessibility, Baby, Bath, Bed, BedDouble, BedSingle, Blinds, BookOpen, Car, Coffee, CookingPot,
  Dices, Dumbbell, Flame, Footprints, KeyRound, Landmark, Monitor, Mountain, Music, Palmtree, PawPrint,
  Refrigerator, Sailboat, Shirt, ShieldCheck, ShowerHead, Sofa, Sparkles, Sun, Thermometer, TreePine, Tv,
  Utensils, UtensilsCrossed, Volleyball, WashingMachine, Waves, Wifi, Wind, Zap, type LucideIcon,
} from 'lucide-react';
import { hasSwimmingPool } from '@/lib/homeSearch';

export type AmenityGroup = { category: string; label: string; icon: LucideIcon; items: string[] };
export type KeyAmenity = { key: string; icon: LucideIcon; label: string };
export type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/** Categories for grouping amenities. An item goes to the category with the
 *  LONGEST matching keyword ("Garden View" is a view before it is a garden,
 *  "Disabled parking spot" is accessibility before it is parking, "Mountain
 *  biking" is a thing to do nearby before it is a view); ties go to the
 *  earlier category. AMENITY_DISPLAY_ORDER sets the order the guest sees. */
export const AMENITY_CATEGORIES: { key: string; label: string; icon: LucideIcon; keywords: string[] }[] = [
  { key: 'outdoor', label: 'amenity.outdoorPool', icon: Waves, keywords: [
    'pool', 'swimming', 'infinity', 'heated pool', 'outdoor pool', 'private pool', 'hot tub', 'jacuzzi',
    'garden', 'backyard', 'terrace', 'patio', 'balcony', 'outdoor seating', 'outdoor furniture',
    'bbq', 'grill', 'barbecue', 'barbeque', 'pool table', 'tennis', 'table tennis', 'outdoor kitchen',
    'sun lounger', 'outdoor shower', 'fire pit', 'hammock', 'outdoor dining', 'pergola', 'veranda', 'porch',
    'lawn', 'orchard', 'vineyard', 'playground', 'trampoline', 'swing', 'beach chairs', 'beach towels',
  ]},
  { key: 'views', label: 'amenity.viewsLocation', icon: Mountain, keywords: [
    'ocean view', 'sea view', 'beach', 'beachfront', 'mountain', 'garden view', 'lake', 'river', 'town',
    'near ocean', 'rural', 'village', 'countryside', 'waterfront', 'valley', 'city view', 'resort', 'view',
  ]},
  { key: 'comfort', label: 'amenity.comfortClimate', icon: Wind, keywords: [
    'air conditioning', 'heating', 'indoor fireplace', 'fireplace', 'ceiling fan', 'portable fan',
    'room-darkening', 'blackout', 'shades', 'mosquito net', 'dehumidifier', 'radiator',
  ]},
  { key: 'kitchen', label: 'amenity.kitchenDining', icon: Utensils, keywords: [
    'kitchen', 'fully equipped', 'oven', 'microwave', 'stove', 'refrigerator', 'dishwasher',
    'coffee', 'nespresso', 'espresso', 'kettle', 'toaster', 'blender', 'dining', 'wine', 'rice cooker',
    'freezer', 'ice maker', 'mini bar', 'minibar',
  ]},
  { key: 'entertainment', label: 'amenity.entertainment', icon: Tv, keywords: [
    'tv', 'cable tv', 'smart tv', 'sound system', 'stereo', 'speaker', 'board games', 'books', 'netflix',
    'streaming', 'projector', 'game console', 'piano', 'record player', 'bluetooth', 'foosball', 'darts',
  ]},
  { key: 'connectivity', label: 'amenity.connectivityWork', icon: Wifi, keywords: [
    'wifi', 'internet', 'wireless', 'workspace', 'desk', 'laptop', 'home office', 'monitor', 'printer', 'ethernet',
  ]},
  { key: 'wellness', label: 'amenity.wellnessFitness', icon: Dumbbell, keywords: [
    'gym', 'fitness', 'workout', 'sauna', 'spa', 'yoga', 'massage', 'hammam', 'steam room', 'exercise',
    'treadmill', 'bicycle', 'bikes',
  ]},
  { key: 'parking', label: 'amenity.parkingAccess', icon: Car, keywords: [
    'parking', 'garage', 'ev charging', 'electric vehicle', 'private entrance', 'self check-in', 'lockbox',
    'keypad', 'smart lock', 'carport', 'driveway',
  ]},
  { key: 'laundry', label: 'amenity.laundryHousekeeping', icon: Shirt, keywords: [
    'washer', 'washing machine', 'clothes dryer', 'dryer', 'laundry', 'iron', 'drying rack', 'housekeeping',
    'cleaning available',
  ]},
  { key: 'bathroom', label: 'amenity.bathroom', icon: Bath, keywords: [
    'bathtub', 'hair dryer', 'bidet', 'shower', 'toiletries', 'bathrobe', 'towels',
  ]},
  { key: 'family', label: 'amenity.familyFriendly', icon: Baby, keywords: [
    'crib', 'high chair', 'children', 'infants', 'baby', 'kids', 'kid friendly', 'family', 'toys', 'stroller',
    'changing table', 'playpen', 'stair gate', 'window guard', 'outlet cover', 'corner guard', 'toddler',
  ]},
  { key: 'safety', label: 'amenity.safety', icon: ShieldCheck, keywords: [
    'smoke detector', 'smoke alarm', 'fire extinguisher', 'first aid', 'security', 'safe', 'carbon monoxide',
    'lock on bedroom', 'cctv', 'alarm',
  ]},
  { key: 'accessibility', label: 'amenity.accessibility', icon: Accessibility, keywords: [
    'wheelchair', 'accessible', 'roll-in shower', 'grab-rail', 'grab rail', 'grab bar', 'wide doorway', 'wide clearance', 'wide hallway',
    'wide entrance', 'step-free', 'no stairs', 'single level', 'flat path', 'disabled parking', 'shower bench',
    'shower chair', 'hoist', 'handrail', 'elevator', 'lift',
  ]},
  // Guesty's "nearby activities" tags: not features of the home, so they are
  // kept out of the key list and shown last in the full one.
  { key: 'nearby', label: 'amenity.nearby', icon: Footprints, keywords: [
    'cycling', 'fishing', 'museum', 'shopping', 'water park', 'water sports', 'horseback', 'golf', 'hiking',
    'kayak', 'surf', 'bird watching', 'climbing', 'wine tasting', 'theme park', 'zoo', 'boating', 'sailing',
    'snorkel', 'diving', 'rafting', 'paddle', 'whale', 'restaurants', 'nightlife', 'skiing', 'sledding',
    'snowmobil', 'ice skating', 'cross-country', 'mountain biking', 'hunting', 'motorcycling', 'four-wheeling',
    'sightseeing', 'spelunking', 'marina', 'jet ski', 'windsurf', 'kitesurf', 'wildlife', 'waterskiing', 'scuba',
    'basketball court', 'skate', 'beach nearby', 'ski-in',
  ]},
];

/** The order the guest reads the groups in: the home's own features first,
 *  practical and accessibility details next, the surroundings last. */
export const AMENITY_DISPLAY_ORDER = [
  'outdoor', 'views', 'comfort', 'kitchen', 'entertainment', 'connectivity', 'wellness', 'parking',
  'laundry', 'bathroom', 'family', 'safety', 'accessibility', 'other', 'nearby',
];

/** Amenities to completely hide — zero value to guests */
export const AMENITY_BLACKLIST = new Set([
  'essentials', 'hot water', 'hangers', 'clothing storage', 'bed linens', 'towels provided',
  'cleaning disinfection', 'enhanced cleaning practices', 'high touch surfaces disinfected',
  'shampoo', 'shower gel', 'cookware', 'dishes and silverware', 'baking sheet', 'barbeque utensils',
  'wine glasses', 'wide hallway clearance', 'accessible-height bed',
  'freezer', 'babysitter recommendations', 'long term stays allowed',
  'cleaning products', 'cleaning before checkout', 'coin laundry', 'washer in common space',
  'dryer in common space', 'extra pillows and blankets', 'beach essentials', 'host greets you',
  'luggage dropoff allowed', 'body soap', 'conditioner', 'bed sheets', 'paid parking off premises',
]);

/** Near-synonyms Guesty exports side by side ("Swimming pool", "Outdoor
 *  pool", "Communal pool"; "Internet", "Wireless Internet"). One line each. */
const AMENITY_DEDUPE_GROUPS: { test: RegExp; exclude?: RegExp; qualifiers?: RegExp }[] = [
  // A pool with a qualifier (heated, private, communal…) says something a
  // guest cares about and stays; the generic "Swimming pool" / "Outdoor pool"
  // only stay when nothing more specific is there.
  { test: /\bpool\b/i, exclude: /pool\s*(table|toys?|towels?|hoist|cover|fence|alarm|house|bar|noodles?)|plunge|kids'? pool|children'?s? pool|baby pool/i, qualifiers: /heated|private|infinity|communal|shared|indoor|salt|lap/i },
  { test: /\bparking\b/i, exclude: /disabled|accessible|\bev\b|charg|paid/i },
  { test: /\b(tv|television|hdtv)\b/i },
  { test: /\bcoffee\b/i },
  { test: /\bkitchen\b/i, exclude: /outdoor|summer|kitchenette/i },
  { test: /\b(wifi|wi-fi|internet|wireless)\b/i, exclude: /pocket/i },
  { test: /\bgarden\b/i, exclude: /view/i },
  { test: /sound system|stereo/i },
];

/** Hide the junk, fold the exact duplicates, then the near-synonyms. */
export function deduplicateAmenities(items: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const original of items) {
    const lower = original.toLowerCase().trim();
    if (!lower || AMENITY_BLACKLIST.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    kept.push(original.trim());
  }
  const drop = new Set<string>();
  for (const group of AMENITY_DEDUPE_GROUPS) {
    const members = kept.filter((a) => group.test.test(a) && !(group.exclude && group.exclude.test(a)));
    if (members.length < 2) continue;
    if (group.qualifiers) {
      const qualified = members.filter((a) => group.qualifiers!.test(a));
      if (qualified.length) {
        members.forEach((a) => { if (!qualified.includes(a)) drop.add(a); });
        continue;
      }
    }
    // Otherwise keep the most descriptive (longest) name of the group.
    const best = [...members].sort((a, b) => b.length - a.length)[0];
    members.forEach((a) => { if (a !== best) drop.add(a); });
  }
  return kept.filter((a) => !drop.has(a));
}

/** The category of one amenity: the longest matching keyword wins. */
export function amenityCategory(item: string): string | null {
  const lower = item.toLowerCase().trim();
  let best: { key: string; len: number } | null = null;
  for (const cat of AMENITY_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (lower.includes(kw) && (!best || kw.length > best.len)) best = { key: cat.key, len: kw.length };
    }
  }
  return best?.key ?? null;
}

/** Categorize amenities into groups, in the display order. */
export function categorizeAmenities(items: string[]): AmenityGroup[] {
  const deduplicated = deduplicateAmenities(items);
  const categorized: Record<string, string[]> = {};
  const uncategorized: string[] = [];
  for (const item of deduplicated) {
    const key = amenityCategory(item);
    if (!key) { uncategorized.push(item); continue; }
    (categorized[key] ||= []).push(item);
  }
  const groups: AmenityGroup[] = [];
  for (const key of AMENITY_DISPLAY_ORDER) {
    if (key === 'other') {
      if (uncategorized.length) groups.push({ category: 'other', label: 'amenity.other', icon: Sparkles, items: uncategorized });
      continue;
    }
    const cat = AMENITY_CATEGORIES.find((c) => c.key === key);
    if (cat && categorized[key]?.length) groups.push({ category: key, label: cat.label, icon: cat.icon, items: categorized[key] });
  }
  return groups;
}

/** One pictogram per raw Guesty amenity, for the full list. First match wins,
 *  so the specific rules ("hair dryer" is bathroom, not laundry) come first. */
const AMENITY_ICON_RULES: [RegExp, LucideIcon][] = [
  [/pool table|billiard|foosball|darts|board games|game console|games? room/i, Dices],
  [/\bpool\b|jacuzzi|hot ?tub|plunge/i, Waves],
  [/sauna|\bspa\b|massage|hammam|steam/i, Sparkles],
  [/fireplace|fire ?pit|wood stove|wood-burning/i, Flame],
  [/\bbbq\b|barbe|\bgrill\b|outdoor kitchen/i, UtensilsCrossed],
  [/air conditioning|\ba\/c\b|cooling|ceiling fan|portable fan/i, Wind],
  [/heating|heater|radiator|underfloor/i, Thermometer],
  [/wifi|wi-fi|internet|ethernet|wireless/i, Wifi],
  [/\btv\b|television|netflix|streaming|projector|hdtv|cable/i, Tv],
  [/sound system|stereo|speaker|bluetooth|record player|piano|music/i, Music],
  [/workspace|\bdesk\b|laptop|home office|monitor|printer/i, Monitor],
  [/ev charg|electric vehicle/i, Zap],
  [/parking|garage|carport|driveway/i, Car],
  [/hair ?dryer|shampoo|shower|bathtub|\bbath\b|bidet|toiletries|bathrobe|towels|hot water/i, ShowerHead],
  [/washer|washing machine|laundry|laundromat/i, WashingMachine],
  [/dryer|\biron\b|drying rack|clothing|hangers/i, Shirt],
  [/coffee|nespresso|espresso|\btea\b|kettle/i, Coffee],
  [/refrigerator|fridge|freezer|mini ?bar|ice maker|wine cooler/i, Refrigerator],
  [/dishwasher|oven|stove|cooktop|microwave|toaster|blender|cookware|dishes|silverware|rice cooker|baking/i, CookingPot],
  [/kitchen|dining|\btable\b|cutlery|wine glasses|breakfast/i, Utensils],
  [/crib|\bcot\b|high ?chair|baby|infant|children|kids|toys|stroller|changing table|playpen|stair gate|window guard|outlet cover|corner guard|toddler|playground|trampoline|family/i, Baby],
  [/gym|fitness|exercise|yoga|treadmill|weights|\bbikes?\b|bicycle|cycling/i, Dumbbell],
  [/tennis|padel|basketball|volleyball|ping ?pong/i, Volleyball],
  [/garden|backyard|\blawn\b|orchard|vineyard|terrace|patio|balcony|veranda|porch|outdoor seating|outdoor furniture|sun lounger|hammock|outdoor dining|pergola|outdoor shower/i, TreePine],
  [/ocean|sea view|beach|waterfront|coast|marina|lake|river/i, Palmtree],
  [/mountain|valley|rural|countryside|village|\btown\b|city|\bview\b|resort/i, Mountain],
  [/private entrance|self check-in|lockbox|keypad|smart lock|\bkeys?\b|doorman|concierge|luggage|elevator|lift/i, KeyRound],
  [/smoke|carbon monoxide|fire extinguisher|first aid|\bsafe\b|security|alarm|cctv|lock on bedroom/i, ShieldCheck],
  [/\bpets?\b|\bdogs?\b|\bcats?\b/i, PawPrint],
  [/wheelchair|accessib|roll-in|grab|wide|step-free|single level|flat path|hoist|handrail/i, Accessibility],
  [/books?\b|library|reading/i, BookOpen],
  [/blinds|shades|blackout|curtain|darkening/i, Blinds],
  [/linen|\bbed\b|bedding|pillow|blanket|mattress|closet|wardrobe/i, Bed],
  [/museum|shopping|restaurant|nightlife|sightseeing|landmark|historic|culture/i, Landmark],
  [/fishing|boat|sailing|kayak|surf|snorkel|diving|rafting|paddle|jet ski|water sports|water park|whale/i, Sailboat],
  [/hiking|walking|climbing|horse|golf|ski|sled|snow|hunting|zoo|theme park|wildlife|bird/i, Footprints],
  [/sun|solar/i, Sun],
];

export function amenityIcon(label: string): LucideIcon {
  for (const [re, icon] of AMENITY_ICON_RULES) if (re.test(label)) return icon;
  return Sparkles;
}

/**
 * The key amenities: the features that sell the home, each with its own icon
 * and a translated label (amenityHighlight.* in the nine locales — the raw
 * Guesty wording is English in every language). Order = priority: the first
 * six head the page under the facts, up to ten open the amenities section;
 * the full raw list sits behind "Show all". Patterns are matched
 * case-insensitively against the home's amenity strings.
 */
const hasAny = (re: RegExp) => (items: string[]) => items.some((it) => re.test(it));
export const AMENITY_HIGHLIGHTS: { key: string; icon: LucideIcon; test: (items: string[]) => boolean }[] = [
  // "Pool table" is a games-room item, not a swimming pool; the same rule as
  // the pool filter so the highlight and the PLP agree. "Private" only when
  // Guesty says so: a shared estate pool is just "Swimming pool".
  { key: 'privatePool', icon: Waves, test: (items) => hasSwimmingPool(items) && items.some((it) => /private pool/i.test(it)) },
  { key: 'swimmingPool', icon: Waves, test: (items) => hasSwimmingPool(items) && !items.some((it) => /private pool/i.test(it)) },
  { key: 'heatedPool', icon: Waves, test: hasAny(/heated (?:swimming |outdoor |indoor )?pool|pool (?:is )?heated/i) },
  { key: 'seaView', icon: Palmtree, test: hasAny(/\b(ocean|sea|beach(?:front)?)\b.*view|view.*\b(ocean|sea|beach)\b|beachfront/i) },
  { key: 'nearOcean', icon: Palmtree, test: (items) => hasAny(/near (?:the )?ocean|near (?:the )?sea|waterfront|beach access|steps? (?:from|to) (?:the )?beach/i)(items) && !hasAny(/\b(ocean|sea|beach(?:front)?)\b.*view|view.*\b(ocean|sea|beach)\b/i)(items) },
  { key: 'mountainView', icon: Mountain, test: hasAny(/mountain view|valley view/i) },
  { key: 'riverView', icon: Mountain, test: hasAny(/(?:river|lake) ?view|lakefront|riverfront|lake access|river access/i) },
  { key: 'jacuzzi', icon: Waves, test: hasAny(/jacuzzi|hot ?tub/i) },
  { key: 'sauna', icon: Sparkles, test: hasAny(/\bsauna\b/i) },
  { key: 'fireplace', icon: Flame, test: hasAny(/fireplace|fire ?pit|wood stove/i) },
  { key: 'bbq', icon: UtensilsCrossed, test: hasAny(/\bbbq\b|barbe|\bgrill\b|outdoor kitchen/i) },
  { key: 'garden', icon: TreePine, test: hasAny(/private garden|\bgarden\b(?! view)|backyard|\blawn\b/i) },
  { key: 'terrace', icon: Sun, test: hasAny(/terrace|patio|balcony|veranda|rooftop/i) },
  { key: 'airConditioning', icon: Wind, test: hasAny(/air conditioning|air-conditioning|\ba\/c\b/i) },
  { key: 'heating', icon: Thermometer, test: hasAny(/^heating$|central heating|underfloor heating|radiator/i) },
  { key: 'wifi', icon: Wifi, test: hasAny(/wifi|wi-fi|internet/i) },
  { key: 'workspace', icon: Monitor, test: hasAny(/home office|workspace|\bdesk\b/i) },
  { key: 'kitchen', icon: Utensils, test: hasAny(/^kitchen$|fully equipped kitchen|full kitchen/i) },
  { key: 'dishwasher', icon: CookingPot, test: hasAny(/dishwasher/i) },
  { key: 'washer', icon: WashingMachine, test: hasAny(/^washer\b|washing machine|^laundry$/i) },
  { key: 'tv', icon: Tv, test: hasAny(/\btv\b|television|hdtv/i) },
  { key: 'crib', icon: Baby, test: hasAny(/\bcrib\b|\bcot\b|travel crib|pack 'n play/i) },
  { key: 'gym', icon: Dumbbell, test: hasAny(/\bgym\b|fitness|exercise equipment/i) },
  { key: 'evCharging', icon: Zap, test: hasAny(/ev charg|electric vehicle/i) },
  { key: 'parking', icon: Car, test: hasAny(/free parking|parking on premises|\bgarage\b|private parking|carport|driveway/i) },
];

export const KEY_AMENITIES_MAX = 10;

/** The translated highlights, then — when a home matches fewer than six —
 *  its own first raw features, so the list never looks thin. */
export function pickKeyAmenities(allAmenityItems: string[], groups: AmenityGroup[], t: TranslateFn): KeyAmenity[] {
  const out: KeyAmenity[] = [];
  // The raw strings a highlight already stands for ("Wireless Internet" is
  // the wifi line), so the padding below never repeats one of them.
  const covered = new Set<string>();
  for (const { key, icon, test } of AMENITY_HIGHLIGHTS) {
    if (out.length >= KEY_AMENITIES_MAX) break;
    if (!test(allAmenityItems)) continue;
    out.push({ key, icon, label: String(t(`amenityHighlight.${key}`, { defaultValue: key })) });
    allAmenityItems.forEach((item) => { if (test([item])) covered.add(item.toLowerCase().trim()); });
  }
  if (out.length < 6) {
    for (const group of groups) {
      if (['nearby', 'accessibility', 'safety', 'other'].includes(group.category)) continue;
      for (const item of group.items) {
        if (out.length >= 6) break;
        if (covered.has(item.toLowerCase().trim())) continue;
        covered.add(item.toLowerCase().trim());
        out.push({ key: `raw:${item}`, icon: amenityIcon(item), label: item });
      }
    }
  }
  return out;
}

/** Bed types as Guesty exports them → pictogram + the plural-aware line
 *  ("1 queen bed", "2 single beds": beds.* in the locales). */
export const BED_TYPES: Record<string, { key: string; icon: LucideIcon }> = {
  KING_BED: { key: 'king', icon: BedDouble },
  QUEEN_BED: { key: 'queen', icon: BedDouble },
  DOUBLE_BED: { key: 'double', icon: BedDouble },
  SINGLE_BED: { key: 'single', icon: BedSingle },
  SOFA_BED: { key: 'sofa', icon: Sofa },
  COUCH: { key: 'sofa', icon: Sofa },
  BUNK_BED: { key: 'bunk', icon: Bed },
  AIR_MATTRESS: { key: 'air', icon: Bed },
  FLOOR_MATTRESS: { key: 'floor', icon: Bed },
  CRIB: { key: 'crib', icon: Baby },
  TODDLER_BED: { key: 'toddler', icon: Baby },
};

export function bedTypeOf(bedType: string): { key: string; icon: LucideIcon } | null {
  const normalized = (bedType || '').toUpperCase().replace(/[\s-]+/g, '_');
  return BED_TYPES[normalized] ?? null;
}

export function bedLine(bed: { type?: string; quantity?: number }, t: TranslateFn): string {
  const qty = Math.max(1, Number(bed.quantity) || 1);
  const def = bedTypeOf(bed.type || '');
  if (!def) return `${qty} × ${bed.type || String(t('bedTypes.bed', { defaultValue: 'Bed' }))}`;
  return String(t(`beds.${def.key}`, { count: qty }));
}

/** Every bed in the home, cribs included ("9 beds" under the bedrooms title). */
export function countBeds(rooms: unknown): number {
  if (!Array.isArray(rooms)) return 0;
  return rooms.reduce((n: number, room: any) => {
    const beds: any[] = Array.isArray(room?.beds) ? room.beds : [];
    return n + beds.reduce((m: number, b: any) => m + Math.max(1, Number(b?.quantity) || 1), 0);
  }, 0);
}
