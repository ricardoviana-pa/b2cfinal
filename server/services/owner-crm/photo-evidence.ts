export const CRM_PHOTOS_ADEQUATE_FIELD = "3d8606f82d5ea8c0d16dd16cfca6bfbe04c126c7";
export function crmFileHasPhotos(file: Record<string, unknown>) {
  if (file.active_flag === false || file.active_flag === 0 || file.inline_flag === true || file.inline_flag === 1) return false;
  const mime = String(file.mime_type || file.mimeType || file.file_type || "").toLowerCase();
  if (mime === "img" || mime === "image" || mime.startsWith("image/")) return true;
  if (mime === "pdf" || mime === "application/pdf") return false;
  return /\.(?:jpe?g|png|webp|heic|heif|gif|tiff?|avif)(?:$|[?#])/i.test(String(file.name || file.file_name || ""));
}
const decodeHtml = (text: string) => text.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
function urlCandidate(value: string) {
  try {
    const url = new URL(decodeHtml(value).replace(/[),.;]+$/, ""));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if ((url.hostname === "portugalactive.com" || url.hostname.endsWith(".portugalactive.com")) && /^\/management\/complete(?:\/|$)/i.test(url.pathname)) return null;
    return url;
  } catch { return null; }
}
function photoHost(url: URL) {
  const h = url.hostname.toLowerCase(); const path = url.pathname;
  return ((h === "drive.google.com" && /^\/(?:file\/d|drive\/folders)\//.test(path))
    || (h === "photos.google.com" && /^\/share\//.test(path)) || h === "photos.app.goo.gl"
    || ((h === "dropbox.com" || h.endsWith(".dropbox.com")) && /^\/(?:s|sh|scl)\//.test(path))
    || h === "we.tl" || ((h === "wetransfer.com" || h.endsWith(".wetransfer.com")) && /^\/downloads\//.test(path))
    || h === "1drv.ms" || h === "onedrive.live.com"
    || ((h === "icloud.com" || h.endsWith(".icloud.com")) && /^\/(?:sharedalbum|photos)(?:\/|$)/.test(path))
    || /(^|\.)airbnb\.[a-z.]+$/.test(h) && /^\/rooms\/\d+/.test(path)
    || /(^|\.)booking\.com$/.test(h) && /^\/hotel\//.test(path));
}
/** Only a photo-labelled URL or a photo-context album/listing is evidence.
 * Generic CRM hyperlinks, signatures and our private upload CTA are not photos. */
export function crmNoteHasPhotoLink(content: unknown) {
  if (typeof content !== "string") return false;
  const text = decodeHtml(content.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi, (_m, href) => ` ${href} `)
    .replace(/<\/(?:p|li|tr|div)>|<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, " "));
  const lines = text.split(/\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const previousLabel = i > 0 && /(?:foto(?:grafia)?s?|photos?|album|álbum|imagens|images)\s*:\s*$/i.test(lines[i - 1]) ? lines[i - 1] : "";
    const context = `${previousLabel} ${line}`;
    const urls = [...line.matchAll(/https?:\/\/[^\s<>"']+/gi)].map(match => urlCandidate(match[0])).filter((u): u is URL => !!u);
    if (!urls.length) continue;
    const explicitLabel = /^\s*(?:link\s+(?:de|das|para\s+as?)\s+foto(?:grafia)?s?|photo(?:graph)?s?\s+link|foto(?:grafia)?s?|photos?|album|álbum)\s*:\s*/i.test(context);
    if (explicitLabel) return true;
    if (/\b(?:fotos?|fotografias?|photos?|album|álbum|imagens|images|galeria|gallery)\b/i.test(context)
      && !/\b(?:sem|faltam|aguardar|pedir|solicitar|no|missing|request)\s+(?:as\s+|the\s+)?(?:fotos?|fotografias?|photos?|imagens|images)\b/i.test(context)
      && urls.some(photoHost)) return true;
  }
  return false;
}
