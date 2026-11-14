/**
 * The public address of a partner home's photos (auditoria de 14 nov 2026,
 * segunda ronda técnica).
 *
 * The photos of the partner homes are static files under
 * client/public/homes/photos/<supplier reference>/ (the import writes them
 * there: scripts/tripwix-images.py). That folder name was in every photo URL
 * of every partner home, on the page, in the JSON-LD, in the API and in the
 * emails: the supplier's own code for the home, readable by anyone.
 *
 * The files stay where they are. What changes is the address the site
 * publishes: /homes/photos/<slug of the home>/<file>. The property store
 * rewrites the photo URLs when it builds the public record (publicPhotoUrl),
 * and partnerPhotoAlias, mounted in front of the static file handler, maps
 * the public folder back to the one on disk. The mapping lives on the server
 * only (properties-store.ts, partnerPhotoFolder).
 *
 * Nothing that existed stops working: the old addresses are still files on
 * disk and are served as before (emails already sent, pages held in a cache,
 * a tab opened before the deploy).
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

export const PARTNER_PHOTO_ROOT = "/homes/photos/";

/** A slug as the site writes them: lower-case words joined by hyphens. */
const PUBLIC_FOLDER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** true for a folder name the site may publish (never a supplier reference: those are upper-case). */
export function isPublicPhotoFolder(folder: string | null | undefined): boolean {
  return !!folder && PUBLIC_FOLDER.test(folder);
}

/**
 * "/homes/photos/<diskFolder>/00.webp" → "/homes/photos/<publicFolder>/00.webp".
 * Any other URL (another folder, another host, not a string) comes back as it is.
 */
export function publicPhotoUrl<T>(url: T, diskFolder: string, publicFolder: string): T {
  if (typeof url !== "string" || !diskFolder || !isPublicPhotoFolder(publicFolder)) return url;
  const from = `${PARTNER_PHOTO_ROOT}${diskFolder}/`;
  return (url.startsWith(from) ? `${PARTNER_PHOTO_ROOT}${publicFolder}/${url.slice(from.length)}` : url) as T;
}

/**
 * Mount at "/homes/photos", before the static file handler. A request for
 * /homes/photos/<public folder>/<file> goes on as a request for the folder
 * on disk; everything else (the old addresses, a file directly under
 * /homes/photos, an unknown folder) goes on untouched and the file handler
 * answers it as it always did.
 */
export function partnerPhotoAlias(diskFolderFor: (publicFolder: string) => Promise<string | null>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    // Mounted: req.url is "/<folder>/<file>" plus the query, if any.
    const m = /^\/([^/?#]+)\/([^/?#]+)(\?.*)?$/.exec(req.url);
    if (!m || !isPublicPhotoFolder(m[1])) return next();
    diskFolderFor(m[1])
      .then((folder) => {
        if (folder) req.url = `/${folder}/${m[2]}${m[3] ?? ""}`;
      })
      .catch(() => { /* the catalogue could not be read: the file handler answers 404 */ })
      .finally(() => next());
  };
}
