/**
 * Minimal branded HTML page served straight from Express (no SPA, no i18n
 * bundle, no measurement): the destination of the links in an email, which
 * must render even when the app shell fails. Same look as the checkout
 * recovery opt-out page.
 *
 * Never put personal data in these pages: they are reachable from a URL.
 * Every value is escaped here.
 */

export const BRAND_PAGE_COLORS = {
  dark: "#1A1A18",
  earth: "#6B6860",
  warm: "#F5F1EB",
  sand: "#E8E4DC",
  gold: "#8B7355",
} as const;

// Same band as the emails (self-hosted since the original CDN died on 24 Aug 2026).
export const BRAND_BAND_URL = "https://www.portugalactive.com/email/brand-band.png";
const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "'DM Sans',Arial,Helvetica,sans-serif";

export interface BrandPageLink {
  href: string;
  label: string;
}

export interface BrandPageForm {
  action: string;
  /** Hidden fields posted with the button (never personal data). */
  fields: Record<string, string>;
  button: string;
}

export interface BrandPageOptions {
  /** Main button (a link). */
  cta?: BrandPageLink;
  /** Main button that POSTs (a GET never changes anything: mail scanners follow links). */
  form?: BrandPageForm;
  /** Small line under the main content, e.g. "Mudou de ideias? Cancelar a subscrição". */
  note?: { text: string; link?: BrandPageLink };
  /**
   * Browser storage flags to set on this page (same origin as the site), e.g.
   * the newsletter "subscribed" flag after the confirmation click, so the
   * pop-up never shows again in that browser. Keys and values are fixed by
   * the caller, never personal data.
   */
  localFlags?: Record<string, string>;
}

export const escapeHtml = (value: string): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function brandPage(lang: string, title: string, message: string, options: BrandPageOptions = {}): string {
  const PA = BRAND_PAGE_COLORS;
  const button = `display:inline-block;padding:14px 28px;background:${PA.dark};color:#FAFAF7;text-decoration:none;border:0;cursor:pointer;font-family:${SANS};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;`;
  const cta = options.cta
    ? `<p style="margin:28px 0 0;"><a href="${escapeHtml(options.cta.href)}" style="${button}">${escapeHtml(options.cta.label)}</a></p>`
    : "";
  const form = options.form
    ? `<form method="post" action="${escapeHtml(options.form.action)}" style="margin:28px 0 0;">${Object.entries(options.form.fields)
        .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
        .join("")}<button type="submit" style="${button}">${escapeHtml(options.form.button)}</button></form>`
    : "";
  const note = options.note
    ? `<p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:${PA.earth};">${escapeHtml(options.note.text)}${
        options.note.link
          ? ` <a href="${escapeHtml(options.note.link.href)}" style="color:${PA.gold};text-decoration:underline;">${escapeHtml(options.note.link.label)}</a>`
          : ""
      }</p>`
    : "";
  const flags = options.localFlags
    ? `<script>try{${Object.entries(options.localFlags)
        .map(([key, value]) => `localStorage.setItem(${JSON.stringify(key).replace(/</g, "\\u003c")},${JSON.stringify(value).replace(/</g, "\\u003c")});`)
        .join("")}}catch(e){}</script>`
    : "";
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} · Portugal Active</title>${flags}
</head>
<body style="margin:0;padding:0;background:${PA.warm};font-family:${SANS};">
  <div style="text-align:center;">
    <img src="${BRAND_BAND_URL}" alt="Portugal Active" width="600" style="display:block;margin:0 auto;width:100%;max-width:600px;height:auto;" />
  </div>
  <main style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center;">
    <h1 style="font-family:${SERIF};font-size:28px;font-weight:400;line-height:1.25;color:${PA.dark};margin:0 0 14px;">${escapeHtml(title)}</h1>
    <p style="font-size:15px;line-height:1.65;color:${PA.earth};margin:0;">${escapeHtml(message)}</p>${cta}${form}${note}
    <p style="margin:36px 0 0;padding-top:28px;border-top:1px solid ${PA.sand};font-family:${SERIF};font-size:16px;color:${PA.dark};">Portugal Active</p>
  </main>
</body>
</html>`;
}
