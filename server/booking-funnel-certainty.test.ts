import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// O Ricardo, 29 out 2026: "remove a cena a falar do security deposit, diz may
// be applied... gera incerteza". O aviso "Poderá ser exigida uma caução" saiu
// da página da casa, do checkout e das FAQ. Numa casa de parceiro com caução
// conhecida diz-se o valor (partnerBooking.depositNote), nunca "pode haver".
// No mesmo PR: o logótipo do checkout com o tamanho do cabeçalho do site.

const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'] as const;
const locale = (lang: string) => JSON.parse(fs.readFileSync(`client/src/i18n/locales/${lang}.json`, 'utf8'));
const read = (f: string) => fs.readFileSync(f, 'utf8');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [p] : [];
  });
}

describe('sem "pode ser exigida uma caução" no funil', () => {
  it('nenhum ficheiro do cliente usa o aviso antigo', () => {
    const offenders = sourceFiles('client/src').filter((f) => /securityDeposit\.(notice|title)|SecurityDepositNotice/.test(read(f)));
    expect(offenders).toEqual([]);
    expect(fs.existsSync('client/src/components/property/SecurityDepositNotice.tsx')).toBe(false);
  });

  it.each(LANGS)('%s: o texto do aviso saiu e a caução conhecida diz o valor', (lang) => {
    const j = locale(lang);
    expect(j).not.toHaveProperty('securityDeposit');
    expect(JSON.stringify(j)).not.toMatch(/deposit may be required|Poderá ser exigida uma caução/i);
    expect(j.partnerBooking.depositNote).toContain('{{amount}}');
  });

  it('o painel do parceiro mostra a caução com o valor, quando a conhece', () => {
    expect(read('client/src/components/booking/PartnerBookingPanel.tsx')).toMatch(
      /t\('partnerBooking\.depositNote', \{ amount: formatQuotedEur\(quote\.securityDeposit, lang\) \}\)/,
    );
  });
});

describe('logótipo do checkout', () => {
  it('tem o tamanho do cabeçalho do site (32 px no telemóvel, 40 px a partir de md)', () => {
    expect(read('client/src/components/layout/Header.tsx')).toMatch(/className="h-8 md:h-10 w-auto/);
    expect(read('client/src/pages/checkout/CheckoutPage.tsx')).toMatch(/<img src=\{IMAGES\.logoColor\} alt="Portugal Active" className="h-8 md:h-10 w-auto" \/>/);
  });
});
