/**
 * Curated photos per home, for the home's page (PropertyDetail).
 *
 * Guesty exports photos in the order the listing has them; the page shows the
 * first five in its grid (and the phone carousel starts with them), so the
 * first five decide what a guest sees in the first screen. Per home:
 *
 *   grid:  indices (in the catalogue's order, 0-based — see the contact sheet
 *          the curation was made from) of the photos shown first: exterior
 *          with the pool, the best living space, the best bedroom, the view,
 *          the dining or terrace. The rest follow in catalogue order; the
 *          lightbox keeps that same order.
 *   rooms: one photo index per bedroom card, in the order of the home's
 *          `rooms` (null = no photo for that room). When any room has a
 *          photo every card gets a photo area, so the grid stays even.
 *
 * Key = Guesty listingId for our homes, catalogue id for partner homes
 * (catalogKey in config/propertyOrder.ts). A home that is not here keeps
 * the catalogue order and the pictogram-only bedroom cards.
 */
import curation from '@/data/pdp-photos.json';

export interface PhotoCuration {
  grid?: number[];
  rooms?: (number | null)[];
}

/**
 * The curation lives in data/pdp-photos.json so scripts/warm-image-cache.mjs
 * (plain Node) can pre-generate the same photos at the page's sizes.
 *
 * Curated 29 Oct 2026 from the catalogue's photo order of that day, for the
 * six homes of the homepage strip that are ours (`npm run photos:sheet`
 * draws the numbered sheet). Bedroom photos are paired by bed type with the
 * room's configuration, never guessed for a twin room without a visible
 * twin photo (that card simply has no photo):
 *   - Carcavelos Manor House: garden and pool, pool with the house, the blue
 *     living room, a bedroom, breakfast under the trees; queen/double rooms
 *     only.
 *   - Eben Lodge: the house at dusk, pool at dusk, the fireplace lounge, the
 *     sea from the terrace, the glass dining room; no bedroom photos among
 *     the first 42.
 *   - Alvarinho Villa: from the air, house and pool, living room, a suite,
 *     breakfast with the valley; one photo per suite.
 *   - Abreu Retreat Palace: from the air, the house at dusk with the pool,
 *     living room, a king bedroom, the dining room; twins and kings matched.
 *   - Historic Riverfront Watermill: the mill, the mill on the river, living
 *     room, a bedroom, the river from the window; eleven rooms, four without
 *     a matching photo, so no room photos.
 *   - Lima River Houses: from the air, the pool at night, living room, a
 *     bedroom, dinner outside; the twin room (8) has no visible twin photo.
 */
export const PDP_PHOTO_CURATION: Record<string, PhotoCuration> = curation as Record<string, PhotoCuration>;

/** The home's photos with the curated ones first (the rest keep their order). */
export function curatedImageOrder(images: string[], grid?: number[]): string[] {
  if (!grid?.length) return images;
  const picked = grid.filter((i, at) => Number.isInteger(i) && i >= 0 && i < images.length && grid.indexOf(i) === at);
  if (!picked.length) return images;
  const seen = new Set(picked);
  return [...picked.map((i) => images[i]), ...images.filter((_, i) => !seen.has(i))];
}

/** The catalogue index of the photo for bedroom `roomIdx`, or null. */
export function roomPhotoIndex(curation: PhotoCuration | undefined, roomIdx: number, total: number): number | null {
  const i = curation?.rooms?.[roomIdx];
  return Number.isInteger(i) && (i as number) >= 0 && (i as number) < total ? (i as number) : null;
}
