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
// (PR #124). The PT text goes first to Ricardo's approval; the other eight
// languages follow. Until then those pages leave the paragraph out instead of
// showing the raw key, and en.json stays without the keys so sync-i18n passes.

const RESOURCES: Record<string, Record<string, unknown>> = { en, pt, fr, es, it: it_, fi, de, nl, sv };
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

  it('the other eight languages leave the paragraph out until translated', async () => {
    for (const lng of ['en', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv']) {
      const i18n = await i18nFor(lng);
      for (const key of KEYS) expect(i18n.exists(key), `${lng} ${key}`).toBe(false);
    }
  });

  it('the pages render the paragraphs only when the key exists', () => {
    const cookies = fs.readFileSync('client/src/pages/Cookies.tsx', 'utf8');
    const privacy = fs.readFileSync('client/src/pages/Privacy.tsx', 'utf8');
    expect(cookies).toMatch(/i18n\.exists\('cookiesPage\.originBody'\) &&/);
    expect(privacy).toMatch(/i18n\.exists\('privacy\.s2OriginBody'\) &&/);
  });

  it('PT uses no dashes as punctuation', async () => {
    const i18n = await i18nFor('pt');
    for (const key of [...KEYS, 'cookiesPage.lastUpdated']) {
      expect(i18n.t(key), key).not.toMatch(/[–—]| - /);
    }
  });
});
