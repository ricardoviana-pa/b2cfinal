import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import { __testing } from './_core/vite';
import { blogAuthorName, blogAuthorRole, blogCategoryLabel } from '../client/src/lib/blogLabels';
import pt from '../client/src/i18n/locales/pt.json';
import es from '../client/src/i18n/locales/es.json';

describe('Journal labels follow the page language', async () => {
  const i18n = i18next.createInstance();
  await i18n.init({ lng: 'pt', resources: { pt: { translation: pt }, es: { translation: es } } });
  const tPt = i18n.getFixedT('pt');
  const tEs = i18n.getFixedT('es');

  it('translates the category slug instead of printing it', () => {
    expect(blogCategoryLabel('destinations', tPt)).toBe('Destinos');
    expect(blogCategoryLabel('guides', tEs)).toBe('Guías');
    expect(blogCategoryLabel('portugal-active', tPt)).toBe('Portugal Active');
  });

  it('translates the in-house byline, keeps named people', () => {
    expect(blogAuthorName({ name: 'Portugal Active Team' }, tPt)).toBe('Equipa Portugal Active');
    expect(blogAuthorRole({ role: 'Editorial Team' }, tEs)).toBe('Equipo editorial');
    expect(blogAuthorName({ name: 'Ricardo Viana' }, tPt)).toBe('Ricardo Viana');
    expect(blogAuthorRole({ role: 'Founder & CEO' }, tPt)).toBe('Founder & CEO');
  });
});

describe('experience titles name the place once, with the right preposition', () => {
  const { experienceTitle } = __testing;
  it('keeps a localised name that already says where', () => {
    expect(experienceTitle('pt', { name: "Caminhada, Mergulho e Almoço na Serra d'Arga", destination: 'minho' }))
      .toBe("Caminhada, Mergulho e Almoço na Serra d'Arga | Portugal Active");
  });
  it('adds the destination with the article it needs', () => {
    expect(experienceTitle('pt', { name: 'E-Bike Wild Tour', destination: 'minho' })).toContain('na Costa do Minho');
    expect(experienceTitle('es', { name: 'E-Bike Wild Tour', destination: 'minho' })).toContain('en la Costa del Miño');
    expect(experienceTitle('en', { name: 'Horseback Riding', destination: 'minho' })).toContain('on the Minho Coast');
  });
});
