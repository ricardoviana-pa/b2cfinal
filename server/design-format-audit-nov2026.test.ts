/* ==========================================================================
   Auditoria de formatação de 20 nov 2026.

   Depois de a letra crescer (auditoria de design, E01) o Ricardo viu o antes
   e depois e escreveu: "audita tudo o que fizeste pois parece-me que alguma
   formatação e padding piorou". 63 revisores compararam as 50 páginas, no
   computador e no telemóvel, com medições das duas versões compiladas. O que
   encontraram tinha quase sempre a mesma causa: texto 2 px maior em caixas
   que tinham sido afinadas ao píxel para o texto antigo.

   Cada bloco guarda uma correção. O que estes testes não conseguem ver (se
   uma frase cabe numa linha) foi medido no browser nas nove línguas; aqui
   fica a regra que o garante.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { keepDashes, keepHyphens, keepPhones, keepPostcode, noBreak } from '../client/src/lib/format';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const css = read('client/src/index.css');
const NBSP = ' ';

function publicTsx(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx$/.test(entry.name) && !/\/(pages\/admin|components\/admin|components\/ui)\//.test(rel)) out.push(rel);
    }
  };
  walk('client/src');
  return out;
}

describe('uma classe nunca fica colada a um "${" (a causa do padding que mudou sozinho)', () => {
  // Home.tsx acabava em `md:px-5${...}`. O Tailwind não emitia essa classe;
  // quando outro ficheiro passou a usar md:px-5 a regra apareceu e as quatro
  // células da faixa por baixo da fotografia do topo passaram de 8 para 20 px.
  it('nenhum className em template tem uma classe encostada à expressão', () => {
    const glued: string[] = [];
    for (const file of publicTsx()) {
      const source = read(file);
      for (const m of source.matchAll(/(?:className=\{|cls\s*=\s*|Class(?:Name)?\s*=\s*)`([^`]*)`/g)) {
        for (const g of m[1].matchAll(/(\S+?)\$\{/g)) {
          if (/[A-Za-z0-9\])]$/.test(g[1])) glued.push(`${file}: …${g[1]}\${`);
        }
      }
    }
    expect(glued).toEqual([]);
  });
  it('a faixa de garantias: 6 px no telemóvel, 8 px a partir de 640 px, e sem divisória solta', () => {
    const home = read('client/src/pages/Home.tsx');
    expect(home).toContain('px-1.5 py-4 sm:px-2 sm:py-5 md:py-7 ${divider}');
    // etiquetas a 12 px com a largura que tinham a 11 px: o espaçamento entre letras desce
    expect(home).toContain('tracking-[0.02em] text-pa-dark text-balance sm:text-[12px] sm:tracking-[0.1em] md:text-[12px] md:tracking-[0.06em] xl:tracking-[0.1em]');
    expect(home.match(/const cls = `[^`]*`/)![0]).not.toContain('md:px-5');
    // no telemóvel (duas colunas) só as células da esquerda têm divisória
    expect(home).toContain("i === 3 ? '' : i === 1 ? 'md:border-r border-[#E8E4DC]' : 'border-r border-[#E8E4DC]'");
  });
});

describe('nenhuma palavra sozinha na última linha', () => {
  it('o corpo da página pede quebras equilibradas (herdado por todos os textos)', () => {
    const body = css.slice(css.indexOf('\n  body {'), css.indexOf('\n  }', css.indexOf('\n  body {')));
    expect(body).toContain('text-wrap: pretty;');
  });
  it('datas, códigos postais e telefones não partem a meio', () => {
    expect(noBreak('13 Dec 2026')).toBe(`13${NBSP}Dec${NBSP}2026`);
    expect(keepPostcode('Tv. Estrada Nova 187, 4900-336 Viana do Castelo')).toBe('Tv. Estrada Nova 187, 4900-⁠336 Viana do Castelo');
    expect(keepPostcode('sem código')).toBe('sem código');
    expect(keepPhones('info@portugalactive.com or +351 258 358 434.')).toBe(`info@portugalactive.com or +351${NBSP}258${NBSP}358${NBSP}434.`);
    // um número de casas ou um preço não é um telefone
    expect(keepPhones('70 homes from 250 a night')).toBe('70 homes from 250 a night');
    // palavras com hífen ficam inteiras; um intervalo ou um travessão não mudam
    expect(keepHyphens('Fünf-Sterne-Service, auf Abruf')).toBe('Fünf-\u2060Sterne-\u2060Service, auf Abruf');
    expect(keepHyphens('Peneda-Gerês')).toBe('Peneda-\u2060Gerês');
    expect(keepHyphens('2-3 hours - easy')).toBe('2-3 hours - easy');
    // o travessão fica com a palavra anterior
    expect(keepDashes('the Algarve — the coasts')).toBe(`the Algarve${NBSP}— the coasts`);
  });
  it('quem os usa: tarifa reembolsável, bloco legal do checkout, termos e privacidade', () => {
    expect(read('client/src/components/booking/RatePlanCards.tsx')).toContain('date: noBreak(formatBookingDate(m.freeUntil, lang, true))');
    expect(read('client/src/pages/checkout/PreContractualBlock.tsx')).toContain('keepPostcode(companyAddressLine() ?? "")');
    expect(read('client/src/components/booking/CheckoutPaymentForm.tsx')).toContain('keepPostcode(companyAddressLine() ?? "")');
    expect(read('client/src/pages/Terms.tsx')).toContain("keepPhones(t('terms.s6Body'))");
    expect(read('client/src/pages/Privacy.tsx')).toContain("keepPhones(t('privacy.s5Body'))");
  });
});

describe('listas separadas por pontos: nenhuma linha começa com o ponto', () => {
  it('.pa-dots: o ponto vem antes de cada item e o primeiro de cada linha fica cortado', () => {
    // 12 px para o ponto e o espaço à volta, como o " · " no texto corrido
    expect(css).toMatch(/\.pa-dots \{ display: flex; flex-wrap: wrap; align-items: center; margin-left: -0\.75rem; clip-path: inset\(-4px -4px -4px calc\(0\.75rem - 3px\)\); \}/);
    expect(css).toMatch(/\.pa-dots > \*::before \{ content: "·"; flex: none; width: 0\.75rem;/);
  });
  it('usada nos factos da casa e na linha por baixo do nome de quem avaliou', () => {
    expect(read('client/src/pages/PropertyDetail.tsx')).toContain('<ul className="pa-dots gap-y-1 mt-1.5 body-sm text-pa-earth">');
    expect(read('client/src/components/property/ReviewsSection.tsx')).toContain('<div className="pa-dots text-[13px] text-pa-stone">');
  });
  it('resumos numa só frase: o ponto fica colado à parte anterior', () => {
    const page = read('client/src/pages/checkout/CheckoutPage.tsx');
    expect(page).toContain('const SUMMARY_DOT = "\\u00A0· ";');
    expect(page).toContain('.map(noBreak).join(SUMMARY_DOT)');
    expect(read('client/src/pages/checkout/CustomizeStep.tsx')).toContain('const DOT = "\\u00A0· ";');
    expect(read('client/src/pages/Adventures.tsx')).toContain(".join('\\u00A0· ')");
  });
  it('rodapé: no telemóvel a linha legal não tem pontos e pode partir entre ligações', () => {
    const footer = read('client/src/components/layout/Footer.tsx');
    expect(footer.match(/<span className="hidden md:inline mx-3 text-white\/15" aria-hidden="true">·<\/span><wbr \/>/g)).toHaveLength(4);
    expect(footer).not.toContain('<span className="mx-3 text-white/15"');
  });
});

describe('cartão das casas', () => {
  const card = read('client/src/components/property/PropertyCard.tsx');
  it('o nome e os números seguem a largura do cartão, não a do ecrã', () => {
    // 20 px só no computador: num telemóvel de 402 a 430 px o cartão de uma
    // coluna tem 362 a 390 px e cinco nomes partiam em dois (um, no site de hoje)
    expect(card).toContain('lg:@min-[360px]:text-[1.25rem]');
    expect(card).not.toContain(' @min-[360px]:text-[1.25rem]');
    expect(card).toContain('gap-2 lg:@min-[360px]:gap-2.5');
    // os números (14 px, como os ícones) ficam na linha do nome
    expect(card).toContain('text-[14px] text-pa-earth shrink-0');
    expect(card).toContain('@min-[340px]:text-[1.125rem] lg:@min-[360px]:text-[1.25rem]');
    expect(card).toContain('text-balance');
    // um hífen entre espaços não começa a segunda linha
    expect(card).toContain('{keepDashes(displayName)}');
    expect(keepDashes('Quinta do Merouço - Casa do Rio')).toBe(`Quinta do Merouço${NBSP}- Casa do Rio`);
  });
  it('a linha do preço fica no fundo do cartão: filas niveladas mesmo com um nome em duas linhas', () => {
    expect(card).toContain('className="flex h-full flex-col"');
    expect(card).toContain('<article className="group cursor-pointer flex flex-1 flex-col">');
    expect(card).toContain('<div className="@container flex flex-1 flex-col pt-3.5">');
    expect(card).toContain("${hidePrice ? '' : 'mb-3'}");
  });
  it('preço e contexto: a linha parte inteira, as frases não', () => {
    expect(card).toContain('mt-auto pt-3 flex flex-wrap items-baseline justify-between gap-x-2 @min-[340px]:gap-x-3 gap-y-1');
    // num cartão estreito o rótulo do preço fica a 14 px, para caber ao lado de "5 unidades disponíveis"
    expect(card.match(/<span className="text-pa-stone text-\[14px\] @min-\[340px\]:text-\[15px\]">/g)).toHaveLength(4);
    // o contexto à direita (unidades ou noites) é legenda: 13 px
    expect(card).toContain('<p className="text-[13px] text-pa-earth font-medium leading-tight">');
  });
});

describe('listagem', () => {
  const homes = read('client/src/pages/Homes.tsx');
  it('título e pesquisa lado a lado só a partir de 1280 px (e nunca com o título de uma coleção)', () => {
    expect(homes).toContain("`flex flex-col gap-5 ${collection ? '' : 'xl:flex-row xl:items-end xl:justify-between xl:gap-10'}`");
    expect(homes).not.toContain('lg:flex-row lg:items-end');
  });
  it('a barra do computador tem largura fixa: escolher uma data não a faz deslizar nem ao calendário', () => {
    expect(homes).toContain('<div className="hidden lg:block w-full lg:max-w-[760px] xl:w-[760px] xl:shrink-0">');
    expect(homes).not.toContain('xl:w-auto');
    // o destino fica com o que as datas deixam
    expect(homes).toContain('<div className="flex-1 relative h-full min-w-0">');
  });
  it('telemóvel: a palavra "hóspedes" só aparece onde cabe, em qualquer língua', () => {
    expect(homes).toContain('flex h-6 min-w-0 flex-1 flex-wrap justify-center gap-x-1 overflow-hidden px-1"><span>{bookingGuests}</span><span>{t(\'home.searchGuests\')}</span></span>');
    expect(homes).not.toContain('min-[430px]:inline');
  });
  it('datas da barra do computador: dia e mês, células à largura do texto, o ano no nome acessível', () => {
    expect(homes).toContain("const shownDateShort = (iso: string) => (iso ? formatBookingDate(iso, i18n.language) : '');");
    expect(homes.match(/className="flex-none h-full"\s+textClassName="px-3\.5"/g)).toHaveLength(2);
    expect(homes).toContain('shown={shownDateShort(bookingCheckin)}');
    expect(homes).toContain('spoken={shownDate(bookingCheckin)}');
    expect(read('client/src/components/booking/SearchDatesPicker.tsx')).toContain('shown={spoken || shown}');
  });
  it('a lista "mais casas" não parte o nome da localidade nem começa uma linha pelo ponto', () => {
    for (const file of [homes, read('client/src/pages/Collection.tsx')]) {
      expect(file).toContain("{property.locality && <>{'\\u00A0'}<span className=\"text-pa-stone whitespace-nowrap\">· {property.locality}</span></>}");
      expect(file).toContain('<ul className="columns-1 sm:columns-2 lg:columns-3 gap-x-8 body-sm text-sm">');
      expect(file).toMatch(/<li key=\{property\.id\} className="break-inside-avoid py-1 leading-snug text-balance">/);
    }
  });
  it('filtros: o valor escolhido não é cortado e o acento de "Équipements" vê-se', () => {
    expect(read('client/src/components/homes/HomesFilterRail.tsx')).toContain('<span className="truncate max-w-[240px] leading-[1.4]">{value || label}</span>');
  });
  it('a linha de cancelamento e WhatsApp volta ao tamanho de legenda no computador', () => {
    expect(read('client/src/components/homes/ListingReassurance.tsx')).toContain('text-[15px] lg:text-[13px]');
  });
  it('filtro "Espaço": a primeira célula tem a largura da palavra ("Beliebig", "Cualquiera")', () => {
    expect(read('client/src/components/homes/HomesFilterRail.tsx')).toContain('`minmax(max-content, 1fr) repeat(${Math.max(1, options.length - 1)}, minmax(0, 1fr))`');
  });
});

describe('rodapé no telemóvel', () => {
  const footer = read('client/src/components/layout/Footer.tsx');
  it('ligações a 14 px (13 px abaixo de 375 px) em duas colunas, a primeira à largura do seu texto', () => {
    expect(footer).toContain('grid grid-cols-[auto_minmax(0,1fr)] md:grid-cols-[repeat(3,auto)] md:justify-between lg:grid-cols-[1.15fr_1fr_1.1fr_0.9fr] lg:justify-normal');
    // direitos e ligações legais lado a lado só a partir de 1024 px (num tablet não cabem numa linha)
    expect(footer).toContain('lg:flex-row lg:items-center lg:justify-between lg:pr-16');
    expect(footer).not.toContain('md:flex-row md:items-center md:justify-between');
    expect(footer.match(/text-\[13px\] min-\[375px\]:text-\[14px\] md:text-\[15px\] text-white\/65/g)!.length).toBeGreaterThanOrEqual(4);
  });
  it('o ponto de "Norte de Portugal · Minho" desce com a palavra seguinte', () => {
    expect(footer).toContain("label.replace(/ · /g, ' ·\\u00A0')");
  });
  it('a faixa vazia do "voltar ao topo" saiu: só o botão do WhatsApp flutua abaixo de 1024 px', () => {
    expect(css).toMatch(/:root \{\s*--floats-clearance: calc\(7rem \+ env\(safe-area-inset-bottom, 0px\)\);/);
    expect(css).toMatch(/--floats-clearance: calc\(7\.5rem \+ env\(safe-area-inset-bottom, 0px\)\);/);
    expect(css).not.toContain('--floats-clearance: calc(9.5rem');
  });
});

describe('página da casa: cartões de serviços e experiências', () => {
  const pdp = read('client/src/pages/PropertyDetail.tsx');
  it('o rodapé do cartão é sempre igual: preço à esquerda, unidade por baixo, ação à direita', () => {
    // sem flex-wrap: a ação caía para baixo do preço nuns cartões e noutros não
    expect(pdp).toContain("const ADDON_FOOT = '@container mt-auto flex items-baseline justify-between gap-x-2 pt-2.5 sm:pt-3 border-t border-pa-sand';");
    expect(pdp).toContain("const ADDON_ACTION = 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap");
    expect(pdp.match(/className=\{ADDON_FOOT\}/g)).toHaveLength(2);
    expect(pdp.match(/<span className="block caption leading-snug text-pa-stone font-normal">/g)).toHaveLength(2);
  });
  it('três linhas de descrição e rodapés alinhados na mesma fila', () => {
    expect(pdp).toContain('line-clamp-3');
    expect(pdp).toContain("const ADDON_BODY = 'flex min-w-0 flex-1 flex-col p-3.5 sm:p-5';");
  });
  it('casas de parceiros: o cartão de reserva igual ao das nossas', () => {
    const partner = read('client/src/components/booking/PartnerBookingPanel.tsx');
    const own = read('client/src/components/booking/BookingWidget.tsx');
    // as mesmas peças, com as mesmas classes, nos dois ficheiros
    for (const shared of [
      '<div className="border border-black/15 rounded-lg mt-3 px-4 py-3">',
      'block eyebrow font-medium tracking-[0.15em] lg:max-xl:tracking-[0.06em] uppercase text-pa-stone mb-1',
      'eyebrow font-medium tracking-[0.15em] uppercase text-pa-stone mb-2',
      'shadow-[inset_0_-2px_0_var(--color-pa-dark)]',
      'bg-black/[0.02] border border-black/10 rounded-lg overflow-hidden',
      'min-w-[3ch] text-center body-sm text-black tabular-nums font-normal',
    ]) {
      expect(partner, `parceiros: ${shared}`).toContain(shared);
      expect(own, `nossas: ${shared}`).toContain(shared);
    }
    for (const file of [partner, own]) {
      expect(file.match(/flex h-10 w-10 items-center justify-center rounded-full border border-black\/15/g)).toHaveLength(2);
      expect(file).not.toContain('flex h-9 w-9 items-center justify-center rounded-full border border-black/15');
    }
  });
  it('os botões do cartão de reserva têm a letra dos outros botões (12 px)', () => {
    const own = read('client/src/components/booking/BookingWidget.tsx');
    expect(own).not.toMatch(/pa-action w-full[^"\n]*\bcaption\b[^"\n]*uppercase/);
  });
  it('a barra de reserva do telemóvel volta à altura que tinha', () => {
    expect(pdp).toContain('<p className="caption leading-snug text-pa-dark font-medium">');
    expect(pdp.match(/className="btn-primary shrink-0 max-sm:px-4!"/g)).toHaveLength(2);
  });
  it('todas as comodidades: a lista é que desliza, o título e o botão de fechar ficam', () => {
    expect(pdp).toContain('className="flex flex-col max-w-[calc(100%-2rem)] sm:max-w-2xl max-h-[85vh] overflow-hidden p-0');
    expect(pdp).toContain('<div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-7">');
    expect(pdp).not.toContain('<DialogHeader className="sticky top-0');
  });
});

describe('checkout no telemóvel', () => {
  const step = read('client/src/pages/checkout/CustomizeStep.tsx');
  it('cada extra: nome e preço ao lado da fotografia, descrição por baixo a toda a largura', () => {
    expect(step).toContain('<div className="pa-option" data-photo={item.photo ? "true" : undefined}>');
    for (const part of ['pa-option-photo', 'pa-option-text', 'pa-option-name', 'pa-option-desc', 'pa-option-side', 'pa-option-price', 'pa-option-toggle']) {
      expect(step, part).toContain(part);
    }
    const at = css.indexOf('  .pa-option {');
    const block = css.slice(at, css.indexOf('\n}\n', at));
    expect(block).toContain('grid-template-areas: "name toggle" "price toggle" "desc desc";');
    expect(block).toContain('grid-template-areas: "photo name toggle" "photo price toggle" "desc desc desc";');
    // do tablet para cima volta a ser uma linha, como sempre foi no computador
    expect(block).toMatch(/@media \(min-width: 640px\) \{\s*\.pa-option \{ display: flex;/);
  });
  it('a conta fica na sua linha e as pastilhas não partem o texto', () => {
    expect(step).toContain('<span className="basis-full text-right sm:basis-auto caption text-pa-earth tabular-nums">');
    expect(step.match(/rounded-full border whitespace-nowrap transition-colors/g)).toHaveLength(2);
  });
  it('o email de confirmação tem a linha toda', () => {
    const page = read('client/src/pages/checkout/CheckoutPage.tsx');
    expect(page).toContain('<div className="flex flex-wrap items-center gap-x-1.5 min-w-0 body-sm">');
    expect(page).toContain('<span className="text-pa-earth shrink-0 basis-full sm:basis-auto">');
  });
});

describe('experiências', () => {
  it('factos: uma coluna no telemóvel, cinco à largura do texto a partir de 1280 px', () => {
    const facts = read('client/src/components/experience/ExperienceQuickFacts.tsx');
    expect(facts).toContain('grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-[repeat(5,auto)]');
    expect(facts).toContain("items.length === 1 ? 'col-span-full' : ''");
  });
  it('a barra do telemóvel alinha com a margem da página (20 px)', () => {
    expect(read('client/src/components/experience/ExperienceMobileBookingBar.tsx')).toContain('border-t border-pa-sand px-5 pt-3');
  });
  it('o nome da experiência não é cortado no painel de reserva', () => {
    const modal = read('client/src/components/experience/BokunWidgetModal.tsx');
    expect(modal).toContain('line-clamp-2 font-display text-[22px]');
    expect(modal).not.toContain('truncate font-display text-[22px]');
  });
});

describe('guias de destino', () => {
  it('títulos das secções que fecham partem em linhas iguais; a etiqueta do topo cabe numa linha', () => {
    const guide = read('client/src/components/destinations/GuideSection.css');
    expect(guide).toMatch(/\.guide-heading > h2,\s*\.guide-heading > h3 \{\s*text-wrap: balance;/);
    const minho = read('client/src/components/destinations/MinhoVisualGuide.css');
    expect(minho).toMatch(/\.minho-hero \.minho-kicker \{\s*max-width: none;\s*font-size: 0\.75rem;/);
  });
  it('os títulos dos cartões voltam a ser maiores do que o texto por baixo', () => {
    const sections = read('client/src/components/destinations/sections.tsx');
    expect(sections).not.toMatch(/className="text-\[16px\] font-medium text-\[#1A1A18\] mb-(?:2|1\.5)(?: tracking-\[0\.02em\])?"\s*style=\{\{ fontFamily: 'var\(--font-display\)' \}\}/);
    expect(sections.match(/text-\[19px\] leading-snug font-medium text-\[#1A1A18\]/g)!.length).toBeGreaterThanOrEqual(5);
  });
});

describe('2.ª ronda da auditoria de formatação (21 nov 2026)', () => {
  const pdp = read('client/src/pages/PropertyDetail.tsx');
  const partner = read('client/src/components/booking/PartnerBookingPanel.tsx');
  const own = read('client/src/components/booking/BookingWidget.tsx');
  it('serviços e experiências: a palavra da ação só onde cabe ao lado do preço, e duas colunas até 1279 px', () => {
    expect(pdp).toContain("const ADDON_ACTION_WORD = '@max-[15rem]:sr-only';");
    expect(pdp.match(/<span className=\{ADDON_ACTION_WORD\}>/g)).toHaveLength(2);
    expect(pdp.match(/grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-5/g)).toHaveLength(2);
    expect(pdp).not.toContain('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5');
    // "Can-Am" não parte no hífen
    expect(pdp).toContain('{keepHyphens(adventure.name)}');
    expect(pdp).toContain('{keepHyphens(service.name)}');
    // no telemóvel a duração e a dificuldade (que no computador estão na fotografia) ficam no lugar do sobretítulo
    expect(pdp).toContain('<span className="pa-dots gap-y-1 sm:hidden!">');
    expect(pdp).toContain('{meta.slice(0, 2).map((m, i) => <span key={i} className="whitespace-nowrap">{m}</span>)}');
  });
  it('linhas com pontos: anfitrião e quartos sem ponto no início nem no fim de uma linha', () => {
    expect(pdp).toContain('<p className="pa-dots mt-4 body-sm text-pa-dark leading-tight">');
    expect(pdp).toContain('<Link href="/about" className="min-h-0 caption text-pa-gold-aa hover:underline">');
    expect(pdp).toContain(".replace('Portugal Active', 'Portugal\\u00A0Active')");
    expect(pdp).toContain('<p className="pa-dots body-sm text-pa-earth mb-5">');
    expect(pdp).toContain(".flatMap((s) => s.split(' · '))");
  });
  it('características principais em duas linhas em vez de cortadas; migalhas com reticências; pergunta equilibrada', () => {
    expect(pdp).not.toContain('<span className="truncate">{a.label}</span>');
    expect(pdp).toContain('<span className="min-w-0">{a.label}</span>');
    expect(pdp).toContain('<span className="truncate">{displayName}</span>');
    expect(pdp).toContain('<span className="text-balance">{f.q}</span>');
    expect(pdp).toContain('bookableOnline || partnerUid ? "container pt-5 lg:pt-6 pb-8 lg:pb-16"');
  });
  it('avaliações: data e língua por baixo do nome, à largura toda da coluna', () => {
    const reviews = read('client/src/components/property/ReviewsSection.tsx');
    expect(reviews).toContain('<div className="flex items-center gap-2.5 mb-3">');
    expect(reviews).toContain('<div className="min-w-0 flex-1">');
    expect(reviews).not.toContain('<span key={i} className="whitespace-nowrap">{part}</span>');
  });
  it('calendário: avisos em duas linhas cabem no espaço reservado; no telemóvel o Limpar é só a cruz', () => {
    const cal = read('client/src/components/booking/AvailabilityCalendar.tsx');
    expect(cal.match(/<p className="text-\[12px\] text-[^"]* font-medium leading-\[1\.3\]">/g)).toHaveLength(2);
    expect(cal).toContain('<span className="max-sm:sr-only">{t("bookingWidget.clearDates")}</span>');
  });
  it('casas de parceiros como as nossas: euros inteiros antes do pagamento, mínimo de noites no topo, campos de 48 px', () => {
    expect(partner).toContain('stayBreakdownEuros([quote.accommodation, quote.cleaningFee || 0], quote.total)');
    expect(partner.match(/\{formatStayEur\(quote\.total, lang\)\}/g)).toHaveLength(2);
    expect(partner).toContain("t('partnerBooking.payCta', { amount: formatStayEur(quote.total, lang)");
    // o recibo depois de pagar mantém os cêntimos
    expect(partner.match(/formatQuotedEur\(Number\(paid\.total\) \|\| 0, lang\)/g)).toHaveLength(2);
    expect(partner.match(/w-full h-\[48px\] rounded-lg border border-black\/15/g)).toHaveLength(2);
    expect(own.match(/w-full h-\[48px\] rounded-lg border border-black\/15/g)).toHaveLength(3);
    for (const file of [partner, own]) {
      expect(file).toContain('caption text-center text-pa-gold-aa hover:text-black transition-colors pt-2.5 mt-0.5 border-t border-black/[0.06]');
      expect(file).toContain("<p className=\"caption text-pa-stone mt-1.5 flex items-center gap-1.5\">");
    }
  });
  it('resumo da estadia sem ponto no fim de linha; data da política de cancelamento inteira', () => {
    expect(own.match(/<p className="pa-dots caption text-pa-stone">/g)).toHaveLength(2);
    expect(read('client/src/lib/cancellation.ts')).toContain('formatDate: (ymd) => noBreak(formatBookingDate(ymd, lang, true))');
    expect(read('client/src/components/booking/RatePlanCards.tsx')).toContain('body-sm lg:max-xl:text-sm text-pa-dark font-medium leading-snug');
  });
  it('rodapé, cookies e diálogos', () => {
    const footer = read('client/src/components/layout/Footer.tsx');
    expect(footer).toContain('text-[13px] max-[389px]:text-[12px] leading-snug text-white/80');
    expect(footer).toContain("<span className=\"whitespace-nowrap\">{t('legalFooter.complaintsBook')}</span>");
    expect(read('client/src/components/layout/CookieBanner.tsx')).toContain('underline underline-offset-2 transition-colors whitespace-nowrap');
    const dialog = read('client/src/components/ui/dialog.tsx');
    expect(dialog).toContain('absolute top-4 right-4 inline-flex items-center justify-center');
    expect(dialog).toContain('focus-visible:ring-2 focus-visible:ring-offset-2');
  });
  it('francês: os dois pontos, o ponto de interrogação e o de exclamação não começam uma linha', () => {
    const fr = read('client/src/i18n/locales/fr.json');
    expect(fr).not.toMatch(/ [:;!?»]/);
    expect(fr).not.toMatch(/« /);
  });
  it('legendas dos destinos na homepage a 13 px, o tamanho de legenda', () => {
    expect(read('client/src/pages/Home.tsx')).toContain('<p className="caption leading-[1.55] text-pa-earth mt-3 font-body font-normal" >');
  });
  it('títulos de secção a 20 px no telemóvel e no tablet, a partir em linhas iguais', () => {
    expect(css).toMatch(/\.headline-sm \{[^}]*font-size: clamp\(1\.25rem, 2vw, 1\.5rem\);[^}]*text-wrap: balance;/);
  });
});
