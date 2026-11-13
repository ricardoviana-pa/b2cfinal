import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergePropertyOverrides } from "../shared/propertyLocalization";
import { propertyPageMeta } from "../shared/propertyMeta";
import { __testing } from "./services/guesty-sync";
import { __testing as storeTesting, getPropertiesForSite } from "./services/properties-store";
import { normalizePropertyCapacityCopy } from "./services/property-capacity-copy";
import { propertiesRouter } from "./routers/properties";

const homes = JSON.parse(readFileSync("client/src/data/properties.json", "utf8"));
const copy = JSON.parse(readFileSync("client/src/data/descriptions.overrides.json", "utf8"));
const targets = [
  { id: "6965331fec80690013738c68", name: "Villa Aura", guests: 13 },
  { id: "69c567ad7f6873000e9a3c37", name: "Monte do Sossego", guests: 10 },
];
// Match guest-capacity statements, not bedroom counts, prices or travel times.
const capacity: Record<string, RegExp> = {
  en: /up to (thirteen|twelve|ten|eight|\d+)\b/gi,
  pt: /até\s+(\d+)\s+(?:pessoas|hóspedes)/gi,
  fr: /jusqu['’]à\s+(\d+)\s+personnes/gi,
  es: /hasta\s+(\d+)\s+(?:personas|huéspedes)/gi,
  it: /fino a\s+(\d+)\s+(?:persone|ospiti)/gi,
  de: /bis zu\s+(\d+)\s+(?:Personen|Gäste)/gi,
  nl: /maximaal\s+(\d+)\s+(?:personen|gasten)/gi,
  fi: /jopa\s+(\d+)(?:\s+vierasta|\s+[–—])/gi,
  sv: /upp till\s+(\d+)\s+(?:personer|gäster)/gi,
};
const words: Record<string, number> = { thirteen: 13, twelve: 12, ten: 10, eight: 8 };
const bedroomWords: Record<string, number> = { four: 4, five: 5 };
const bedrooms: Record<string, RegExp> = {
  en: /\b(four|five|4|5)[ -]bedrooms?\b/gi,
  pt: /\b(4|5) quartos\b/gi, fr: /\b(4|5) chambres\b/gi,
  es: /\b(4|5) dormitorios\b/gi, it: /\b(4|5) camere\b/gi,
  de: /\b(4|5) Schlafzimmern?\b/gi, nl: /\b(4|5) slaapkamers\b/gi,
  fi: /\b(4|5) makuuhuonetta\b/gi, sv: /\b(4|5) sovrum\b/gi,
};
function statedCapacities(text: string, locale: string) {
  return [...text.matchAll(capacity[locale])].map(match => words[match[1].toLowerCase()] ?? Number(match[1]));
}

describe("capacities confirmed by Ricardo on 5 November 2026", () => {
  for (const locale of Object.keys(capacity)) {
    it(locale + ": merged public descriptions and structured sections agree with both capacities", () => {
      const overrides = locale === "en" ? {} : JSON.parse(readFileSync("client/src/data/properties.i18n/" + locale + ".json", "utf8"));
      for (const target of targets) {
        const home = homes.find((p: any) => p.guestyId === target.id);
        const page = mergePropertyOverrides(home, overrides)!;
        expect(page.maxGuests, target.name).toBe(target.guests);
        const texts = [page.description, page.tagline, page.seoDescription, ...Object.values(page.descriptionSections ?? {})]
          .filter((value): value is string => typeof value === "string");
        const stated = texts.flatMap(text => statedCapacities(text, locale));
        expect(stated.length, target.name).toBeGreaterThan(0);
        expect(stated.every(value => value === target.guests), target.name + ": " + stated).toBe(true);
        if (target.id === targets[1].id) {
          const rooms = texts.flatMap(text => [...text.matchAll(bedrooms[locale])])
            .map(match => bedroomWords[match[1].toLowerCase()] ?? Number(match[1]));
          expect(page.bedrooms).toBe(5);
          expect(rooms.length).toBeGreaterThan(0);
          expect(rooms.every(value => value === 5), target.name + ": bedrooms " + rooms).toBe(true);
        }
      }
    });
  }

  it("keeps the approved English copy in the sync override and preserves the review date on a later unchanged sync", () => {
    for (const target of targets) {
      const home = homes.find((p: any) => p.guestyId === target.id);
      expect(home.description).toBe(copy[target.id].description);
      expect(statedCapacities(copy[target.id].description, "en")).toEqual([target.guests]);
      expect(home.lastModified).toBe("2026-11-05");
      expect(home.contentHash).toBe(__testing.contentFingerprint(home));
      const synced = { ...home, description: copy[target.id].description, descriptionSections: null };
      expect(__testing.stampLastModified([synced], new Map([[target.id, home]]), "2026-10-01").changed).toBe(0);
      expect(synced.lastModified).toBe("2026-11-05");
    }
  });

  it("uses Aura's confirmed capacity in the EN/PT public snippet and follows future catalogue changes", () => {
    const aura = homes.find((p: any) => p.guestyId === targets[0].id);
    expect(propertyPageMeta(aura, "en").description).toContain("5 bedrooms for up to 13 guests");
    expect(propertyPageMeta(aura, "pt").description).toContain("5 quartos para até 13 hóspedes");
    expect(propertyPageMeta({ ...aura, maxGuests: 14 }, "en").description).toContain("up to 14 guests");
    const monte = homes.find((p: any) => p.guestyId === targets[1].id);
    expect(propertyPageMeta(monte, "en").description).toContain("5 bedrooms for up to 10 guests");
    expect(propertyPageMeta(monte, "pt").description).toContain("5 quartos para até 10 hóspedes");
  });
});

describe("the sync writes the confirmed capacities, not Guesty's older text (CI do main, 5–13 nov 2026)", () => {
  it("Monte do Sossego's search description, cut from Guesty's summary, says five bedrooms", () => {
    const monte = homes.find((p: any) => p.guestyId === targets[1].id);
    const fromGuesty = { ...monte, seoDescription: "A peaceful retreat in the heart of the Alentejo. Traditional Farm with 4 bedrooms, heated pool" };
    const fixed = normalizePropertyCapacityCopy(fromGuesty);
    expect(fixed.seoDescription).toContain("Traditional Farm with 5 bedrooms");
    expect(monte.seoDescription).not.toMatch(/\b(four|4)[ -]bedrooms?\b/i);
  });

  it("every home the sync maps goes through the correction before it is stamped and written", () => {
    const source = readFileSync("server/services/guesty-sync.ts", "utf8");
    const mapped = source.indexOf("normalizePropertyCapacityCopy(\n      mapListingToProperty(");
    expect(mapped).toBeGreaterThan(-1);
    expect(source.indexOf("stampLastModified(properties", mapped)).toBeGreaterThan(mapped);
  });
});

describe("capacity copy in an older runtime snapshot", () => {
  it.each(["sync", "fallback"])("corrects public %s data and PDP lookup without replacing unrelated copy or operational fields", async source => {
    const dir = mkdtempSync(join(tmpdir(), "pa-capacity-copy-"));
    const previous = storeTesting.setPaths({
      sync: join(dir, "sync.json"), fallback: join(dir, "fallback.json"),
      tripwix: join(dir, "tripwix.json"), destinations: join(dir, "destinations.json"),
    });
    const old = targets.map((target, index) => ({
      ...homes.find((p: any) => p.guestyId === target.id),
      description: index === 0 ? "Up to twelve guests. A new garden detail; twelve chairs." : "Up to 8 guests. A new dining detail; eight chairs.",
      descriptionSections: {
        summary: index === 0 ? "Sleeps up to 12 — a new welcome." : "Accommodates up to eight guests.",
        space: index === 0 ? "Five bedrooms, a 12-minute drive and new room details." : "Four bedrooms, four days' notice and new room details.",
        access: "An unchanged arrival instruction.",
      },
      lastModified: "2026-10-30",
    }));
    const raw = JSON.stringify(old);
    writeFileSync(join(dir, source + ".json"), raw);
    try {
      const publicHomes = await getPropertiesForSite();
      const caller = propertiesRouter.createCaller({ user: null, req: {}, res: { setHeader() {} } } as any);
      for (const [index, target] of targets.entries()) {
        const served = publicHomes.find(p => p.guestyId === target.id);
        expect(statedCapacities(served.description, "en")).toEqual([target.guests]);
        expect(statedCapacities(served.descriptionSections.summary, "en")).toEqual([target.guests]);
        expect(served.description).toContain(index === 0 ? "A new garden detail; twelve chairs." : "A new dining detail; eight chairs.");
        expect(served.descriptionSections.space).toBe(index === 0
          ? old[index].descriptionSections.space : "Five bedrooms, four days' notice and new room details.");
        expect(served.descriptionSections.access).toBe(old[index].descriptionSections.access);
        for (const field of ["bedrooms", "maxGuests", "priceFrom", "cleaningFee", "amenities", "rooms", "contentHash"]) {
          expect(served[field], field).toEqual(old[index][field]);
        }
        expect(served.lastModified).toBe("2026-11-05");
        expect(await caller.getBySlugForSite({ slug: old[index].slug })).toEqual(served);
      }
      expect(readFileSync(join(dir, source + ".json"), "utf8")).toBe(raw);
    } finally {
      storeTesting.setPaths(previous);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves future inventory, new prose, later dates and other homes", () => {
    const aura = homes.find((p: any) => p.guestyId === targets[0].id);
    const future = { ...aura, description: "Up to twelve guests.", maxGuests: 14, lastModified: "2026-10-30" };
    expect(normalizePropertyCapacityCopy(future)).toBe(future);
    const newCopy = { ...aura, description: "New copy with twelve chairs and no guest-capacity claim.", lastModified: "2026-12-01" };
    expect(normalizePropertyCapacityCopy(newCopy)).toBe(newCopy);
    const other = { ...future, guestyId: "unrelated-home", maxGuests: 13 };
    expect(normalizePropertyCapacityCopy(other)).toBe(other);
    const later = { ...aura, description: "Hosts twelve people.", lastModified: "2026-12-01" };
    expect(normalizePropertyCapacityCopy(later)).toMatchObject({ description: "Hosts thirteen people.", lastModified: "2026-12-01" });
    const monte = homes.find((p: any) => p.guestyId === targets[1].id);
    const differentRooms = { ...monte, bedrooms: 6, description: "Four bedrooms for up to eight guests." };
    expect(normalizePropertyCapacityCopy(differentRooms)).toBe(differentRooms);
    expect(normalizePropertyCapacityCopy({ ...monte, description: "A four-bedroom farmhouse with 4 days' notice." }).description)
      .toBe("A five-bedroom farmhouse with 4 days' notice.");
  });
});
