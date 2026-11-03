import { acceptLanguagePreferences, LANGUAGE_CHOICE_COOKIE, LANGUAGE_CHOICE_KEY, languageCookieValue, preferredSiteLanguage, SITE_LANGUAGES } from '../../shared/siteLanguage';

/** No app boot, tracking, remote assets or copied query text in this script.
 * The browser reads its own URL, including a hash that HTTP never receives. */
export const LANGUAGE_ENTRY_SCRIPT = `(()=>{
const supported=${JSON.stringify(SITE_LANGUAGES)};
const language=v=>{const b=String(v||'').trim().toLowerCase().split(/[-_]/)[0];return supported.includes(b)?b:null};
const first=location.pathname.split('/').filter(Boolean)[0];
if(first&&supported.includes(first.toLowerCase()))return;
let chosen=null;
try{chosen=language(localStorage.getItem(${JSON.stringify(LANGUAGE_CHOICE_KEY)}))}catch{}
if(!chosen){try{const c=document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(${JSON.stringify(LANGUAGE_CHOICE_COOKIE + '=')}));if(c)chosen=language(decodeURIComponent(c.slice(${LANGUAGE_CHOICE_COOKIE.length + 1})))}catch{}}
if(chosen){try{document.cookie=${JSON.stringify(LANGUAGE_CHOICE_COOKIE + '=')}+chosen+'; Path=/; Max-Age=31536000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'')}catch{}}
const browsers=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language];
const lang=chosen||browsers.map(language).find(Boolean)||'en';
location.replace('/'+lang+(location.pathname==='/'?'':location.pathname)+location.search+location.hash);
})()`;

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function shouldSelectLanguage(pathname: string): boolean {
  const first = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  return !SITE_LANGUAGES.includes(first as any) && !pathname.includes('.') &&
    !/^\/(api|assets|files|management|realestate|real-estate)(\/|$)/i.test(pathname);
}

export function languageEntryHtml(pathname: string, query: string, acceptLanguage?: string, cookie?: string): string {
  const lang = preferredSiteLanguage(acceptLanguagePreferences(acceptLanguage), languageCookieValue(cookie));
  // The leading locale is fixed from the allowlist: even //example.org stays
  // a same-origin path. All request-derived text is HTML-escaped.
  const suffix = pathname === '/' ? '' : pathname;
  const fallback = escapeHtml(`/${lang}${suffix}${query}`);
  const canonical = escapeHtml(`https://www.portugalactive.com/en${suffix}`);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Portugal Active</title><link rel="canonical" href="${canonical}"><script>${LANGUAGE_ENTRY_SCRIPT}</script><noscript><meta http-equiv="refresh" content="0;url=${fallback}"></noscript></head><body><a href="${fallback}">Portugal Active</a></body></html>`;
}
