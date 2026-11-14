/**
 * Partner homes, as every public record names them.
 *
 * Some homes on the site come from a partner's inventory. Ricardo, 14 nov
 * 2026: the partner's name, their reference for the home and the commission
 * agreed with them never reach the browser — not in a page, not in an API
 * response, not in the state the server embeds in the HTML, not in the
 * JavaScript bundle. The property store (server/services/properties-store.ts)
 * turns the imported record into the public one: `source: "partner"`, an id
 * of the form `partner-<slug>`, photos under /homes/photos/<slug>/, no
 * supplier reference (not as a field, not inside the id or a photo address)
 * and no commission.
 *
 * This file is shared with the client, so it only knows the public value.
 */
export const PARTNER_SOURCE = 'partner';

/** A home from partner inventory (requested, not booked through our own engine). */
export function isPartnerHome(p: { source?: string | null } | null | undefined): boolean {
  return p?.source === PARTNER_SOURCE;
}
