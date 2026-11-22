import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import i18next from 'i18next';
import en from '../client/src/i18n/locales/en.json';
import pt from '../client/src/i18n/locales/pt.json';
import fr from '../client/src/i18n/locales/fr.json';
import es from '../client/src/i18n/locales/es.json';
import it_ from '../client/src/i18n/locales/it.json';
import fi from '../client/src/i18n/locales/fi.json';
import de from '../client/src/i18n/locales/de.json';
import nl from '../client/src/i18n/locales/nl.json';
import sv from '../client/src/i18n/locales/sv.json';

// pa-origin on the cookie policy and the visit origin on the privacy policy
// (PR #124). PT went first; the other eight languages got the same text on
// 29 Oct 2026 (auditoria i18n-copy-05), so every page now shows both
// paragraphs and names the cookie banner's own buttons in its language.

const RESOURCES: Record<string, Record<string, any>> = { en, pt, fr, es, it: it_, fi, de, nl, sv };
const LANGS = Object.keys(RESOURCES);
const KEYS = ['cookiesPage.originBody', 'privacy.s2OriginBody'];

/** Same set-up as entry-server.tsx: the page language plus English as fallback. */
async function i18nFor(lng: string) {
  const instance = i18next.createInstance();
  await instance.init({
    lng,
    fallbackLng: 'en',
    resources: {
      [lng]: { translation: RESOURCES[lng] },
      ...(lng !== 'en' ? { en: { translation: RESOURCES.en } } : {}),
    },
  });
  return instance;
}

/** The banner's buttons in sentence case: "ACEITAR TUDO" → "aceitar tudo". */
const label = (lng: string, key: string) => String(RESOURCES[lng].cookieBanner[key]).toLowerCase();

describe('visit origin in the legal pages', () => {
  it('PT has both texts, with the key facts', async () => {
    const i18n = await i18nFor('pt');
    for (const key of KEYS) expect(i18n.exists(key)).toBe(true);
    const cookie = i18n.t('cookiesPage.originBody');
    expect(cookie).toContain('pa-origin');
    expect(cookie).toContain('30 dias');
    expect(cookie).toContain('Aceitar tudo');
    expect(i18n.t('privacy.s2OriginBody')).toContain('Aceitar tudo');
  });

  it.each(LANGS)('%s has both texts in its own language, not the English fallback', (lng) => {
    for (const key of KEYS) {
      const own = key.split('.').reduce((o: any, k) => o?.[k], RESOURCES[lng]);
      expect(typeof own, `${lng} ${key}`).toBe('string');
      if (lng !== 'en') expect(own).not.toBe(key.split('.').reduce((o: any, k) => o?.[k], RESOURCES.en));
    }
    const cookie: string = RESOURCES[lng].cookiesPage.originBody;
    expect(cookie.startsWith('pa-origin.')).toBe(true);
    expect(cookie).toContain('30');
    // Names the buttons the visitor actually sees: "Accept all" and the
    // "Cookie settings" link in the footer.
    expect(cookie.toLowerCase()).toContain(label(lng, 'acceptAll'));
    expect(cookie.toLowerCase()).toContain(String(RESOURCES[lng].cookieBanner.managePreferences).toLowerCase());
    expect(String(RESOURCES[lng].privacy.s2OriginBody).toLowerCase()).toContain(label(lng, 'acceptAll'));
  });

  it('the pages render the paragraphs in every language', () => {
    const cookies = fs.readFileSync('client/src/pages/Cookies.tsx', 'utf8');
    const privacy = fs.readFileSync('client/src/pages/Privacy.tsx', 'utf8');
    expect(cookies).toContain("{t('cookiesPage.originBody')}");
    expect(privacy).toContain("{t('privacy.s2OriginBody')}");
    expect(cookies).not.toMatch(/i18n\.exists\('cookiesPage\.originBody'\)/);
    expect(privacy).not.toMatch(/i18n\.exists\('privacy\.s2OriginBody'\)/);
  });

  it('PT uses no dashes as punctuation', async () => {
    const i18n = await i18nFor('pt');
    for (const key of [...KEYS, 'cookiesPage.lastUpdated']) {
      expect(i18n.t(key), key).not.toMatch(/[–—]| - /);
    }
  });

  it('the new translations use no dashes as punctuation either', () => {
    for (const lng of LANGS) {
      for (const text of [RESOURCES[lng].cookiesPage.originBody, RESOURCES[lng].privacy.s2OriginBody, RESOURCES[lng].privacy.s3AdsBody]) {
        expect(text, lng).not.toMatch(/[–—]| - /);
      }
    }
  });

  it('describes OpenAI measurement and consent in all supported languages', () => {
    for (const lng of LANGS) {
      expect(RESOURCES[lng].privacy.s3AdsBody, lng).toContain('OpenAI Ads');
      expect(RESOURCES[lng].cookiesPage.marketingBody, lng).toContain('__oppref');
      expect(RESOURCES[lng].cookiesPage.marketingBody, lng).toContain('__obref');
      // no aviso de cookies o nome não parte ao fim da linha (espaço inseparável)
      expect(RESOURCES[lng].cookieBanner.description, lng).toMatch(/OpenAI[\u00A0 ]Ads/);
    }
  });

  it('dates the current privacy and cookie revisions: November 2026', () => {
    const november: Record<string, RegExp> = {
      en: /November 2026/, fr: /novembre 2026/, es: /noviembre 2026/, it: /novembre 2026/, de: /November 2026/,
      nl: /november 2026/, sv: /november 2026/, fi: /marraskuu 2026/, pt: /novembro de 2026/,
    };
    for (const lng of LANGS) expect(RESOURCES[lng].privacy.lastUpdated, lng).toMatch(november[lng]);
    for (const lng of LANGS) expect(RESOURCES[lng].cookiesPage.lastUpdated, lng).toMatch(november[lng]);
  });
});
