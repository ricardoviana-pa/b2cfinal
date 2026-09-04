/**
 * Brand facts — one source for the numbers the site quotes about itself.
 *
 * Auditoria set/2026 (I1/T1): the home count was 50+ in llms.txt, 60+ in the
 * page meta, 70 on the About page and in the hero proof strip — while the
 * data had 56 public homes of our own plus 35 partner homes. This script
 * derives the count from the SAME list the site renders (properties-store's
 * public filter: exclusions, test listings, price floor, partner inventory)
 * and writes:
 *
 *   shared/brandFacts.generated.json   → imported by shared/brandFacts.ts
 *                                        (client, server, emails, schema)
 *   client/public/llms.txt             → regenerated from the same facts
 *
 * Runs before every build (`npm run build` → prebuild, via tsx so it can
 * import the TypeScript store) and can be run by hand:
 *   npm run brand:facts
 *
 * The count is rounded DOWN to the ten with a "+" suffix ("90+"): a claim that
 * is always true, never one the site has to walk back after a delisting.
 */

import fs from "node:fs";
import path from "node:path";
import { getPropertiesForSite } from "../server/services/properties-store";

const ROOT = process.cwd();

const FACTS = {
  CHECKLIST_POINTS: 147,
  CONCIERGE_SLA_HOURS: 2,
  LANGUAGES: 9,
  FOUNDED: 2017,
  REGIONS: ["Minho", "Porto", "Douro", "Lisbon", "Alentejo", "Algarve"],
};

function homeCountLabel(n: number): string {
  const floored = Math.floor(n / 10) * 10;
  return floored > 0 ? `${floored}+` : String(n);
}

/** Public homes exactly as the site lists them (own + partner, filtered). */
async function countPublicHomes() {
  const all = await getPropertiesForSite();
  const own = all.filter((p: any) => p.source !== "tripwix").length;
  const partner = all.length - own;
  return { total: all.length, own, partner, source: "properties-store" };
}

function experiencePrices(): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "client", "src", "data", "experienceDetails.json"), "utf8"));
    const list = Array.isArray(raw) ? raw : raw.experiences || Object.values(raw)[0];
    return list
      .filter((e: any) => e && e.name && e.price)
      .map((e: any) => `- ${String(e.name).split(/ — | – |: /)[0]}: ${String(e.price).replace(/^from /i, "from ")}`);
  } catch {
    return [];
  }
}

function llmsTxt(facts: typeof FACTS & { HOME_COUNT: number; HOME_COUNT_LABEL: string }): string {
  const regions = facts.REGIONS.join(", ");
  return `# Portugal Active — Private Hotels in Portugal

> Portugal Active operates ${facts.HOME_COUNT_LABEL} private hotels across Portugal: private homes run by one in-house team to hotel standards — dedicated concierge, private chef, housekeeping and curated experiences. The privacy of a home, the service of a hotel. Book direct for the best rate.

## What we do
- Private hotels (whole private homes with hotel service) in ${regions}
- Dedicated WhatsApp concierge before, during and after every stay (response within ${facts.CONCIERGE_SLA_HOURS} hours)
- Private chef and in-home dining
- Curated experiences: horseback riding, canyoning, surfing, sailing, e-bike tours, stand-up paddle, hiking
- Private events: weddings, corporate retreats, celebrations
- Best rate guarantee: same home, dates and conditions cheaper on Airbnb or Booking.com → we match it (https://www.portugalactive.com/en/best-rate-guarantee)

## Key facts
- Founded ${facts.FOUNDED} in Viana do Castelo, Portugal
- ${facts.HOME_COUNT_LABEL} private hotels operated end to end by our own team
- Every home prepared with our ${facts.CHECKLIST_POINTS}-item checklist before each arrival
- Regions: ${regions}
- Website in ${facts.LANGUAGES} languages: English, Portuguese, Spanish, French, Italian, German, Dutch, Swedish, Finnish
- Direct booking, no service fees

## Contact
- Website: https://www.portugalactive.com
- Email: info@portugalactive.com
- Phone: +351 258 358 434
- WhatsApp: +351 927 161 771

## Experience prices (per person)
${experiencePrices().join("\n")}

## Pages
- Homes: https://www.portugalactive.com/en/homes
- Destinations: https://www.portugalactive.com/en/destinations
- Experiences: https://www.portugalactive.com/en/experiences
- Services: https://www.portugalactive.com/en/services
- Journal: https://www.portugalactive.com/en/blog
- About: https://www.portugalactive.com/en/about
- Sitemap: https://www.portugalactive.com/sitemap.xml
`;
}

async function main() {
  const homes = await countPublicHomes();
  const generated = {
    generatedAt: new Date().toISOString().slice(0, 10),
    homeCount: homes.total,
    homeCountLabel: homeCountLabel(homes.total),
    ownHomeCount: homes.own,
    partnerHomeCount: homes.partner,
    source: homes.source,
  };
  const outJson = path.join(ROOT, "shared", "brandFacts.generated.json");
  const prev = fs.existsSync(outJson) ? JSON.parse(fs.readFileSync(outJson, "utf8")) : null;
  // Keep the file stable when nothing but the date moved (no noisy diffs).
  const unchanged = prev && prev.homeCount === generated.homeCount && prev.homeCountLabel === generated.homeCountLabel
    && prev.ownHomeCount === generated.ownHomeCount && prev.partnerHomeCount === generated.partnerHomeCount;
  if (!unchanged) fs.writeFileSync(outJson, JSON.stringify(generated, null, 2) + "\n");

  const facts = { ...FACTS, HOME_COUNT: generated.homeCount, HOME_COUNT_LABEL: generated.homeCountLabel };
  const next = llmsTxt(facts);
  for (const rel of [["client", "public", "llms.txt"], ["client", "public", ".well-known", "llms.txt"]]) {
    const llmsPath = path.join(ROOT, ...rel);
    if (!fs.existsSync(llmsPath) || fs.readFileSync(llmsPath, "utf8") !== next) fs.writeFileSync(llmsPath, next);
  }

  console.log(`[brand-facts] ${generated.homeCount} public homes (${generated.ownHomeCount} own + ${generated.partnerHomeCount} partner, ${generated.source}) → "${generated.homeCountLabel}"${unchanged ? " (unchanged)" : ""}`);
}

main().catch((err: any) => {
  console.error("[brand-facts] failed:", err);
  process.exit(1);
});
