/**
 * "Good to know" on a home's page — the visible questions AND the FAQPage
 * JSON-LD, for the client and the server, from one function.
 *
 * The server used to write its own FAQPage: English (or Portuguese) on every
 * language, a "best rate online with no OTA service fees" answer on every home
 * — partner homes included, where the page deliberately makes no such claim —
 * and a "July and August run Saturday to Saturday, 7-night minimum" rule that
 * no home has. Crawlers that do not run JavaScript (most AI crawlers) read
 * those claims; the page never made them (auditoria out/2026,
 * seo-health-faq-jsonld-drift). Now the markup is the visible list, in the
 * page's language, on the client and in the server HTML alike.
 *
 * Translations come from the i18n catalogues (pdpFaq.*). The client passes
 * i18next's t; the server passes one that reads the same JSON files.
 */
import { cancellationPolicyCopy, cancellationPolicySummary } from './cancellationPolicy';

/** i18next-style lookup: key, English fallback, interpolation values. */
export type FaqTranslate = (key: string, fallback: string, vars?: Record<string, unknown>) => string;

export interface PdpFaqInput {
  /** The name the page shows (group name on a multi-unit parent). */
  name: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  petsAllowed?: boolean | null;
}

export interface FaqItem { q: string; a: string }

export function buildPdpFaq(input: PdpFaqInput, lang: string, t: FaqTranslate): FaqItem[] {
  const out: FaqItem[] = [];
  if (input.checkInTime || input.checkOutTime) {
    out.push({
      q: t('pdpFaq.qTimes', 'What time are check-in and check-out?'),
      a: t('pdpFaq.aTimes', 'Check-in from {{checkIn}} and check-out by {{checkOut}}. Flexible times can often be arranged with our concierge.', {
        checkIn: input.checkInTime || '16:00', checkOut: input.checkOutTime || '11:00',
      }),
    });
  }
  if (input.petsAllowed) {
    out.push({
      q: t('pdpFaq.qPets', 'Can I bring my pet?'),
      a: t('pdpFaq.aPets', 'Yes — {{name}} welcomes pets. Let us know when you book; a small additional fee may apply.', { name: input.name }),
    });
  }
  // No minimum-night count and no seasonal rule: the synced terms value drifts
  // from the calendar, which is the only source that is right for every season.
  out.push({
    q: t('pdpFaq.qMin', 'What is the minimum stay?'),
    a: t('pdpFaq.aMin', 'Minimum stays and arrival days depend on the home and season. Select your dates to check the requirements, or ask our concierge.'),
  });
  // Cancellation: Guesty's policies, from the single shared source.
  out.push({ q: cancellationPolicyCopy(lang).question, a: cancellationPolicySummary(lang) });
  return out;
}

/** FAQPage node for a JSON-LD @graph (or a standalone script with @context). */
export function faqPageNode(faq: FaqItem[]): Record<string, unknown> {
  return {
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** Minimal i18next-compatible interpolation ({{var}}), for the server. */
export function interpolate(template: string, vars?: Record<string, unknown>): string {
  if (!vars) return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k: string) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}
