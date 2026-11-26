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
import { frenchSpacing, keepBrand, keepDashes, keepHyphens, keepNameParts, keepPhones, keepPostcode, keepSeparators, noBreak } from '../client/src/lib/format';

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
    // 0.06em de 640 a 1279 px (a 0.1em o espanhol partia em duas linhas de 700 a 767 px)
    expect(home).toContain('tracking-[0.02em] text-pa-dark text-balance sm:text-[12px] sm:tracking-[0.06em] md:text-[12px] xl:tracking-[0.1em]');
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
    // o recorte deixa 8 px em cima, à direita e em baixo (o anel de foco de uma ligação ficava cortado)
    expect(css).toMatch(/\.pa-dots \{ display: flex; flex-wrap: wrap; align-items: center; margin-left: -0\.75rem; clip-path: inset\(-8px -8px -8px calc\(0\.75rem - 3px\)\); \}/);
    expect(css).toContain('.pa-dots a:focus-visible, .pa-dots button:focus-visible { outline-offset: 0; }');
    expect(css).toMatch(/\.pa-dots > \*::before \{ content: "·"; flex: none; width: 0\.75rem;/);
  });
  it('usada nos factos da casa e na linha por baixo do nome de quem avaliou', () => {
    expect(read('client/src/pages/PropertyDetail.tsx')).toContain('<ul className="pa-dots gap-y-1 mt-1.5 body-sm text-pa-earth">');
    expect(read('client/src/components/property/ReviewsSection.tsx')).toContain('<div className="pa-dots text-[13px] text-pa-stone">');
  });
  it('resumos numa só frase: o ponto fica colado à parte anterior', () => {
    const page = read('client/src/pages/checkout/CheckoutPage.tsx');
    expect(page).toContain('const SUMMARY_DOT = "\\u00A0· ";');
    // cada data e "4 hóspedes" inteiros; o intervalo pode partir depois da seta e a tarifa entre palavras
    expect(page).toContain('`${noBreak(formatBookingDate(checkIn, lang, true))}\\u00A0→ ${noBreak(formatBookingDate(checkOut, lang, true))}`');
    expect(page).toContain('guestsLine ? noBreak(guestsLine) : null,');
    expect(read('client/src/pages/checkout/CustomizeStep.tsx')).toContain('const DOT = "\\u00A0· ";');
    // o ponto fica com a região antes dele (keepSeparators) e a linha enche-se como no site de hoje
    expect(read('client/src/pages/Adventures.tsx')).toContain("{keepSeparators(adventure.destinations.map(d => t(`destinations.${d}`)).join(' · '))}");
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
    expect(card).toContain('{keepNameParts(displayName)}');
    expect(keepDashes('Quinta do Sol - Casa do Lago')).toBe(`Quinta do Sol${NBSP}- Casa do Lago`);
  });
  it('a linha do preço fica no fundo do cartão: filas niveladas mesmo com um nome em duas linhas', () => {
    expect(card).toContain("className={fillCell ? 'flex h-full flex-col' : 'flex flex-col'}");
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
  it('ligações a 14 px (13 px abaixo de 390 px) em duas colunas, a primeira à largura do seu texto até 479 px', () => {
    // a primeira coluna à largura do seu texto só até 479 px; daí duas colunas iguais
    expect(footer).toContain('grid grid-cols-[auto_minmax(0,1fr)] min-[480px]:grid-cols-2 md:grid-cols-[repeat(3,auto)] md:justify-between lg:grid-cols-[1.15fr_1fr_1.1fr_0.9fr] lg:justify-normal');
    // direitos e ligações legais lado a lado só a partir de 1024 px (num tablet não cabem numa linha)
    expect(footer).toContain('lg:flex-row lg:items-center lg:justify-between lg:pr-16');
    expect(footer).not.toContain('md:flex-row md:items-center md:justify-between');
    // 14 px só a partir de 390 px: a 375 px o francês partia "Services de conciergerie"
    expect(footer.match(/text-\[13px\] min-\[390px\]:text-\[14px\] md:text-\[15px\] text-white\/65/g)!.length).toBeGreaterThanOrEqual(4);
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
    // a linha única a partir de 512 px (entre 512 e 639 px a disposição do telemóvel deixava a lista 39 % mais alta; entre 480 e 511 px a linha única espremia os nomes)
    expect(block).toMatch(/@media \(min-width: 512px\) \{\s*\.pa-option \{ display: flex;/);
  });
  it('a conta fica na sua linha e as pastilhas não partem o texto', () => {
    // à direita mesmo quando desce para baixo dos contadores; ao lado deles a partir de 512 px, com a linha única
    expect(step).toContain('<span className="basis-full text-right min-[512px]:basis-auto min-[512px]:ml-auto caption text-pa-earth tabular-nums">');
    // as pastilhas da chegada, "Todos os dias" e as do aeroporto nunca partem o texto
    expect(step.match(/rounded-full border whitespace-nowrap transition-colors/g)).toHaveLength(3);
  });
  it('o email de confirmação tem a linha toda', () => {
    const page = read('client/src/pages/checkout/CheckoutPage.tsx');
    // no telemóvel "Confirmação para · alterar" na primeira linha e o endereço na seguinte, inteiro
    expect(page).toContain('<div className="flex flex-wrap sm:flex-nowrap items-center gap-x-1.5 min-w-0 body-sm">');
    // a partir de 640 px sem pontos de quebra: uma linha com reticências
    expect(page).toContain('<span className="order-last basis-full wrap-anywhere text-pa-dark font-medium sm:order-none sm:basis-auto sm:truncate sm:min-w-0 sm:[&>wbr]:hidden">');
    // partes depois de "@" e antes de cada ".", sem lookbehind (o Safari antigo não o lê)
    expect(page).toContain('{email.replace("@", "@\\u0001").split(/\\u0001|(?=\\.)/).map((part, i) => <Fragment key={i}>{i > 0 && <wbr />}{part}</Fragment>)}');
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
    // só a duração (traduzida): a dificuldade existe só em inglês
    expect(pdp).toContain('<span className="sm:hidden">{meta[0]}</span>');
    expect(pdp).not.toContain('meta.slice(0, 2).map((m, i) => <span key={i} className="whitespace-nowrap">');
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
    expect(pdp).toContain('<span className="min-w-0">{keepHyphens(a.label)}</span>');
    expect(pdp).toContain('<span className="truncate">{displayName}</span>');
    expect(pdp).toContain('<span className="text-balance">{keepHyphens(f.q)}</span>');
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
    // a cruz sozinha conforme a largura do próprio calendário (abaixo de 28rem), não a do ecrã
    expect(cal).toContain('<span className="@max-[28rem]:sr-only">{t("bookingWidget.clearDates")}</span>');
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
    // 13 px de 1024 a 1279 px e 14 px abaixo de 375 px; a linha de cancelamento corre por baixo do nome e do preço
    // pela largura do próprio cartão (container), com lugar para o nome e o selo RECOMENDADA: 15 px a partir de 400 px de texto, 14 px a partir de 336 px, 13 px abaixo
    expect(read('client/src/components/booking/RatePlanCards.tsx')).toContain('body-sm @max-[25rem]:text-sm @max-[21rem]:text-[13px] text-pa-dark font-medium leading-snug');
    expect(read('client/src/components/booking/RatePlanCards.tsx')).toContain('<p id={benefitId} className={cn("caption -mt-2 pl-[26px] leading-snug text-balance"');
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

describe('3.ª ronda da auditoria de formatação (21 nov 2026)', () => {
  const NB = ' ';
  it('um separador fica com a palavra antes dele: a linha pode acabar nele, nunca começar', () => {
    expect(keepSeparators('Leste / Faro / Olhão / Tavira')).toBe(`Leste${NB}/ Faro${NB}/ Olhão${NB}/ Tavira`);
    expect(keepSeparators('Réserver maintenant · 5 177 €')).toBe(`Réserver maintenant${NB}· 5 177 €`);
    expect(keepBrand('ofertas da Portugal Active (opcional).')).toBe(`ofertas da Portugal${NB}Active (opcional).`);
  });
  it('nomes das casas: um nome de duas palavras antes do travessão fica inteiro', () => {
    expect(keepNameParts('Monte Azul - Mansion')).toBe(`Monte${NB}Azul${NB}- Mansion`);
    // a inicial já não fica colada: nos cartões estreitos das casas semelhantes dava três linhas
    expect(keepNameParts('Lima River · S. Silvestre House')).toBe(`Lima River${NB}· S. Silvestre House`);
    expect(keepNameParts('Quinta do Sol - Casa do Lago')).toBe(`Quinta do Sol${NB}- Casa do Lago`);
    expect(keepNameParts('Villa Aura')).toBe('Villa Aura');
  });
  it('destinos: com notas por baixo, cada cartão tem a sua altura e a nota fica dentro da célula', () => {
    const sections = read('client/src/components/destinations/sections.tsx');
    expect(sections).toContain('const hasNotes = featured && visibleHomes.some(');
    expect(sections).toContain('fillCell={!hasNotes} />');
    expect(read('client/src/components/property/PropertyCard.tsx')).toContain('fillCell = true,');
  });
  it('calendário: as pastilhas seguem a largura do próprio calendário e a fila nunca ganha uma segunda linha', () => {
    const cal = read('client/src/components/booking/AvailabilityCalendar.tsx');
    expect(cal).toContain('<div className="@container">');
    expect(cal.match(/px-2 @max-\[16rem\]:px-1\.5 @min-\[28rem\]:px-2\.5 py-1/g)).toHaveLength(3);
    expect(cal.match(/text-\[12px\] @min-\[28rem\]:text-\[13px\]/g)).toHaveLength(3);
    expect(cal).toContain('text-black/20 shrink-0 @max-[16rem]:hidden');
    // o Limpar tem a altura das outras pastilhas e uma área de toque maior
    expect(cal).toContain('min-h-[calc(1lh_+_0.5rem)]');
    expect(cal).toContain("after:absolute after:-inset-y-2 after:-left-1 after:-right-3 after:content-['']");
  });
  it('preço "a partir de": o valor e "por noite" nunca se partem por dentro', () => {
    for (const file of ['client/src/components/booking/BookingWidget.tsx', 'client/src/components/booking/PartnerBookingPanel.tsx']) {
      const src = read(file);
      expect(src).toContain('<div className="flex flex-wrap items-baseline gap-x-1">');
      expect(src).toMatch(/text-\[28px\] text-pa-dark font-display whitespace-nowrap/);
      // "por noite" a 12 px de 1024 a 1279 px, onde o cartão tem 283-288 px
      expect(src).toMatch(/<span className="body-sm lg:max-xl:text-\[0\.75rem\] text-pa-stone whitespace-nowrap">/);
    }
  });
  it('parceiros: com um total, o mínimo de noites fica por baixo das datas, como nas nossas casas', () => {
    const partner = read('client/src/components/booking/PartnerBookingPanel.tsx');
    expect(partner).toContain('{(minNights ?? 0) > 1 && !shortStay && (quote || (isFetching && datesValid)) && (');
    expect(partner).toContain("keepSeparators(t('partnerBooking.payCta'");
  });
  it('unidades de um grupo: a seta fica com "Ver unidade" e a nota desce para baixo do título', () => {
    const units = read('client/src/components/property/PropertyUnitsSection.tsx');
    expect(units).toContain('flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-6');
    expect(units).toContain('<div className="flex items-center justify-between gap-x-1.5">');
    expect(units).toContain("<span className=\"shrink-0 whitespace-nowrap text-[12px] text-pa-gold-aa uppercase tracking-[0.04em]\">");
  });
  it('régua de filtros: só o valor do Espaço cede quando a linha está cheia', () => {
    const rail = read('client/src/components/homes/HomesFilterRail.tsx');
    expect(rail).toContain("${key === 'space' ? 'min-w-0' : 'shrink-0'}");
    expect(rail).toContain('[&>button]:shrink-0 [&>button]:whitespace-nowrap');
    expect(rail).toContain("{status('inline-flex shrink-0 whitespace-nowrap')}");
  });
  it('experiências: factos com o ícone por cima de 640 a 1023 px e línguas em lista de pontos', () => {
    const facts = read('client/src/components/experience/ExperienceQuickFacts.tsx');
    // só de 640 a 1023 px: a partir de 1024 px as colunas já chegam ao lado do ícone
    expect(facts).toContain('sm:max-lg:flex-col sm:max-lg:gap-2');
    expect(facts).toContain('<p className="pa-dots text-[15px] leading-snug text-[#1A1A18]"');
    const card = read('client/src/components/experience/ExperienceBookingCard.tsx');
    expect(card.match(/px-4 xl:px-5/g)!.length).toBeGreaterThanOrEqual(3);
    expect(card).toContain("opt.detail.split(' · ')");
  });
  it('checkout: resumo da estadia em três linhas no telemóvel e e-mail inteiro na sua linha', () => {
    expect(read('client/src/pages/checkout/CheckoutSection.tsx')).toContain('line-clamp-3 sm:line-clamp-2');
    const page = read('client/src/pages/checkout/CheckoutPage.tsx');
    // texto corrido em pedaços inteiros: o ponto fica com a data de saída
    expect(page).toContain('<span className="text-pa-earth">{"\\u00A0"}· {noBreak(guestsLine)}</span>');
    expect(page).toContain('{keepBrand(t("checkout.newsletterOptIn"');
    const step = read('client/src/pages/checkout/CustomizeStep.tsx');
    expect(step).toContain('{confirmNote ? <span className={secondLine ? "block" : undefined}>{confirmNote}</span> : null}');
  });
  it('horas e números que não se separam da unidade nas traduções', () => {
    const de = JSON.parse(read('client/src/i18n/locales/de.json'));
    expect(de.checkout.reception.lateNote).toBe(`Nach {{hour}}${NB}Uhr: {{price}}.`);
    // um WORD JOINER depois do travessão: uma linha podia partir depois dele mesmo com o espaço inseparável
    expect(JSON.parse(read('client/src/i18n/locales/en.json')).serviceDetail.whatsappNote).toBe(`Available every day, 9${NB}am${NB}–\u2060${NB}9${NB}pm (Lisbon time)`);
    expect(JSON.parse(read('client/src/i18n/locales/fi.json')).cookieBanner?.description ?? read('client/src/i18n/locales/fi.json')).toContain(`Ads${NB}‑mittauksen`);
  });
  it('francês fora do fr.json: a política de cancelamento também tem o espaço inseparável', () => {
    const policy = read('shared/cancellationPolicy.ts');
    expect(policy).toContain(`selon le tarif${NB}; ensuite`);
    expect(policy).toContain(`Quelle est la politique d'annulation${NB}?`);
  });
  it('rodapé: 13 px abaixo de 390 px, duas colunas iguais a partir de 480 px e o logótipo alinhado com o texto', () => {
    const footer = read('client/src/components/layout/Footer.tsx');
    expect(footer).not.toContain('min-[375px]:text-[14px]');
    expect(footer.match(/text-\[13px\] min-\[390px\]:text-\[14px\] md:text-\[15px\]/g)).toHaveLength(4);
    expect(footer).toContain('h-8 lg:h-10 w-auto object-contain mb-5 -ml-1.5 lg:-ml-2');
  });
  it('guias: cartões em subgrelha para os títulos de uma fila partilharem a altura', () => {
    const sections = read('client/src/components/destinations/sections.tsx');
    expect(sections.match(/md:grid md:grid-rows-subgrid md:row-span-3 md:mb-4/g)).toHaveLength(4);
    expect(sections.match(/gap-4 md:gap-y-0/g)).toHaveLength(4);
  });
});

describe('verificação da 3.ª ronda (22 nov 2026)', () => {
  const NB = ' ';
  it('line-clamp: só as utilidades do Tailwind (as cópias à mão anulavam md:line-clamp-2)', () => {
    expect(css).not.toMatch(/^\s*\.line-clamp-[23] \{/m);
  });
  it('francês fora do fr.json e números com hífen', () => {
    expect(frenchSpacing("Guide de l'amateur de vin : la vallée", 'fr')).toBe(`Guide de l'amateur de vin${NB}: la vallée`);
    expect(frenchSpacing('Porto: a guide', 'en')).toBe('Porto: a guide');
    expect(keepHyphens('360-degree')).toBe('360-⁠degree');
  });
  it('cartões dos guias: a margem da última fila não aumenta o espaço até ao grupo seguinte', () => {
    const sections = read('client/src/components/destinations/sections.tsx');
    expect(sections.match(/gap-4 md:gap-y-0 md:-mb-4/g)).toHaveLength(4);
    // "Continuar a explorar": no fundo da fotografia, duas linhas onde há três cartões por fila
    expect(sections).toContain('line-clamp-3 md:line-clamp-2');
    expect(sections).not.toContain('min-h-[3lh]');
  });
  it('regiões em /destinos: cada cartão em subgrelha de quatro filas', () => {
    expect(read('client/src/pages/Destinations.tsx')).toContain('md:grid md:grid-rows-subgrid md:row-span-4 md:mb-10');
  });
  it('calendário: a legenda também segue a largura do calendário', () => {
    const cal = read('client/src/components/booking/AvailabilityCalendar.tsx');
    expect(cal).toContain('<div className="@container bg-white">');
    expect(cal).toContain('gap-x-5 @max-[21rem]:gap-x-3');
    expect(cal.match(/tracking-wide @max-\[21rem\]:tracking-normal/g)).toHaveLength(3);
  });
  it('tarifas: data do pagamento em duas partes inteira, a 12 px', () => {
    expect(read('client/src/components/booking/TwoPartsHint.tsx')).toContain('const date = noBreak(planDate(data.chargeAt, lang));');
    expect(read('client/src/components/booking/RatePlanCards.tsx')).toContain('className="text-[12px] text-pa-dark leading-snug border-t border-pa-sand pt-2"');
  });
  it('telefone do formulário dos parceiros com a altura e a borda dos outros campos', () => {
    expect(read('client/src/components/booking/PartnerBookingPanel.tsx')).toMatch(/placeholder=\{t\('partnerBooking\.phone', 'Phone number'\)\}\s*compact/);
  });
});
