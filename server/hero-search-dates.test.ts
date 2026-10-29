import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

/* Auditoria 29 out 2026, Regression:P4: in the home search at 390px the empty
   date fields read "Reisedaten wähle…", "Ajouter des date…", "Lisää
   päivämäärä…" and "Datums toevoege…", the last letters under the calendar
   icon (nowrap, no clipping). Two guards:
   1. CSS: the text is clipped with an ellipsis at its content edge, 3px clear
      of the icon, so no language at any width can reach it;
   2. copy: the placeholder fits whole from 360px. The span has 100px there
      (DM Sans 15px, measured in Chromium: "Datum wählen" 98.5, "Añadir
      fechas" 95.5, "Aggiungi date" 95.0, "Escolher data" 94.9, "Datum
      kiezen" 93.8, "Valitse päivä" 87.0, "Välj datum" 73.5, "Add dates"
      71.4, "Quand ?" 58.2; the old "Datums toevoegen" was 130.5). 13
      characters is the budget that keeps every language inside it. */

const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'];
const css = fs.readFileSync('client/src/index.css', 'utf8');
const rule = (selector: string) => {
  const m = css.match(new RegExp(`${selector.replace(/[.-]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
};

describe('home search: the date placeholder never runs under the calendar icon', () => {
  it('clips the placeholder with an ellipsis and keeps the text clear of the icon', () => {
    const value = rule('.hero-search-date-value');
    expect(value).toMatch(/white-space:\s*nowrap/);
    const placeholder = rule('.hero-search-date-value.is-placeholder');
    expect(placeholder).toMatch(/overflow:\s*hidden/);
    expect(placeholder).toMatch(/text-overflow:\s*ellipsis/);
    // A chosen date ("08/08/2028" is 85px) is never cut: at 320px it would not fit the ellipsis box.
    expect(value).not.toMatch(/overflow:\s*hidden/);
    const icon = rule('.hero-search-icon');
    const field = rule('.hero-search-field');
    const iconRight = Number(icon.match(/right:\s*(\d+)px/)![1]);
    const iconWidth = Number(icon.match(/width:\s*(\d+)px/)![1]);
    const fieldPad = Number(field.match(/padding:\s*\d+px\s+(\d+)px/)![1]);
    const textPad = Number(value.match(/padding-right:\s*(\d+)px/)![1]);
    // From the field's inner right edge: the icon starts at right + width,
    // the text ends at field padding + span padding.
    expect(fieldPad + textPad).toBeGreaterThan(iconRight + iconWidth);
    // ...and leaves 100px for the text at 360px (it had 96).
    expect(textPad).toBeLessThanOrEqual(16);
  });

  it('marks only the empty state as the placeholder', () => {
    const hero = fs.readFileSync('client/src/components/marketing/HeroSearch.tsx', 'utf8');
    expect(hero).toContain("className={value ? 'hero-search-date-value' : 'hero-search-date-value is-placeholder'}");
  });

  it.each(LANGS)('%s: the placeholder fits whole from 360px', (lng) => {
    const value = JSON.parse(fs.readFileSync(`client/src/i18n/locales/${lng}.json`, 'utf8')).editorial.addDates as string;
    expect(value.trim().length).toBeGreaterThan(0);
    expect([...value].length, `${lng} "${value}"`).toBeLessThanOrEqual(13);
  });
});
