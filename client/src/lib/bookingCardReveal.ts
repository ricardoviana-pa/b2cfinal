/**
 * Cartão de reserva do computador (página da casa, a partir de 1024 px).
 *
 * O cartão fixo tem a altura do ecrã e duas partes (index.css,
 * .property-sticky-card): por cima, o que rola (.pa-booking-scroll: preço,
 * datas, hóspedes, tarifas e o resto do painel); por baixo, um rodapé que
 * nunca rola, com o RESERVE, as marcas de pagamento e "ainda não é cobrado"
 * (ou, nas casas parceiras, o "Pedir estas datas"). Nada rola por baixo do
 * rodapé, por isso o botão não tapa nada e nada o tapa a ele. No HTML o
 * rodapé fica logo a seguir às tarifas (ReserveCtaSlot): é essa a ordem do
 * Tab e do leitor de ecrã.
 *
 * O que falta é escolher o que se vê na parte que rola quando chega a
 * cotação, muda a tarifa, aparece um aviso ou o RESERVE recebe o foco do
 * teclado: a tarifa escolhida (rádio, nome e preço) ou o aviso tem de ficar à
 * vista junto do RESERVE. Rola-se só o cartão, nunca a página (auditoria de
 * 29 out 2026, W3 e P3; revisão do PR #179, PDP-STICKY-KBD-1).
 */

export type RevealAnchor = 'start' | 'end';

export interface RevealInput {
  /** scrollTop atual do contentor que rola. */
  scrollTop: number;
  /** O máximo do scrollTop (scrollHeight − clientHeight). */
  maxScrollTop: number;
  /** Topo e fundo da área visível do contentor, em coordenadas do ecrã. */
  viewTop: number;
  viewBottom: number;
  /** Topo e fundo do que tem de ficar à vista, em coordenadas do ecrã. */
  top: number;
  bottom: number;
  /** Folga entre o conteúdo e as margens da área visível (px). */
  pad?: number;
  /**
   * Quando não cabe tudo: 'start' guarda o topo (a tarifa escolhida),
   * 'end' guarda o fundo (o aviso, a linha do total).
   */
  anchor?: RevealAnchor;
}

/** Folga por omissão: um pouco de ar entre a tarifa e o rodapé do RESERVE. */
export const REVEAL_PAD = 12;

/**
 * O scrollTop que põe [top, bottom] à vista com o mínimo de movimento
 * (como scrollIntoView({ block: 'nearest' }), mas só neste contentor):
 * - já à vista: não mexe;
 * - abaixo: sobe o conteúdo até o fundo ficar à vista;
 * - acima: desce até o topo ficar à vista;
 * - maior do que a área visível: alinha a ponta pedida em `anchor`.
 * O resultado fica sempre entre 0 e maxScrollTop, em píxeis inteiros
 * (arredondados para o lado que guarda a folga).
 */
export function revealScrollTop({
  scrollTop, maxScrollTop, viewTop, viewBottom, top, bottom, pad = REVEAL_PAD, anchor = 'start',
}: RevealInput): number {
  const room = viewBottom - viewTop - 2 * pad;
  let delta = 0;
  if (bottom - top > room) {
    delta = anchor === 'start' ? top - (viewTop + pad) : bottom - (viewBottom - pad);
  } else if (bottom > viewBottom - pad) {
    delta = bottom - (viewBottom - pad);
  } else if (top < viewTop + pad) {
    delta = top - (viewTop + pad);
  }
  // Arredonda para o lado que deixa a folga inteira (nunca meio píxel a menos).
  const next = delta > 0 ? Math.ceil(scrollTop + delta) : Math.floor(scrollTop + delta);
  return Math.min(Math.max(next, 0), Math.max(0, Math.floor(maxScrollTop)));
}

export interface ScreenRange { top: number; bottom: number }

/** Do topo de `first` ao fundo de `last` (por omissão, o próprio `first`). */
export function rangeOf(first: Element, last: Element = first): ScreenRange {
  return { top: first.getBoundingClientRect().top, bottom: last.getBoundingClientRect().bottom };
}

/**
 * O rodapé do cartão (o RESERVE) está inteiro no ecrã? Um rodapé vazio
 * (escondido, altura 0) conta como sim: não há botão por que esperar.
 */
export function footerOnScreen(rect: { top: number; bottom: number; height: number }, viewportHeight: number): boolean {
  if (rect.height <= 0) return true;
  return rect.top >= 0 && rect.bottom <= viewportHeight + 1;
}

