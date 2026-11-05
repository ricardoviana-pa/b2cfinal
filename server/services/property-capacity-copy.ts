/**
 * Capacity corrections confirmed by Ricardo on 5 November 2026.
 * The runtime sync file can predate a deploy. Correct only the old English
 * guest-capacity phrases; retain the rest of that record and future copy.
 */
const REVIEWED = "2026-11-05";
const CORRECTIONS: Record<string, { guests: number; old: string; word: string; bedrooms?: number }> = {
  "6965331fec80690013738c68": { guests: 13, old: "12|twelve", word: "thirteen" },
  "69c567ad7f6873000e9a3c37": { guests: 10, old: "8|eight", word: "ten", bedrooms: 5 },
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
    // Monte's five bedrooms were confirmed separately on the same day.
    // Four days' notice, prices and unrelated quantities must stay intact.
    return correction.bedrooms === 5
      ? guests.replace(/\b(four|4)(?=[ -]bedrooms?\b)/gi, old => /^\d+$/.test(old) ? "5" : old[0] === "F" ? "Five" : "five")
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
  // Both homes' localized pages were reviewed, even when English already
  // said ten guests. Do not erase a newer review or sync date.
  if (!property.lastModified || property.lastModified < REVIEWED) {
    next.lastModified = REVIEWED;
    changed = true;
  }
  return changed ? next as T : property;
}
