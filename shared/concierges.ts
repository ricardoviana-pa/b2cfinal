/**
 * Concierges by region — the signature of the guest emails once Ricardo
 * confirms a real person for the region (name, photo).
 *
 * Until then the emails are signed by the brand, "Portugal Active ·
 * Concierge": never an invented person (a persona breaks the first time a
 * guest asks for her). The property page shows the brand too ("Hosted by
 * Portugal Active"). Ricardo, 29 out 2026: "Portugal Active é Portugal
 * Active".
 *
 * Photos live in client/public/team/ (served as /team/<file>).
 */

export interface Concierge {
  /** Destination slug this entry serves (destinations.json → slug/region). */
  region: string;
  /** First name shown to guests ("Hosted by {{name}} & the Portugal Active team"). */
  name: string;
  /** Full name for alt text and email signatures. */
  fullName: string;
  /** Role shown under the signature. */
  role: string;
  /** Path under client/public. */
  photo: string;
  /** City the local team works from ("Local team in {{city}}"). */
  basedIn: string;
  /** false until Ricardo confirms the person for the region — emails then sign as the brand. */
  confirmed?: boolean;
}

/** Who signs guest emails while a region has no confirmed concierge: the
 *  brand, with "Concierge" under it (email-i18n conciergeTeam). */
export const EMAIL_SIGNER_FALLBACK = { name: "Portugal Active", fullName: "Portugal Active", role: "", photo: "", brand: true } as const;

/** Signature for guest emails: the region's concierge when confirmed, else the brand. */
export function getEmailSigner(destination?: string | null, locality?: string | null): { name: string; fullName: string; photo: string; brand: boolean } {
  const c = getConcierge(destination, locality);
  return c.confirmed ? { name: c.name, fullName: c.fullName, photo: c.photo, brand: false } : { ...EMAIL_SIGNER_FALLBACK };
}

const FOUNDER = {
  name: "Ricardo",
  fullName: "Ricardo Viana",
  role: "Founder",
  photo: "/team/ricardo-viana.webp",
};

/** TODO(Ricardo): replace the founder fallback with the real concierge per region. */
export const CONCIERGES: Record<string, Concierge> = {
  minho: { region: "minho", ...FOUNDER, basedIn: "Viana do Castelo" },
  porto: { region: "porto", ...FOUNDER, basedIn: "Porto" },
  douro: { region: "douro", ...FOUNDER, basedIn: "Douro" },
  lisbon: { region: "lisbon", ...FOUNDER, basedIn: "Lisboa" },
  alentejo: { region: "alentejo", ...FOUNDER, basedIn: "Comporta" },
  algarve: { region: "algarve", ...FOUNDER, basedIn: "Algarve" },
};

/** Localities that belong to a region but carry their own destination slug. */
const LOCALITY_TO_REGION: Record<string, string> = {
  "viana-do-castelo": "minho",
  caminha: "minho",
  esposende: "minho",
  douro: "douro",
  comporta: "alentejo",
  sintra: "lisbon",
  cascais: "lisbon",
};

/**
 * The concierge for a property. Accepts the destination slug and, as a
 * refinement, the locality; unknown values fall back to the Minho team.
 */
export function getConcierge(destination?: string | null, locality?: string | null): Concierge {
  const loc = (locality || "").toLowerCase().replace(/\s+/g, "-");
  const byLocality = LOCALITY_TO_REGION[loc];
  const key = (byLocality || destination || "").toLowerCase();
  return CONCIERGES[key] || CONCIERGES.minho;
}
