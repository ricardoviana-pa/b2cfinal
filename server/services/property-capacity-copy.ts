/**
 * Guest capacities confirmed by Ricardo on 5 November 2026; Monte's four
 * bedrooms rechecked against Guesty and the operations team on 24 November.
 * The runtime sync file can predate a deploy. Correct only the old English
 * guest-capacity phrases; retain the rest of that record and future copy.
 */
const CORRECTIONS: Record<string, { guests: number; old: string; word: string; reviewed: string; bedrooms?: number }> = {
  "6965331fec80690013738c68": { guests: 13, old: "12|twelve", word: "thirteen", reviewed: "2026-11-05" },
  "69c567ad7f6873000e9a3c37": { guests: 10, old: "8|eight", word: "ten", reviewed: "2026-11-24", bedrooms: 4 },
};

export function normalizePropertyCapacityCopy<T extends Record<string, any>>(property: T): T {
  const correction = CORRECTIONS[property.guestyId || property.listingId || ""];
  // A later legitimate inventory change needs its own review, not this old
  // editorial correction imposed on a different configured capacity.
  if (!correction || property.maxGuests !== correction.guests ||
      (correction.bedrooms !== undefined && property.bedrooms !== correction.bedrooms)) return property;
  const withGuests = new RegExp(
    "(\\b(?:up to|accommodates|accommodating|hosts?|hosting|sleeps?|sleeping)\\s+)(" + correction.old + ")(?=\\s+(?:guests?|people|persons?)\\b)", "gi",
  );
  const explicitVerb = new RegExp(
    "(\\b(?:sleeps?|accommodates|hosts?)\\s+(?:up to\\s+)?)(" + correction.old + ")(?=\\s*(?:[.,;:!?—–]|$))", "gi",
  );
  const replacement = (_match: string, prefix: string, old: string) =>
    prefix + (/^\d+$/.test(old) ? String(correction.guests) : correction.word);
  const correct = (value: unknown) => {
    if (typeof value !== "string") return value;
    const guests = value.replace(withGuests, replacement).replace(explicitVerb, replacement);
    // Monte's old editorial copy overstated its four bedrooms as five.
    // Five days' notice, prices and unrelated quantities must stay intact.
    return correction.bedrooms === 4
      ? guests.replace(/\b(five|5)(?=[ -]bedrooms?\b)/gi, old => /^\d+$/.test(old) ? "4" : old[0] === "F" ? "Four" : "four")
      : guests;
  };

  const next: Record<string, any> = { ...property };
  let changed = false;
  for (const key of ["description", "tagline", "seoDescription"]) {
    const value = correct(property[key]);
    if (value !== property[key]) { next[key] = value; changed = true; }
  }
  if (property.descriptionSections && typeof property.descriptionSections === "object") {
    const sections = { ...property.descriptionSections };
    let sectionsChanged = false;
    for (const [key, original] of Object.entries(sections)) {
      const value = correct(original);
      if (value !== original) { sections[key] = value; sectionsChanged = true; }
    }
    if (sectionsChanged) { next.descriptionSections = sections; changed = true; }
  }
  // Each home's localized pages were reviewed independently. Do not erase
  // a newer review or sync date, or move Aura's date for Monte's correction.
  if (!property.lastModified || property.lastModified < correction.reviewed) {
    next.lastModified = correction.reviewed;
    changed = true;
  }
  return changed ? next as T : property;
}
