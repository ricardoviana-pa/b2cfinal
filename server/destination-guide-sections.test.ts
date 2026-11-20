/* ==========================================================================
   Auditoria de design, decisão E15 do Ricardo (20 nov 2026): os guias de
   destino no telemóvel abrem secção a secção.

   Measured at 390 px before: /en/destinations/minho 30 ecrãs,
   /en/destinations/algarve 24, /fr/destinations/minho 23. Below 768 px each
   long section now shows its heading and intro line and opens on tap; from
   768 px nothing changes.

   What must stay true, and what these tests hold:
   - the body of a closed section is in the server HTML (the pages rank), with
     no `hidden` attribute and no inline style: only one CSS rule, inside a
     phone-only `screen` media query, takes it out of the layout;
   - the heading keeps its element, level and text (once); the control is a
     real <button> with aria-expanded and aria-controls, named by the heading,
     and from 768 px it is display:none;
   - on a phone the hero, the first section and the homes stay open, in the
     three templates; the rest starts closed, the same on the server and in
     the browser (no hydration mismatch).
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Router } from 'wouter';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { beforeAll, describe, expect, it } from 'vitest';
import { trpc } from '../client/src/lib/trpc';
import { GuideBody, GuideHeading, GuideSection, anchorId } from '../client/src/components/destinations/GuideSection';
import { DestinationPage } from '../client/src/components/destinations/DestinationPage';
import { localizeDestination } from '../client/src/lib/localizeContent';
import { getDestinationPlanning } from '../client/src/data/destination-planning';
import { getDestinationEditorial } from '../client/src/data/destination-editorial';
import destinations from '../client/src/data/destinations.json';
import frDestinations from '../client/src/data/destinations.i18n/fr.json';
import products from '../client/src/data/products.json';
import en from '../client/src/i18n/locales/en.json';
import pt from '../client/src/i18n/locales/pt.json';
import fr from '../client/src/i18n/locales/fr.json';

// The app compiles JSX with the automatic runtime; vitest uses tsconfig's
// classic transform, which expects a React global.
(globalThis as any).React = React;
const h = React.createElement;

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const DIR = 'client/src/components/destinations';

/** What a browser shows for an HTML fragment's text: entities decoded. */
const text = (html: string) => html.replace(/<[^>]+>/g, '')
  .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('GuideSection — a secção que abre ao toque, e só no telemóvel', () => {
  const section = (props: Record<string, unknown> = {}) => renderToString(
    h(GuideSection, { id: 'destination-taste', className: 'minho-section', ...props },
      h(GuideHeading, { className: 'headline-lg' }, 'Flavours to remember.'),
      h('p', null, 'The intro line stays.'),
      h(GuideBody, null, h('p', null, 'Rei das Praias, on the sand.'))),
  );

  it('fechada: o corpo está no HTML do servidor, sem hidden nem estilo inline', () => {
    const html = section();
    expect(html).toContain('Rei das Praias, on the sand.');
    expect(html).toMatch(/<section id="destination-taste" class="guide-section minho-section" data-open="false">/);
    const body = html.match(/<div[^>]*class="guide-body"[^>]*>/)![0];
    expect(body).toBe('<div id="destination-taste-body" class="guide-body">');
    expect(html).not.toMatch(/\shidden[\s=>]|style=|aria-hidden="true"[^>]*guide-body/);
  });

  it('o título é o mesmo título, uma vez; o controlo é um <button> com o nome do título', () => {
    const html = section();
    expect(html).toContain('<h2 id="destination-taste-title" class="headline-lg">Flavours to remember.</h2>');
    expect(count(html, 'Flavours to remember.')).toBe(1);
    const button = html.match(/<button[^>]*>/)![0];
    expect(button).toContain('type="button"');
    expect(button).toContain('class="guide-toggle"');
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('aria-controls="destination-taste-body"');
    expect(button).toContain('aria-labelledby="destination-taste-title"');
    // right after the heading, inside the box the phone rules position it in
    expect(html).toMatch(/<div class="guide-heading"><h2 [^>]*>[^<]*<\/h2><button /);
    // the chevron is decoration
    expect(html.match(/<svg[^>]*>/)![0]).toContain('aria-hidden="true"');
  });

  it('aberta à partida: o mesmo HTML, com o estado ao contrário', () => {
    const closed = section();
    const open = section({ defaultOpen: true });
    expect(open).toContain('data-open="true"');
    expect(open).toContain('aria-expanded="true"');
    expect(open.replace('data-open="true"', 'data-open="false"').replace('aria-expanded="true"', 'aria-expanded="false"')).toBe(closed);
  });

  it('dois corpos (o texto por baixo do título e as opções ao lado): o botão controla os dois', () => {
    const html = renderToString(
      h(GuideSection, { id: 'destination-culture', parts: ['intro'] },
        h(GuideHeading, null, 'Stories'),
        h(GuideBody, { part: 'intro' }, 'one'),
        h(GuideBody, { className: 'minho-culture-options' }, 'two')),
    );
    expect(html).toContain('aria-controls="destination-culture-body destination-culture-body-intro"');
    expect(html).toContain('<div id="destination-culture-body-intro" class="guide-body">one</div>');
    expect(html).toContain('<div id="destination-culture-body" class="guide-body minho-culture-options">two</div>');
  });

  it('sem id próprio: ids gerados, iguais no título, no botão e no corpo', () => {
    const html = renderToString(h(GuideSection, { anchors: ['destination-seasons'] }, h(GuideHeading, null, 'When'), h(GuideBody, null, 'body')));
    expect(html).toMatch(/^<section class="guide-section" data-open="false">/);
    const title = html.match(/<h2 id="([^"]+)"/)![1];
    const body = html.match(/<div id="([^"]+)" class="guide-body"/)![1];
    expect(title).toMatch(/^guide-[A-Za-z0-9_-]+-title$/);
    expect(body).toBe(title.replace(/-title$/, '-body'));
    expect(html).toContain(`aria-labelledby="${title}"`);
    expect(html).toContain(`aria-controls="${body}"`);
  });

  it('fora de uma secção, o título é só o título', () => {
    expect(renderToString(h(GuideHeading, { className: 'headline-lg' }, 'Plain'))).toBe('<h2 class="headline-lg">Plain</h2>');
  });

  it('lê a âncora de um #hash ou de um href', () => {
    expect(anchorId('#destination-taste')).toBe('destination-taste');
    expect(anchorId('#caf%C3%A9')).toBe('café');
    expect(anchorId('#100%')).toBe('100%');
    for (const none of ['', '#', null, undefined, '/homes#x', 'destination-taste']) expect(anchorId(none)).toBeNull();
  });

  describe('o componente nunca tira o corpo da página', () => {
    // the code, without its comments (they explain what display:none does on a phone)
    const source = read(`${DIR}/GuideSection.tsx`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    it('sem renderização condicional pelo estado, e sem ler a janela a meio da renderização', () => {
      // `open` only ever becomes two attribute values, never a choice of elements
      expect(source).not.toMatch(/open\s*(&&|\?)\s*[(<{]/);
      expect(source.match(/[\w.]*open \? [^;\n]*/g)).toEqual(['open ? "true" : "false"}']);
      // (the chevron's aria-hidden is not the hidden attribute)
      expect(source).not.toMatch(/(?<![\w-])hidden\b\s*=|display:\s*['"]?none/);
      // window and document only inside the effects
      const beforeEffects = source.slice(source.indexOf('export function GuideSection'), source.indexOf('useEffect(() => {'));
      expect(beforeEffects).not.toMatch(/\b(window|document|matchMedia|navigator)\b/);
      const afterEffects = source.slice(source.indexOf('const toggle = useCallback'));
      expect(afterEffects).not.toMatch(/\b(window|document|matchMedia|navigator)\b/);
      expect(source).toMatch(/useState\(defaultOpen\)/);
    });
    it('abre com o #hash da página, com hashchange e com um clique numa ligação da própria página', () => {
      expect(source).toContain('fromUrl();');
      expect(source).toContain('window.addEventListener("hashchange", fromUrl);');
      expect(source).toContain('document.addEventListener("click", fromClick);');
      expect(source).toContain(`closest('a[href^="#"]')`);
      expect(source).toContain('window.removeEventListener("hashchange", fromUrl);');
      expect(source).toContain('document.removeEventListener("click", fromClick);');
    });
  });
});

describe('GuideSection.css — fechar é só no telemóvel, e só no ecrã', () => {
  const css = read(`${DIR}/GuideSection.css`).replace(/\/\*[\s\S]*?\*\//g, '');
  const phoneAt = css.indexOf('@media screen and (max-width: 767.98px) {');
  const outside = css.slice(0, phoneAt);
  const phone = css.slice(phoneAt);

  it('fora do bloco do telemóvel só há uma regra: o botão não existe', () => {
    expect(phoneAt).toBeGreaterThan(-1);
    expect(outside.replace(/\s+/g, ' ').trim()).toBe('.guide-toggle { display: none; }');
    expect(count(css, '@media')).toBe(1);
    // the phone block runs to the end of the file: its braces only balance at the last one
    let depth = 0;
    let closedAt = -1;
    for (let i = phoneAt; i < css.length && closedAt < 0; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) closedAt = i;
    }
    expect(closedAt).toBe(css.trimEnd().length - 1);
  });

  it('o corpo fechado sai do layout só ali', () => {
    expect(phone).toMatch(/\.guide-section\[data-open="false"\] \.guide-body \{\s*display: none;\s*\}/);
    expect(count(css, 'display: none')).toBe(2);
    expect(css).not.toMatch(/visibility|opacity|max-height|height: 0|content-visibility/);
  });

  it('o botão cobre o título (alvo de toque), mostra o foco e o estado', () => {
    expect(phone).toMatch(/\.guide-heading \{[^}]*position: relative;/);
    const toggle = phone.match(/\.guide-section \.guide-toggle \{[^}]*\}/)![0];
    expect(toggle).toContain('position: absolute;');
    for (const side of ['top', 'right', 'bottom', 'left']) expect(toggle).toContain(`${side}: -0.5rem;`);
    expect(toggle).toContain('display: flex;');
    expect(phone).toMatch(/\.guide-section \.guide-toggle:focus-visible \{\s*outline: 2px solid #806a48;/);
    expect(phone).toMatch(/\.guide-toggle\[aria-expanded="true"\] > svg \{\s*transform: rotate\(180deg\);/);
  });

  it('sem animação: nada para o prefers-reduced-motion desligar', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
  });

  it('o que os guias acrescentam às secções que fecham é também só do telemóvel, no ecrã', () => {
    const minho = read(`${DIR}/MinhoVisualGuide.css`).replace(/\/\*[\s\S]*?\*\//g, '');
    // one block, the last of the file, holds every rule that mentions a guide section
    const blockAt = minho.lastIndexOf('@media screen and (max-width: 767.98px) {');
    expect(blockAt).toBeGreaterThan(-1);
    expect(minho.indexOf('.guide-section')).toBeGreaterThan(blockAt);
    expect(minho.slice(blockAt).replace(/\s+/g, ' ').trim()).toBe(
      '@media screen and (max-width: 767.98px) { '
      + '.guide-section .minho-section-heading > div { align-self: stretch; } '
      + '.guide-section[data-open="false"] .minho-section-heading { margin-bottom: 0; } '
      + '.guide-section[data-open="false"] .minho-culture-icon { display: none; } }',
    );
    expect(read(`${DIR}/DestinationVisualGuide.css`)).not.toContain('guide-section');
  });
});

/* ── The three templates, as the server sends them ─────────────────────── */

const home = (n: number, destination: string, locality: string) => ({
  id: `p${n}`, slug: `home-${n}`, name: `Home ${n}`, guestyId: `g${n}`, locality, destination,
  bedrooms: 3, bathrooms: 2, maxGuests: 6, isActive: true, propertyType: 'Villa',
  images: [`https://assets.guesty.com/image/upload/v1/production/h${n}-1.jpg`],
}) as any;

function renderGuide(language: 'en' | 'pt' | 'fr', slug: string): string {
  const base = (destinations as any[]).find(d => d.slug === slug);
  const destination = language === 'fr' ? localizeDestination(base, frDestinations as any) : base;
  const adventures = (products as any[]).filter(p => p.type === 'adventure' && p.isActive !== false && p.destinations?.includes(slug));
  const queryClient = new QueryClient();
  const client = trpc.createClient({ links: [httpBatchLink({ url: 'http://x/api/trpc', transformer: superjson, fetch: (async () => { throw new Error('no network'); }) as any })] });
  return renderToString(
    h(trpc.Provider, { client, queryClient },
      h(QueryClientProvider, { client: queryClient },
        h(Router, { base: `/${language}`, ssrPath: `/${language}/destinations/${slug}` },
          h(DestinationPage, {
            destination,
            properties: [1, 2, 3].map(n => home(n, slug, slug === 'algarve' ? 'Lagos' : 'Viana do Castelo')),
            articles: [{ slug: 'viana-do-castelo-guide', title: 'A guide to Viana' }],
            adventures,
            related: [],
          })))),
  );
}

/** The opening tag of the element with this id. */
const tagOf = (html: string, id: string) => html.match(new RegExp(`<[a-z0-9]+[^>]*\\sid="${escapeRe(id)}"[^>]*>`))?.[0];

/** Every disclosure in the page: its section tag, its button and its heading. */
function disclosures(html: string) {
  return [...html.matchAll(/<div class="guide-heading"><(h[23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/\1><button ([^>]*)>/g)].map(m => ({
    level: m[1], titleId: m[2], heading: text(m[3]), headingHtml: m[3], button: m[4],
    controls: m[4].match(/aria-controls="([^"]+)"/)![1].split(' '),
  }));
}

function expectSound(html: string) {
  const all = disclosures(html);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  // no id twice: aria-controls and the anchors need them unique
  expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  for (const d of all) {
    expect(d.level, d.heading).toBe('h2');
    expect(d.button, d.heading).toContain('aria-expanded="false"');
    expect(d.button, d.heading).toContain(`aria-labelledby="${d.titleId}"`);
    for (const id of d.controls) {
      const body = tagOf(html, id);
      expect(body, `${d.heading}: ${id}`).toBeTruthy();
      expect(body).toMatch(/^<div /);
      expect(body).toMatch(/class="guide-body[ "]/);
      expect(body).not.toMatch(/\shidden[\s=>]|style=|aria-hidden/);
    }
    // the heading text is in the page once: not repeated for the button
    expect(count(html, `>${d.headingHtml}</h2>`), d.heading).toBe(1);
  }
  // as many closed sections as buttons, and none open on the server
  expect(count(html, 'data-open="false"')).toBe(all.length);
  expect(html).not.toContain('data-open="true"');
  expect(count(html, 'class="guide-toggle"')).toBe(all.length);
  return all;
}

describe('os três modelos de guia, no HTML do servidor, com as secções fechadas', () => {
  beforeAll(async () => {
    await i18n.use(initReactI18next).init({
      lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false }, showSupportNotice: false,
      resources: { en: { translation: en }, pt: { translation: pt }, fr: { translation: fr } },
    });
  });

  it('Minho (en): oito capítulos fecham; o topo, a primeira secção e as casas ficam abertos', async () => {
    await i18n.changeLanguage('en');
    const html = renderGuide('en', 'minho');
    const all = expectSound(html);
    const sections = ['nature', 'areas', 'stay-length', 'taste', 'experiences', 'culture', 'seasons', 'arrival'];
    expect(all.map(d => d.titleId)).toEqual(sections.map(s => `destination-${s}-title`));
    for (const s of sections) expect(tagOf(html, `destination-${s}`), s).toMatch(/^<section id="destination-[a-z-]+" class="guide-section minho-section[^"]*" data-open="false">$/);
    // the culture chapter hides the text under its heading and the options beside it
    expect(all.find(d => d.titleId === 'destination-culture-title')!.controls).toEqual(['destination-culture-body', 'destination-culture-body-intro']);
    // open, and not a control: the first section and the homes
    expect(tagOf(html, 'destination-first-visit')).toBe('<section id="destination-first-visit" class="minho-section minho-orientation">');
    expect(tagOf(html, 'destination-homes')).not.toContain('guide-section');
    expect(html).toContain('Home 1');

    // the words of every closed chapter are in the server HTML
    const page = text(html);
    const guide = getDestinationPlanning('minho', 'en')!;
    const minho = (destinations as any[]).find(d => d.slug === 'minho');
    for (const words of [
      'Sandy shores, dunes and days shaped by the sea.',                 // nature
      guide.areas[0].bestFor, guide.areas[2].limitation,                   // areas
      'Arrive and ease into the rhythm', 'A day with no agenda',           // your days (5 nights)
      'Loureiro in the Lima valley; Alvarinho in Monção and Melgaço.',     // taste
      ...minho.restaurants.map((r: any) => r.name), ...minho.specialties.map((s: any) => s.description),
      'Activities are booked separately, with their own price and availability.', // experiences
      ...minho.experiences.map((e: any) => e.description),
      'With children, Cerveira’s Aquamuseum brings the river’s story to life.', // culture
      ...guide.rain.map(r => r.text),
      'Vineyard walks and unhurried meals. Harvest visits need an advance booking.', // seasons
      'Request a shuttle proposal', ...guide.arrival.map(a => a.text),     // arrival
    ]) expect(page, words).toContain(words);
    // an in-page link that points at a closed chapter is still in the page
    expect(html).toContain('href="#destination-culture"');
  });

  it('Minho (pt): a mesma estrutura', async () => {
    await i18n.changeLanguage('pt');
    const html = renderGuide('pt', 'minho');
    expect(expectSound(html)).toHaveLength(8);
    expect(text(html)).toContain('Loureiro no vale do Lima; Alvarinho em Monção e Melgaço.');
    expect(html).toContain('<h2 id="destination-areas-title">Escolher a sua base</h2>');
  });

  it('Algarve (en): sete capítulos fecham; a faixa de casas, a primeira secção e as casas ficam abertas', async () => {
    await i18n.changeLanguage('en');
    const html = renderGuide('en', 'algarve');
    const all = expectSound(html);
    const sections = ['nature', 'areas', 'stay-length', 'taste', 'culture', 'seasons', 'arrival'];
    expect(all.map(d => d.titleId)).toEqual(sections.map(s => `destination-${s}-title`));
    expect(html).toContain('data-testid="destination-homes-strip"');
    expect(tagOf(html, 'destination-first-visit')).toBe('<section id="destination-first-visit" class="minho-section minho-orientation">');
    expect(tagOf(html, 'destination-homes')).not.toContain('guide-section');
    // the old anchors of the culture chapter stay outside its body: the browser can scroll to them
    const culture = html.slice(html.indexOf('<section id="destination-culture"'), html.indexOf('id="destination-culture-body"'));
    expect(culture).toContain('id="destination-experiences"');
    expect(culture).toContain('id="destination-rain"');

    const page = text(html);
    const editorial = getDestinationEditorial('algarve', 'en')!;
    for (const words of [
      ...editorial.moments.map(m => m.text[1]),
      ...editorial.bases.map(b => b.text[1]),
      ...editorial.routes[0].days.slice(0, 4).map(d => d.text[1]),
      ...editorial.tables.map(t => t.text[1]),
      ...editorial.culture.map(c => c.text[1]),
      ...editorial.seasons.map(s => s[1]),
      ...getDestinationPlanning('algarve', 'en')!.arrival.map(a => a.text),
    ]) expect(page, words).toContain(words);
  });

  it('modelo antigo (fr, Minho): épocas, mesa e experiências e perguntas fecham; o porquê e as casas ficam abertos', async () => {
    await i18n.changeLanguage('fr');
    const html = renderGuide('fr', 'minho');
    const all = expectSound(html);
    expect(all.map(d => d.heading)).toEqual([
      (fr as any).destinationDetail.guide.whenToVisitTitleNamed.replace('{{thePlace}}', 'le Minho'),
      (fr as any).destinationDetail.guide.eatDrinkTitle,
      (fr as any).destinationDetail.guide.faqsTitle,
    ]);
    // the chapter row links to the element around each section, which is not inside a body
    for (const anchor of ['destination-seasons', 'destination-experiences', 'destination-guide', 'destination-homes']) {
      expect(html).toContain(`href="#${anchor}"`);
      expect(tagOf(html, anchor), anchor).not.toContain('guide-body');
    }
    expect(html).toMatch(/<div id="destination-seasons" class="scroll-mt-24"><section class="guide-section section-padding bg-white" data-open="false">/);
    expect(html).toMatch(/<div id="destination-experiences" class="scroll-mt-24"><section class="guide-section section-padding bg-white" data-open="false">/);
    // open: the homes and the first section, with plain headings
    expect(tagOf(html, 'destination-homes')).not.toContain('guide-section');
    const why = (fr as any).destinationDetail.whyTitle.replace('{{name}}', 'Minho').replace('{{thePlace}}', 'le Minho').replace('{{inPlace}}', 'dans le Minho');
    expect(text(html)).toContain(text(why));

    const page = text(html);
    const minho = (frDestinations as any).minho;
    for (const words of [
      minho.seasons.spring, minho.seasons.winter, minho.seasons.bestForFirstTime,
      ...minho.restaurants.map((r: any) => r.description), ...minho.specialties.map((s: any) => s.description),
      ...minho.experiences.map((e: any) => e.description),
      ...minho.faqs.flatMap((f: any) => [f.question, f.answer]),
    ]) expect(page, words).toContain(words);
    // the intro line of a closed section stays outside its body
    const seasons = html.slice(html.indexOf('<div id="destination-seasons"'), html.indexOf('class="guide-body', html.indexOf('<div id="destination-seasons"')));
    expect(text(seasons)).toContain(minho.bestTimeToVisit);
  });

  it('o servidor e o primeiro desenho no browser partem do mesmo estado: duas renderizações dão o mesmo HTML', async () => {
    await i18n.changeLanguage('en');
    expect(renderGuide('en', 'algarve')).toBe(renderGuide('en', 'algarve'));
  });
});

describe('quem usa a secção, e quem fica aberto', () => {
  const minho = read(`${DIR}/MinhoVisualGuide.tsx`);
  const firstVisit = read(`${DIR}/MinhoFirstVisit.tsx`);
  const visual = read(`${DIR}/DestinationVisualGuide.tsx`);
  const sections = read(`${DIR}/sections.tsx`);
  const page = read(`${DIR}/DestinationPage.tsx`);

  it('nenhuma secção de guia começa aberta por código: o que fica aberto não é uma secção que fecha', () => {
    for (const source of [minho, firstVisit, visual, sections, page]) expect(source).not.toContain('defaultOpen');
  });

  it('cada <GuideSection> tem o seu título e o seu corpo', () => {
    for (const [name, source, n] of [['MinhoVisualGuide', minho, 7], ['MinhoFirstVisit', firstVisit, 1], ['DestinationVisualGuide', visual, 7], ['sections', sections, 3]] as const) {
      expect(count(source, '<GuideSection'), name).toBe(n);
      expect(count(source, '</GuideSection>'), name).toBe(n);
      expect(count(source, '<GuideHeading'), name).toBe(n);
      expect(count(source, '<GuideBody'), name).toBeGreaterThanOrEqual(n);
      expect(count(source, '<GuideBody'), name).toBe(count(source, '</GuideBody>'));
    }
  });

  it('as casas (o caminho da reserva) e a primeira secção nunca passam a fechar', () => {
    for (const component of ['WhereToStay', 'WhyThisPlace', 'TheJournal', 'RelatedDestinationsAndOwnersCTA', 'HeroEditorial']) {
      const at = sections.indexOf(`export function ${component}(`);
      expect(at, component).toBeGreaterThan(-1);
      const body = sections.slice(at, sections.indexOf('\nexport function ', at + 1));
      expect(body, component).not.toContain('GuideSection');
    }
    expect(read(`${DIR}/DestinationHomesStrip.tsx`)).not.toContain('GuideSection');
    expect(read(`${DIR}/LocalStaySupport.tsx`)).not.toContain('GuideSection');
    expect(firstVisit.slice(firstVisit.indexOf('export function MinhoOrientation'), firstVisit.indexOf('export function MinhoStayLength'))).not.toContain('Guide');
  });

  it('o modelo antigo diz a cada secção que âncora da barra de capítulos leva a ela', () => {
    expect(page).toContain('<WhenToVisit destination={destination} anchor="destination-seasons" />');
    expect(count(page, 'anchor="destination-experiences"')).toBe(2);
    expect(sections).toMatch(/<GuideSection className="section-padding bg-white" anchors=\{anchor \? \[anchor\] : undefined\}>/);
  });

  it('a página recomeça de um destino para outro (as secções voltam a fechar)', () => {
    expect(read('client/src/pages/DestinationDetail.tsx')).toMatch(/<DestinationPage\s+key=\{dest\.slug\}/);
  });
});

describe('cores e cantos dos guias — a paleta do site (auditoria de design, E02 e cores)', () => {
  const sheets = ['MinhoVisualGuide.css', 'DestinationVisualGuide.css', 'GuideSection.css'].map(f => [f, read(`${DIR}/${f}`).replace(/\/\*[\s\S]*?\*\//g, '')] as const);
  const PALETTE = ['#1a1a18', '#3a3a35', '#5e5b54', '#6b6860', '#806a48', '#e8e4dc', '#f5f1eb', '#fafaf7', '#fff'];

  it('nenhuma cor fora da paleta nas folhas de estilo dos guias: os verdes saíram', () => {
    for (const [file, css] of sheets) {
      for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) expect(PALETTE, `${file}: ${m[0]}`).toContain(m[0].toLowerCase());
    }
  });

  it('nem nos mapas de Portugal dos guias e do índice', () => {
    const map = read(`${DIR}/PortugalMap.tsx`);
    expect(map).toMatch(/export const LOCATOR = \{\s*land: '#E8E4DC',\s*coast: '#C4A87C',\s*halo: '#C4A87C',\s*place: '#1A1A18',\s*city: '#6B6860',\s*label: '#5E5B54',\s*\} as const;/);
    for (const file of ['PortugalMap.tsx', 'MinhoFirstVisit.tsx', 'DestinationVisualGuide.tsx', 'MinhoVisualGuide.tsx']) {
      const source = read(`${DIR}/${file}`);
      expect(source, file).not.toMatch(/#(294c3a|33472f|263a2b|273d33|4c5b45|4f6255|52644e|5c6856|edf0e8|e8ede7|c4cebf|b6c4b8|dce5db|9baa99|9cb797|677463|465442|0b4541|e4ebe5|b5c4b7)/i);
      expect(source.match(/(?:fill|stroke)="#[0-9a-fA-F]{6}"/g) ?? [], file).toEqual([]);
    }
  });

  it('texto corrido a #5e5b54 e dourado de texto a #806a48, com contraste de 4,5:1 nos três fundos dos guias', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.replace('#', '').padEnd(6, hex.slice(1)).slice(i, i + 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    for (const background of ['#ffffff', '#fafaf7', '#f5f1eb']) {
      for (const colour of ['#5e5b54', '#6b6860', '#806a48', '#1a1a18']) expect(contrast(colour, background), `${colour} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
    // the section backgrounds of the guides are those three and no other
    const minho = sheets[0][1];
    expect([...minho.matchAll(/\.minho-(itinerary|taste|culture|orientation) \{\s*background: (#[0-9a-f]+);/g)].map(m => `${m[1]} ${m[2]}`).sort())
      .toEqual(['culture #f5f1eb', 'itinerary #f5f1eb', 'orientation #fff', 'taste #fafaf7']);
  });

  it('cartões e fotografias a 12 px, botões a 8 px; o topo de página fica direito', () => {
    const minho = sheets[0][1];
    const block = (selector: string) => {
      const at = minho.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      return minho.slice(at, minho.indexOf('}', at));
    };
    for (const card of ['.minho-landscapes > article', '.minho-day-grid li', '.minho-restaurants article', '.minho-culture-options article', '.minho-bases', '.minho-taste-feature figure', '.minho-experiences article > img']) {
      expect(block(card), card).toContain('border-radius: 12px;');
    }
    expect(block('.minho-duration-controls button')).toContain('border-radius: 8px;');
    expect(block('.minho-hero')).not.toContain('border-radius');
    expect(sheets[1][1]).toMatch(/\.destination-landscape-feature \{[^}]*border-radius: 12px;/);
    expect(minho).not.toContain('999px');
    // the older template: every bordered box with padding is a card, and every card is rounded
    const sections = read(`${DIR}/sections.tsx`);
    const cards = (sections.match(/className="[^"]*"/g) ?? [])
      .filter(c => /(?<![\w-])border (?:border-\[#E8E4DC\]|border-pa-sand)/.test(c) && /(?<![\w-])p-[56](?![\w-])/.test(c));
    expect(cards.length).toBeGreaterThanOrEqual(7);
    for (const card of cards) expect(card).toMatch(/(?<![\w-])rounded-xl(?![\w-])/);
    // its photographs too (the Journal thumbnails, the bookable experiences)
    for (const photo of (sections.match(/className="relative (?:shrink-0 )?overflow-hidden [^"]*"/g) ?? [])) expect(photo).toMatch(/(?<![\w-])rounded-xl(?![\w-])/);
    expect(read(`${DIR}/DestinationAccess.tsx`)).not.toContain('rounded-2xl');
  });
});
