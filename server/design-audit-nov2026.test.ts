/* ==========================================================================
   Auditoria de design de 14 nov 2026 — as respostas do Ricardo de 20 nov 2026
   (E01–E15) e as regras de base que saíram dela.

   Relatório: https://claude.ai/artifact/UzLfWNU1fNwvzkyoyTnCtX

   Cada bloco guarda uma decisão. Um teste que falhe aqui diz que uma página
   voltou a sair da regra: letra abaixo de 12 px, letra fina em texto corrido,
   cinzento ou dourado sem contraste, as setas sempre à vista nos cartões, o
   "voltar ao topo" no telemóvel, cêntimos fora do checkout.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatEur, formatQuotedEur, formatStayEur, stayBreakdownEuros, stayEuros, staySavingsEuros } from '../client/src/lib/format';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const css = read('client/src/index.css');

/** Public client files: not the admin area, not the UI primitives, not tests. */
function publicFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\./.test(entry.name)
        && !/\/(pages\/admin|components\/admin|components\/ui)\//.test(rel)) out.push(rel);
    }
  };
  walk('client/src');
  return out;
}
const FILES = publicFiles();
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('E01 — letra: 16 px no texto corrido, nada abaixo de 12 px, peso normal', () => {
  it('a escala de base', () => {
    expect(rule('  .body-md')).toMatch(/font-size: 1rem;[\s\S]*font-weight: 400;/);
    expect(rule('  .body-sm')).toMatch(/font-size: 0\.9375rem;[\s\S]*font-weight: 400;/);
    expect(rule('  .caption')).toMatch(/font-size: 0\.8125rem;[\s\S]*font-weight: 400;/);
    expect(rule('  .eyebrow')).toMatch(/font-size: 0\.75rem;/);
    expect(rule('  .btn-text')).toMatch(/font-size: 0\.75rem;/);
    // o parágrafo sem classe
    expect(css).toMatch(/\n  p \{[^}]*font-size: 1rem;[^}]*font-weight: 400;/);
  });

  it('nenhuma página pública escreve um tamanho abaixo de 12 px', () => {
    const small: string[] = [];
    for (const file of FILES) {
      for (const m of read(file).matchAll(/text-\[(\d+(?:\.\d+)?)(px|rem)\]/g)) {
        const px = Number(m[1]) * (m[2] === 'rem' ? 16 : 1);
        if (px < 12) small.push(`${file}: ${m[0]}`);
      }
    }
    expect(small).toEqual([]);
    for (const file of ['client/src/index.css', 'client/src/components/destinations/MinhoVisualGuide.css', 'client/src/components/destinations/DestinationVisualGuide.css']) {
      for (const m of read(file).matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) {
        expect(Number(m[1]) * (m[2] === 'rem' ? 16 : 1), `${file}: ${m[0]}`).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('a letra fina (300) fica só para títulos e números grandes', () => {
    const display = /font-display|--font-display|headline-(?:sm|md|lg|xl)|text-\[(?:[2-9]\d|\d{3})px\]|text-\[(?:1\.[2-9]\d*|[2-9](?:\.\d+)?)rem\]|(?<![\w-])text-(?:xl|[2-6]xl)(?![\w-])|fontSize:\s*['"]?(?:[2-9]\d|clamp)/;
    const thin: string[] = [];
    for (const file of FILES) {
      const lines = read(file).split('\n');
      lines.forEach((line, i) => {
        if (!/(?<![\w:-])font-light(?![\w-])|fontWeight:\s*['"]?300/.test(line)) return;
        const context = lines.slice(Math.max(0, i - 2), i + 3).join(' ');
        if (!display.test(line) && !(!line.includes('className') && display.test(context))) thin.push(`${file}:${i + 1}`);
      });
    }
    expect(thin).toEqual([]);
  });

  it('cinzentos um tom mais escuros, e os dois "stone" passam a ser um', () => {
    expect(css).toMatch(/--color-pa-earth: #5E5B54;/);
    expect(css).toMatch(/--color-pa-stone: #6B6860;/);
    expect(css).toMatch(/--color-pa-stone-aa: #6B6860;/);
    expect(css).toMatch(/\.text-pa-earth \{ color: #5E5B54; \}/);
    expect(rule('  .caption')).toMatch(/color: #6B6860;/);
  });

  it('nenhuma página pública escreve os cinzentos ou o dourado antigos à mão no texto', () => {
    const old: string[] = [];
    for (const file of FILES) {
      const source = read(file);
      for (const m of source.matchAll(/text-\[#(6B6860|726D63|78756F|8B7355)\]/gi)) old.push(`${file}: ${m[0]}`);
      // dourado em texto: -aa em fundo claro, -light em fundo escuro; nunca o de base
      for (const m of source.matchAll(/(?<![\w-])text-pa-gold(?![\w-])/g)) old.push(`${file}: ${m[0]}`);
    }
    expect(old).toEqual([]);
    expect(rule('  .eyebrow')).toMatch(/color: #806A48;/);
  });
});

describe('E04 — topo da homepage: título, uma frase e a pesquisa', () => {
  const home = read('client/src/pages/Home.tsx');
  const hero = home.slice(home.indexOf('<section className="home-hero'), home.indexOf('<HeroSearch'));
  it('sem os dois links nem a linha das "70 villas"', () => {
    expect(hero).not.toContain('hero-text-link');
    expect(hero).not.toContain('hero-proof-strip');
    expect(hero).not.toContain('home.proofHotels');
    expect(hero).not.toContain('siteUx.exploreServices');
    expect(hero).toContain("t('home.heroTitle')");
    expect(hero).toContain("t('conversion.homeIntro')");
  });
  it('no telemóvel, uma sombra uniforme por trás do texto', () => {
    expect(hero).toContain('bg-black/45 lg:bg-transparent lg:bg-gradient-to-r');
  });
});

describe('E05 — setas das fotografias dos cartões só ao passar o rato', () => {
  const card = read('client/src/components/property/PropertyCard.tsx');
  it('escondidas em ecrãs de toque, visíveis com o rato em cima ou com o foco do teclado', () => {
    const arrows = card.match(/className="absolute (?:left|right)-2 top-1\/2[^"]*"/g) ?? [];
    expect(arrows).toHaveLength(2);
    for (const cls of arrows) {
      expect(cls).toContain('hidden [@media(hover:hover)]:flex');
      expect(cls).toContain('opacity-0 group-hover:opacity-100 focus-visible:opacity-100');
    }
  });
  it('nome a 20 px e preço a 16 px', () => {
    expect(card).toContain('<h3 className="text-[1.25rem] font-display');
    expect(card).toContain('<span className="text-[16px] text-[#1A1A18] font-medium">');
  });
});

describe('E06 — sem "voltar ao topo" no telemóvel', () => {
  it('abaixo de 1024 px o botão não aparece', () => {
    expect(css).toMatch(/@media \(max-width: 1023\.98px\) \{\s*html \.back-to-top \{\s*display: none;\s*\}\s*\}/);
  });
});

describe('E07 — preços em euros inteiros fora do checkout', () => {
  it('arredonda para cima ao euro, a partir dos cêntimos', () => {
    expect(stayEuros(2996.57)).toBe(2997);
    expect(stayEuros(2996.01)).toBe(2997);
    expect(stayEuros(2997)).toBe(2997);
    expect(stayEuros(0.1 + 0.2)).toBe(1);
    expect(formatStayEur(2996.57, 'en')).toBe('€2,997');
    expect(formatStayEur(2997, 'en')).toBe('€2,997');
    // o checkout continua a mostrar os cêntimos
    expect(formatQuotedEur(2996.57, 'en')).toBe('€2,996.57');
  });
  it('a poupança é a diferença dos dois preços tal como aparecem', () => {
    expect(staySavingsEuros(3262.97, 2996.57)).toBe(266);
    expect(stayEuros(3262.97) - stayEuros(2996.57)).toBe(266);
    expect(staySavingsEuros(100, 100.4)).toBe(0);
  });
  it('as parcelas do resumo somam ao total mostrado', () => {
    const parts = stayBreakdownEuros([2502.5, 200, 12.3], 2714.8);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(stayEuros(2714.8));
    expect(parts.slice(1)).toEqual([200, 12]);
    for (const [nights, cleaning, taxes] of [[1234.56, 150, 0], [999.99, 80.5, 23.45], [4040.4, 0, 0], [707.07, 199.99, 40.4]]) {
      const total = Math.round((nights + cleaning + taxes) * 100) / 100;
      expect(stayBreakdownEuros([nights, cleaning, taxes], total).reduce((a, b) => a + b, 0)).toBe(stayEuros(total));
    }
    // parcelas que não são o total inteiro (um desconto não listado): só arredondadas
    expect(stayBreakdownEuros([2500, 200, 0], 2600)).toEqual([2500, 200, 0]);
    expect(formatEur(2503, 'en')).toBe('€2,503');
  });
  it('a listagem e a página da casa usam-nos; o checkout não', () => {
    expect(read('client/src/components/property/PropertyCard.tsx')).toContain('const formatTotal = (amount: number) => formatStayEur(amount, i18n.language);');
    const widget = read('client/src/components/booking/BookingWidget.tsx');
    expect(widget).toContain('{formatStayEur(effectiveQuote.total, lang)}');
    expect(widget).toMatch(/<RatePlanCards[\s\S]{0,400}?wholeEuros/);
    expect(read('client/src/pages/PropertyDetail.tsx')).toContain('formatStayEur(bookingSelection.total, i18n.language)');
    for (const file of fs.readdirSync(path.join(ROOT, 'client/src/pages/checkout'))) {
      expect(read(`client/src/pages/checkout/${file}`), file).not.toMatch(/formatStayEur|wholeEuros/);
    }
  });
});

describe('E10 — meios de pagamento mais pequenos, com as cores', () => {
  const logos = read('client/src/components/layout/FooterPaymentLogos.tsx');
  it('44 x 28 px no telemóvel, 52 x 32 px a partir de 640 px', () => {
    expect(logos).toContain('h-7 w-11');
    expect(logos).toContain('sm:h-8 sm:w-[52px]');
    expect(logos).not.toContain('sm:w-[76px]');
  });
  it('as cores das marcas ficam', () => {
    expect(logos).toContain("background: '#006fcf'");
    expect(logos).toContain("background: '#ffa8cd'");
    expect(logos).not.toMatch(/grayscale|brightness-0/);
  });
});

describe('E11 — listagem: doze casas de cada vez, todas com fotografia', () => {
  const homes = read('client/src/pages/Homes.tsx');
  it('"mostrar mais" acrescenta doze', () => {
    expect(homes).toContain('const HOMES_PAGE_SIZE = 12;');
    expect(homes).toContain('useState(HOMES_PAGE_SIZE)');
    expect(homes).toContain('availableProperties.slice(0, visibleCount).map(');
    expect(homes).toContain('setVisibleCount((n) => n + HOMES_PAGE_SIZE)');
    expect(homes).not.toContain('showAll');
  });
  it('a lista de nomes fica no fim da página, com as casas que ainda não estão na grelha', () => {
    const index = homes.indexOf('aria-labelledby="more-homes-index"');
    // a página tem mais de um ramo de saída: conta o último, o da listagem
    expect(index).toBeGreaterThan(homes.lastIndexOf('<StayCollections />'));
    expect(index).toBeLessThan(homes.lastIndexOf('<Footer />'));
    expect(homes).toContain('availableProperties.slice(visibleCount).map(');
  });
  it('o botão existe nas nove línguas', () => {
    for (const lang of ['en', 'pt', 'es', 'fr', 'de', 'it', 'nl', 'sv', 'fi']) {
      const locale = JSON.parse(read(`client/src/i18n/locales/${lang}.json`));
      expect(locale.homes.showMore, lang).toBe(locale.reviews.showMore);
    }
  });
});

describe('páginas compridas no telemóvel — coleções e Journal também de doze em doze', () => {
  it('a coleção mostra doze casas, "mostrar mais" acrescenta doze, e os nomes das outras ficam no fim', () => {
    const page = read('client/src/pages/Collection.tsx');
    expect(page).toContain('const COLLECTION_PAGE_SIZE = 12;');
    expect(page).toContain('homes.slice(0, visibleCount).map(');
    expect(page).toContain('setVisibleCount((n) => n + COLLECTION_PAGE_SIZE)');
    expect(page).toContain('homes.slice(visibleCount).map(');
    // outra coleção volta a começar em doze
    expect(page).toContain('useEffect(() => { setVisibleCount(COLLECTION_PAGE_SIZE); }, [slug]);');
  });
  it('o Journal mostra doze artigos de cada vez e lista os títulos dos outros', () => {
    const page = read('client/src/pages/Blog.tsx');
    expect(page).toContain('const JOURNAL_PAGE_SIZE = 12;');
    expect(page).toContain('rest.slice(0, visibleCount).map(');
    expect(page).toContain('rest.slice(visibleCount).map(');
    expect(page).toContain('useEffect(() => { setVisibleCount(JOURNAL_PAGE_SIZE); }, [activeCategory, searchText]);');
  });
  it('na página da casa, serviços e experiências são linhas compactas no telemóvel', () => {
    const pdp = read('client/src/pages/PropertyDetail.tsx');
    expect(pdp.match(/className="group flex sm:block/g)).toHaveLength(2);
    expect(pdp.match(/relative w-28 shrink-0 self-stretch sm:w-auto sm:aspect-\[4\/3\]/g)).toHaveLength(2);
  });
});

describe('mapa da listagem — tons neutros e casas agrupadas', () => {
  const map = read('client/src/components/property/HomesMap.tsx');
  it('os mosaicos do mapa ficam em tons neutros', () => {
    expect(map).toContain('.pa-homes-map .leaflet-tile-pane { filter: grayscale(1)');
  });
  it('casas que ficariam umas por cima das outras partilham um círculo com o número', () => {
    expect(map).toContain("el.className = 'pa-map-cluster';");
    expect(map).toContain("map.on('zoomend', draw);");
  });
});

describe('E12 — aviso de cookies: compacto no telemóvel, dois botões com o mesmo destaque', () => {
  const banner = read('client/src/components/layout/CookieBanner.tsx');
  it('os dois botões têm exatamente o mesmo desenho', () => {
    const buttons = [...banner.matchAll(/<button\s+onClick=\{handle(?:EssentialOnly|AcceptAll)\}\s+className="([^"]+)"/g)].map((m) => m[1]);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toBe(buttons[1]);
  });
  it('lado a lado no telemóvel', () => {
    expect(banner).toContain('grid grid-cols-2 gap-2 md:flex');
  });
});

describe('E13 — o mesmo menu, pela mesma ordem, no computador e no telemóvel', () => {
  const header = read('client/src/components/layout/Header.tsx');
  it('oito ligações, com o Concierge', () => {
    const list = header.slice(header.indexOf('const navItems = useMemo('), header.indexOf('const mobileNav'));
    expect([...list.matchAll(/href: '([^']+)'/g)].map((m) => m[1])).toEqual([
      '/homes', '/destinations', '/experiences', '/concierge', '/events', '/blog', '/about', '/contact',
    ]);
    expect(header).toContain('const mobileNav = navItems;');
  });
  it('sem o menu de dois itens debaixo de "Homes"', () => {
    expect(header).not.toContain('properties-navigation');
    expect(header).not.toContain('hasDropdown');
  });
});

describe('E02 — cantos: 12 px em fotografias e cartões, 8 px em botões e campos', () => {
  it('as fotografias dos destinos e das experiências na homepage', () => {
    const home = read('client/src/pages/Home.tsx');
    expect(home.match(/relative overflow-hidden rounded-xl bg-pa-sand/g)).toHaveLength(2);
  });
  it('a caixa dos hóspedes, como a das datas', () => {
    expect(read('client/src/components/booking/BookingWidget.tsx')).toContain('<div className="border border-black/15 rounded-lg mt-3 px-4 py-3">');
  });
  it('os campos do checkout e do contacto', () => {
    expect(read('client/src/pages/checkout/CheckoutPage.tsx')).not.toMatch(/px-3 rounded-md body-sm/);
    expect(read('client/src/pages/Contact.tsx')).not.toMatch(/(?<![\w-])rounded-md(?![\w-])/);
  });
});

describe('o mesmo calendário na homepage, na listagem e na página da casa', () => {
  const picker = read('client/src/components/booking/SearchDatesPicker.tsx');
  const hero = read('client/src/components/marketing/HeroSearch.tsx');
  const homes = read('client/src/pages/Homes.tsx');
  const calendar = read('client/src/components/booking/AvailabilityCalendar.tsx');

  it('a pesquisa abre o calendário da casa, em modo de pesquisa (sem disponibilidade)', () => {
    expect(picker).toContain('const AvailabilityCalendar = lazy(loadCalendar);');
    expect(picker).toMatch(/<AvailabilityCalendar\s+search\s+days=\{NO_DAYS\}/);
    // sem casa não há legenda de disponibilidade nem aviso de regras
    expect(calendar).toContain('{!search && <div className="mx-4 mb-1 min-h-[46px] flex items-stretch">');
    expect(calendar).toMatch(/\{!search && <div className="flex items-center gap-1\.5">\s*<span className="w-2\.5 h-2\.5 rounded-full bg-black" \/>/);
  });

  it('homepage: os dois campos de data abrem-no', () => {
    expect(hero).toContain('const datePicker = useDateRangePicker(!!checkin);');
    expect(hero).toContain('{calendarReady && <SearchDateButton');
    expect(hero).toMatch(/<SearchDatesPicker picker=\{datePicker\} anchorRef=\{formRef\}/);
  });

  it('listagem: os quatro campos (computador e telemóvel) abrem-no e mostram a data por extenso', () => {
    expect(homes.match(/<SearchDateCell/g)).toHaveLength(4);
    expect(homes.match(/<SearchDatesPicker /g)).toHaveLength(2);
    expect(homes).toContain("const shownDate = (iso: string) => (iso ? formatBookingDate(iso, i18n.language, true) : '');");
    // o campo do browser ("dd/mm/yyyy") já não se vê em lado nenhum da listagem
    expect(homes).not.toMatch(/type="date"/);
  });

  it('antes de a página estar interativa, o campo de datas do browser continua a funcionar', () => {
    // o botão que o cobre só existe depois de o React arrancar…
    expect(picker).toMatch(/export function useSearchDatesReady\(\): boolean \{\s*const \[ready, setReady\] = useState\(false\);\s*useEffect\(\(\) => \{ setReady\(true\); \}, \[\]\);/);
    expect(picker).toContain('{ready && <SearchDateButton');
    // …e até lá o campo nativo fica ao alcance do dedo e do teclado
    expect(picker).toMatch(/nativeDateInputProps = \(ready: boolean\) =>\s*\(ready \? \{ tabIndex: -1/);
    expect(hero).toContain('onClick={calendarReady ? undefined : e => openDatePickerWithin(e.currentTarget)}');
    expect(hero).toContain('type="date"');
  });

  it('uma data sem a outra: a pesquisa abre o calendário na que falta', () => {
    expect(hero).toContain('onInvalid={calendarReady ? e => { e.preventDefault(); datePicker.openField(field); } : undefined}');
  });
});

describe('dois botões, uma altura', () => {
  it('os "mostrar mais" e o "ver todas as comodidades" são o botão de contorno do site', () => {
    for (const file of ['client/src/pages/Homes.tsx', 'client/src/pages/Collection.tsx', 'client/src/pages/Blog.tsx']) {
      const src = read(file);
      const at = src.indexOf('howMore\'');
      expect(at, file).toBeGreaterThan(-1);
      expect(src.slice(at - 320, at), file).toContain('className="btn-ghost"');
    }
    const pdp = read('client/src/pages/PropertyDetail.tsx');
    const at = pdp.indexOf("t('propertyDetail.showAllAmenitiesCount'");
    expect(pdp.slice(at - 260, at)).toContain('className="btn-ghost mt-6"');
  });
  it('página de serviço: os dois botões da caixa têm a mesma altura', () => {
    const service = read('client/src/pages/ServiceDetail.tsx');
    const at = service.indexOf("t('serviceDetail.chatOnWhatsApp'");
    expect(service.slice(at - 320, at)).toContain('className="btn-primary w-full"');
    expect(service).not.toContain("style={{ minHeight: '56px' }}");
  });
  it('os botões do site têm todos 48 px e 8 px de canto', () => {
    for (const name of ['.btn-primary', '.btn-ghost', '.btn-white', '.btn-ghost-light']) {
      const block = rule(`  ${name}`);
      expect(block, name).toMatch(/min-height:\s*48px/);
      expect(block, name).toContain('border-radius: var(--pa-action-radius)');
    }
    expect(css).toContain('--pa-action-radius: 8px;');
  });
  it('os filtros dos destinos têm os cantos dos das experiências', () => {
    expect(read('client/src/pages/Destinations.tsx')).not.toMatch(/(?<![\w-])rounded-full(?![\w-])/);
  });
});

describe('casas de parceiros: o mesmo tratamento das nossas (o Ricardo, 20 nov 2026)', () => {
  const card = read('client/src/components/property/PropertyCard.tsx');
  const map = read('client/src/components/property/HomesMap.tsx');
  it('o cartão não tem nota de "outros encargos", nem com datas nem sem elas', () => {
    expect(card).not.toMatch(/t\('partnerBooking\.feesPendingShort'\)/);
    expect(card).not.toContain('feesNoteBeside');
  });
  it('as etiquetas do mapa também não', () => {
    expect(map).not.toMatch(/t\('partnerBooking\.feesPendingShort'\)/);
  });
  it('a nota completa continua na página da casa, junto ao preço, antes de reservar', () => {
    const panel = read('client/src/components/booking/PartnerBookingPanel.tsx');
    expect(panel).toContain("'partnerBooking.feesPending'");
  });
  it('com datas, o cartão continua a dizer "accommodation" e não "total" enquanto os outros valores não são conhecidos', () => {
    expect(card.match(/!liveQuote\.feesKnown \? t\('partnerBooking\.accommodationLabel'\) : t\('property\.totalLabel'\)/g)).toHaveLength(2);
  });
});

describe('campo «Destino» da pesquisa: só regiões (o Ricardo, 20 nov 2026)', () => {
  const options = read('client/src/components/marketing/DestinationOptions.tsx');
  it('a lista não tem grupos nem localidades', () => {
    expect(options).not.toContain('<optgroup');
    expect(options).not.toContain('model.groups');
    expect(options).toContain('{model.regions.map((r) => (');
  });
  it('uma ligação antiga para uma localidade continua a aparecer escolhida', () => {
    expect(options).toContain("const municipality = current && !current.startsWith('region:') ? current : '';");
    expect(options).toContain('{municipality && <option value={municipality}>{localityLabel(localities, municipality)}</option>}');
    expect(read('client/src/pages/Homes.tsx')).toContain('<DestinationOptions model={destinationModel} current={bookingLocation} localities={localities} />');
  });
});

describe('E03 — fotografia do topo: Carcavelos Manor House', () => {
  it('a imagem, os quatro tamanhos e o texto alternativo nas nove línguas', () => {
    expect(read('client/src/lib/images.ts')).toContain("heroMain: '/hero/home-carcavelos-cover-1920.webp',");
    const home = read('client/src/pages/Home.tsx');
    for (const w of [768, 960, 1280, 1920]) {
      expect(home).toContain(`/hero/home-carcavelos-cover-${w}.webp ${w}w`);
      expect(fs.existsSync(path.join(ROOT, `client/public/hero/home-carcavelos-cover-${w}.webp`)), String(w)).toBe(true);
    }
    for (const lang of ['en', 'pt', 'es', 'fr', 'de', 'it', 'nl', 'sv', 'fi']) {
      const alt = JSON.parse(read(`client/src/i18n/locales/${lang}.json`)).home.heroAlt as string;
      expect(alt, lang).toContain('Carcavelos Manor House');
      expect(alt, lang).not.toMatch(/Mirante|tennis|ténis|tenis|Tennis|tenni/i);
    }
  });
  it('a imagem mais pesada do topo não passa de 500 KB', () => {
    const size = fs.statSync(path.join(ROOT, 'client/public/hero/home-carcavelos-cover-1920.webp')).size;
    expect(size).toBeLessThan(500 * 1024);
  });
});

describe('E14 — reservar uma experiência com o desenho do site', () => {
  const card = read('client/src/components/experience/ExperienceBookingCard.tsx');
  const bar = read('client/src/components/experience/ExperienceMobileBookingBar.tsx');
  const modal = read('client/src/components/experience/BokunWidgetModal.tsx');
  const widget = read('client/src/components/experience/BokunCalendarWidget.tsx');
  const page = read('client/src/pages/ExperienceDetail.tsx');

  it('o calendário do fornecedor já não aparece solto na página: só dentro do painel do site', () => {
    expect(card).not.toContain('<BokunCalendarWidget');
    expect(bar).not.toContain('<BokunCalendarWidget');
    expect(page).not.toContain('<BokunCalendarWidget');
    expect(modal.match(/<BokunCalendarWidget/g)).toHaveLength(1);
    expect(card).toContain('<BokunWidgetModal');
    expect(bar).toContain('<BokunWidgetModal');
  });

  it('o cartão é o cartão de reserva de uma casa: branco, contorno claro, 12 px, um botão do site', () => {
    expect(card).toContain('<div className="overflow-hidden rounded-xl border border-pa-sand bg-white shadow-sm">');
    expect(card.match(/className="btn-primary min-h-\[52px\] w-full whitespace-normal px-5"/g)).toHaveLength(2);
    expect(bar.match(/className="btn-primary min-w-0"/g)).toHaveLength(2);
  });

  it('o painel é um diálogo a sério: nome, Escape, foco preso e devolvido, página parada por trás', () => {
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain("if (e.key === 'Escape') {");
    expect(modal).toContain('if (opener?.isConnected) opener.focus({ preventScroll: true });');
    expect(modal).toContain("body.style.overflow = 'hidden'");
    // enquanto a janela de pagamento do fornecedor está aberta, o teclado é dela
    expect(modal).toContain('if (supplierCheckoutOpen()) return;');
  });

  it('o script do fornecedor só é pedido quando alguém vai reservar, e só no site ao vivo', () => {
    // nada ao carregar o módulo: só dentro de funções chamadas pelo painel ou pelo botão
    expect(widget).not.toMatch(/^ensureBokunLoader\(\);/m);
    expect(widget).toContain('export function preloadBokunWidgets(): void {');
    expect(widget).toContain('if (!isLiveSiteHostname(window.location.hostname)) return Promise.resolve(false);');
    expect(card).toContain('onPointerEnter: preloadBokunWidgets');
    expect(bar).toContain('onTouchStart={preloadBokunWidgets}');
  });

  it('se o calendário não chega, há outra forma de reservar', () => {
    expect(widget).toContain("{status === 'failed' && (");
    expect(widget).toContain("t('bookingWidget.tryAgain', 'Try again')");
    expect(widget).toContain("t('experience.messageWhatsApp', 'Message us on WhatsApp to book')");
  });

  it('um vídeo nosso (ficheiro) toca no leitor do browser, não no Vimeo', () => {
    expect(page).toContain('const SELF_HOSTED_VIDEO = /\\.(?:mp4|webm)$/i;');
    expect(page).toMatch(/SELF_HOSTED_VIDEO\.test\(exp\.videoUrl\) \? \(\s*<video/);
    for (const file of ['client/public/videos/can-am.mp4', 'client/public/videos/can-am-poster.webp']) {
      expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
    }
  });

  it('a mensagem de WhatsApp não diz "Estimated total: €0" quando não há preço por pessoa', () => {
    expect(card).toContain('if (priceFrom > 0) msg += `\\nEstimated total: €${priceFrom * 2}`;');
  });
});
