import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// O Ricardo, 29 out 2026: "as da Tripwix dizem que tem IVA e as outras não...
// não coloques isso em lado nenhum". Nenhuma casa diz "IVA incluído": nem os
// cartões da listagem, nem o mapa, nem o painel do parceiro.

const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'] as const;
const VAT_CLAIM = /VAT included|IVA inclu[íi]do|IVA incluido|TVA incluse|IVA inclusa|Inkl\. MwSt|Inclusief btw|Moms ingår|Sisältää ALV/i;
const read = (f: string) => fs.readFileSync(f, 'utf8');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [p] : [];
  });
}

describe('sem "IVA incluído" em lado nenhum', () => {
  it('nenhum ficheiro do cliente usa a frase', () => {
    expect(sourceFiles('client/src').filter((f) => /partnerBooking\.vatIncluded/.test(read(f)))).toEqual([]);
  });

  it.each(LANGS)('%s: a chave saiu e nenhum texto diz IVA incluído', (lang) => {
    const j = JSON.parse(read(`client/src/i18n/locales/${lang}.json`));
    expect(j.partnerBooking).not.toHaveProperty('vatIncluded');
    expect(JSON.stringify(j)).not.toMatch(VAT_CLAIM);
  });

  it('o painel do parceiro não deixa uma linha vazia quando não há nada a dizer', () => {
    expect(read('client/src/components/booking/PartnerBookingPanel.tsx')).toMatch(/\(!quote\.feesKnown \|\| quote\.securityDeposit > 0\) && \(/);
  });
});