/**
 * Põe o intervalo à vista no contentor e mantém-no à vista quando o contentor
 * ou o conteúdo mudam de tamanho (o banner dos cookies aparece 2 s depois e
 * encolhe o cartão; a linha das duas partes chega depois da cotação; a janela
 * muda de tamanho) — até o hóspede mexer no cartão (roda, toque, teclado,
 * clique): a partir daí não se luta com ele.
 *
 * `ready`: só se mexe quando o RESERVE está no ecrã. No topo da página o
 * cartão ainda não está fixo e o rodapé fica abaixo da dobra: o cartão mostra
 * o preço e as datas, como sempre; quando o hóspede desce e o RESERVE aparece,
 * o cartão rola (suave) até à tarifa.
 *
 * `focusWithin`: o rodapé. Quando o RESERVE recebe o foco pelo teclado (Tab,
 * Shift+Tab), a tarifa escolhida ou o aviso voltam à vista, mesmo depois de o
 * hóspede ter mexido no cartão: é o que o botão vai reservar ou pedir. Um
 * clique (foco sem :focus-visible) não mexe em nada. Devolve a limpeza.
 */
export function keepRevealed(
  scroller: HTMLElement,
  range: () => ScreenRange | null,
  { pad = REVEAL_PAD, anchor = 'start', watch = [], ready = () => true, focusWithin = null }: {
    pad?: number; anchor?: RevealAnchor; watch?: Element[]; ready?: () => boolean; focusWithin?: Element | null;
  } = {},
): () => void {
  let guestTookOver = false;
  let waiting = false;
  let frame = 0;
  const apply = (behavior: ScrollBehavior = 'instant', force = false) => {
    if ((guestTookOver && !force) || !scroller.isConnected) return;
    if (!ready()) { if (!force) waitForReady(); return; }
    stopWaiting();
    const target = range();
    if (!target) return;
    const box = scroller.getBoundingClientRect();
    const viewTop = box.top + scroller.clientTop;
    const next = revealScrollTop({
      scrollTop: scroller.scrollTop,
      maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
      viewTop,
      viewBottom: viewTop + scroller.clientHeight,
      top: target.top,
      bottom: target.bottom,
      pad,
      anchor,
    });
    if (Math.abs(next - scroller.scrollTop) < 1) return;
    if (behavior === 'smooth') scroller.scrollTo({ top: next, behavior });
    else scroller.scrollTop = next;
  };
  const onPageMove = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; if (ready()) apply('smooth'); });
  };
  function waitForReady() {
    if (waiting) return;
    waiting = true;
    window.addEventListener('scroll', onPageMove, { passive: true });
    window.addEventListener('resize', onPageMove);
  }
  function stopWaiting() {
    if (!waiting) return;
    waiting = false;
    window.removeEventListener('scroll', onPageMove);
    window.removeEventListener('resize', onPageMove);
  }
  apply();

  const tookOver = () => { guestTookOver = true; stopWaiting(); };
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
  for (const name of events) scroller.addEventListener(name, tookOver, { passive: true });
  const onFocusIn = (e: Event) => {
    if (revealOnFocus(e.target)) apply('instant', true);
  };
  focusWithin?.addEventListener('focusin', onFocusIn);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => apply());
  observer?.observe(scroller);
  for (const el of watch) observer?.observe(el);
  return () => {
    observer?.disconnect();
    stopWaiting();
    if (frame) cancelAnimationFrame(frame);
    for (const name of events) scroller.removeEventListener(name, tookOver);
    focusWithin?.removeEventListener('focusin', onFocusIn);
  };
}

/**
 * O foco chegou pelo teclado? Só então o cartão volta a mostrar a tarifa ou o
 * aviso quando o RESERVE recebe o foco: num clique o botão age logo e não se
 * mexe em nada. Sem suporte de :focus-visible, conta como teclado.
 */
export function revealOnFocus(target: EventTarget | null): boolean {
  const el = target as { matches?: (selector: string) => boolean } | null;
  if (!el || typeof el.matches !== 'function') return false;
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

/**
 * `ready` para keepRevealed: o rodapé do cartão está no ecrã. Sem rodapé
 * (sem RESERVE, por exemplo sem preço) não há botão por que esperar.
 */
export function whenFooterOnScreen(footer: () => HTMLElement | null): () => boolean {
  return () => {
    const el = footer();
    return !el || footerOnScreen(el.getBoundingClientRect(), window.innerHeight);
  };
}
