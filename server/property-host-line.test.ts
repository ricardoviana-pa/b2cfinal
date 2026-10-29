import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

// A página da casa diz quem recebe: a Portugal Active, igual em todas as casas
// (próprias ou de parceiros). Sem nome de pessoa nem "equipa local em X":
// o Ricardo, 29 out 2026, "Portugal Active é Portugal Active".

const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'] as const;
const locale = (lang: string) => JSON.parse(fs.readFileSync(`client/src/i18n/locales/${lang}.json`, 'utf8'));
const page = fs.readFileSync('client/src/pages/PropertyDetail.tsx', 'utf8');

describe('quem recebe, na página da casa', () => {
  it.each(LANGS)('%s: só "Portugal Active", sem pessoa, equipa nem cidade', (lang) => {
    const host = locale(lang).host;
    expect(host.hostedBy).toContain('Portugal Active');
    expect(host.hostedBy).not.toMatch(/Ricardo|\{\{|team|equipa|équipe|equipo|Team|tiimi|teamet|-team/i);
    expect(host.meetUs).toBeTruthy();
    for (const gone of ['hostedByName', 'basedIn', 'basedInCity']) expect(host, `${lang} host.${gone}`).not.toHaveProperty(gone);
  });

  it('a página usa a linha da marca e já não procura um anfitrião por região', () => {
    expect(page).toMatch(/t\('host\.hostedBy', 'Hosted by Portugal Active'\)/);
    expect(page).not.toMatch(/host\.hostedByName|host\.basedInCity|getConcierge|host\.photo/);
  });
});
