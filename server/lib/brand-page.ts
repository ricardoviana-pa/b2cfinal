/**
 * Minimal branded HTML page served straight from Express (no SPA, no i18n
 * bundle): the destination of links that arrive from an email, where the
 * whole page must render even when the app shell fails. Used by the checkout
 * recovery opt-out and by the newsletter confirmation.
 *
 * Never put personal data in `message`: these pages are reachable from a
 * URL and may be cached by an intermediary.
 */

export const BRAND_PAGE_COLORS = {
  dark: "#1A1A18",
  earth: "#6B6860",
  warm: "#F5F1EB",
  sand: "#E8E4DC",
  gold: "#8B7355",
} as const;

// Mesma banda dos emails (auto-hospedada): esta pagina e o destino do link no
// rodape do email, e o CDN da plataforma original morreu a 24 ago 2026.
export const BRAND_BAND_URL = "https://www.portugalactive.com/email/brand-band.png";
const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "'DM Sans',Arial,Helvetica,sans-serif";

export interface BrandPageLink {
  href: string;
  label: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function brandPage(lang: string, title: string, message: string, link?: BrandPageLink): string {
  const PA = BRAND_PAGE_COLORS;
  const cta = link
    ? `<p style="margin:28px 0 0;"><a href="${escapeHtml(link.href)}" style="display:inline-block;padding:14px 28px;background:${PA.dark};color:#FAFAF7;text-decoration:none;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;">${escapeHtml(link.label)}</a></p>`
    : "";
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · Portugal Active</title>
</head>
<body style="margin:0;padding:0;background:${PA.warm};font-family:${SANS};">
  <div style="text-align:center;">
    <img src="${BRAND_BAND_URL}" alt="Portugal Active" width="600" style="display:block;margin:0 auto;width:100%;max-width:600px;height:auto;" />
  </div>
  <div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center;">
    <h1 style="font-family:${SERIF};font-size:28px;font-weight:400;line-height:1.25;color:${PA.dark};margin:0 0 14px;">${escapeHtml(title)}</h1>
    <p style="font-size:15px;line-height:1.65;color:${PA.earth};margin:0;">${escapeHtml(message)}</p>${cta}
    <p style="margin:36px 0 0;padding-top:28px;border-top:1px solid ${PA.sand};font-family:${SERIF};font-size:16px;color:${PA.dark};">Portugal Active</p>
  </div>
</body>
</html>`;
}
