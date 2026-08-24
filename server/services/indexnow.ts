/**
 * IndexNow — push changed URLs to the search engines that support the protocol.
 *
 * IMPORTANT SCOPE NOTE: IndexNow is consumed by Bing, Yandex, Seznam, Naver and
 * Yep. **Google does not participate.** It is therefore the right tool for the
 * engines above and useless on its own for Google, where the levers are the
 * sitemap's lastmod, internal links, and Search Console. Do not treat a
 * successful ping here as "Google has been notified".
 *
 * Protocol: a single POST carrying up to 10,000 URLs, authenticated by a key
 * that must be retrievable as plain text at {keyLocation}. The route that
 * serves that file lives in server/_core/index.ts.
 */

const BASE_URL = "https://www.portugalactive.com";
const HOST = "www.portugalactive.com";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_REQUEST = 10_000;

/** Same default as the key-file route — keep the two in sync. */
export const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "portugalactive2024indexnow";

export interface IndexNowResult {
  ok: boolean;
  submitted: number;
  status?: number;
  error?: string;
}

/**
 * Submit paths (or absolute URLs) to IndexNow.
 *
 * Never throws: callers are content pipelines where a failed ping must not
 * abort the work that produced the change.
 */
export async function submitUrls(urls: string[]): Promise<IndexNowResult> {
  const full = Array.from(
    new Set(urls.map((u) => (u.startsWith("http") ? u : `${BASE_URL}${u.startsWith("/") ? "" : "/"}${u}`))),
  );
  if (!full.length) return { ok: true, submitted: 0 };

  if (full.length > MAX_URLS_PER_REQUEST) {
    // Chunk rather than silently dropping the tail.
    let submitted = 0;
    for (let i = 0; i < full.length; i += MAX_URLS_PER_REQUEST) {
      const part = await submitUrls(full.slice(i, i + MAX_URLS_PER_REQUEST));
      if (!part.ok) return { ...part, submitted };
      submitted += part.submitted;
    }
    return { ok: true, submitted };
  }

  try {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: full,
      }),
    });
    // 200 = accepted, 202 = accepted but key still being validated.
    const ok = resp.status === 200 || resp.status === 202;
    if (!ok) console.warn(`[IndexNow] endpoint returned ${resp.status} for ${full.length} URLs`);
    return { ok, submitted: full.length, status: resp.status };
  } catch (err: any) {
    console.warn(`[IndexNow] ping failed (non-blocking): ${err?.message ?? err}`);
    return { ok: false, submitted: 0, error: String(err?.message ?? err) };
  }
}

/** Locale prefixes the site serves — a property URL exists under each one. */
export const INDEXNOW_LANGS = ["en", "pt", "fr", "es", "it", "fi", "de", "nl", "sv"] as const;

/** Expand a locale-less path ("/homes/x") into one URL per locale. */
export function withAllLocales(path: string): string[] {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return INDEXNOW_LANGS.map((l) => `${BASE_URL}/${l}${clean}`);
}

export interface PropertyUrlDiff {
  added: string[];
  renamed: Array<{ from: string; to: string }>;
  urls: string[];
}

/**
 * Work out which property URLs to submit after a sync.
 *
 * A rename is the case that matters most: the old URL carries the ranking
 * history and the new one starts empty, so both are submitted — the old one so
 * crawlers re-fetch it and follow the 301 that moves the signals across.
 *
 * Pure: no I/O, so the decision can be tested directly.
 */
export function diffPropertyUrls(
  properties: Array<{ guestyId?: string; slug?: string }>,
  previousSlugs: Map<string, string>,
): PropertyUrlDiff {
  const added: string[] = [];
  const renamed: Array<{ from: string; to: string }> = [];

  for (const prop of properties) {
    const id = prop?.guestyId;
    const slug = prop?.slug;
    if (!id || !slug) continue;
    const before = previousSlugs.get(id);
    if (before === undefined) added.push(slug);
    else if (before !== slug) renamed.push({ from: before, to: slug });
  }

  const urls: string[] = [];
  if (added.length || renamed.length) {
    for (const slug of added) urls.push(...withAllLocales(`/homes/${slug}`));
    for (const { from, to } of renamed) {
      urls.push(...withAllLocales(`/homes/${to}`));
      urls.push(...withAllLocales(`/homes/${from}`));
    }
    // The listing page's contents changed too.
    urls.push(...withAllLocales("/homes"));
  }

  return { added, renamed, urls };
}
