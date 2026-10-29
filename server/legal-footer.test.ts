import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { COMPLAINTS_BOOK_NAME, COMPLAINTS_BOOK_URL } from '../client/src/lib/legalLinks';

/* Auditoria 29 out 2026, tracking-legal-security-legal-identity-complaints:
   acesso ao Livro de Reclamações Eletrónico, visível e destacado, no rodapé
   de todas as páginas, nas 9 línguas (DL 156/2005, alterado pelo DL 74/2017).
   A identidade legal (denominação, NIPC, sede) e a entidade RAL ficam para
   quando o Ricardo enviar os dados. */

const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'] as const;
const locale = (lng: string) => JSON.parse(fs.readFileSync(`client/src/i18n/locales/${lng}.json`, 'utf8'));

describe('Livro de Reclamações no rodapé', () => {
  it('links to the official platform under its official name', () => {
    expect(COMPLAINTS_BOOK_URL).toBe('https://www.livroreclamacoes.pt/');
    expect(COMPLAINTS_BOOK_NAME).toBe('Livro de Reclamações');
  });

  it('is in the shared footer, opening in a new tab, with an accessible name', () => {
    const footer = fs.readFileSync('client/src/components/layout/Footer.tsx', 'utf8');
    expect(footer).toContain('href={COMPLAINTS_BOOK_URL}');
    expect(footer).toContain('target="_blank"');
    expect(footer).toContain("aria-label={t('legalFooter.complaintsBookAria')}");
    expect(footer).toContain('{COMPLAINTS_BOOK_NAME}');
  });

  it.each(LANGS)('%s has the label and the accessible name', (lng) => {
    const l = locale(lng);
    expect(typeof l.legalFooter.complaintsBook).toBe('string');
    expect(l.legalFooter.complaintsBookAria).toContain(lng === 'pt' ? 'Livro de Reclamações Eletrónico' : 'Livro de Reclamações');
    if (lng !== 'en' && lng !== 'pt') expect(l.legalFooter.complaintsBookAria).not.toBe(locale('en').legalFooter.complaintsBookAria);
  });

  it('every public page renders the shared footer (checkout, balance and payment returns are flows without one)', () => {
    const pages = fs.readdirSync('client/src/pages').filter((f) => f.endsWith('.tsx'));
    for (const page of pages) {
      expect(fs.readFileSync(`client/src/pages/${page}`, 'utf8'), page).toMatch(/<Footer\b/);
    }
  });
});
