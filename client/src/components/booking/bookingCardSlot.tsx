import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * O cartão de reserva fixo do computador (PropertyDetail): o cartão e a parte
 * que rola (ver lib/bookingCardReveal.ts e index.css, .property-sticky-card).
 * Só existe no cartão do computador; na gaveta do telemóvel, no servidor e no
 * primeiro render do cliente é null e tudo fica como sempre.
 */
export interface BookingCardSlot {
  /** O cartão fixo (.property-sticky-card): o rodapé do RESERVE assenta no fundo dele. */
  card: HTMLElement;
  /** A parte do cartão que rola (.pa-booking-scroll). */
  scroller: HTMLElement;
}

export const BookingCardSlotContext = createContext<BookingCardSlot | null>(null);

export function useBookingCardSlot(): BookingCardSlot | null {
  return useContext(BookingCardSlotContext);
}

/**
 * A altura do rodapé, publicada em <html> enquanto ele está no cartão (index.css):
 * o espaço que o cartão lhe guarda em baixo, e quanto o "voltar ao topo" (App.tsx,
 * [data-back-to-top]) sobe para não ficar por cima do RESERVE.
 */
export const BOOKING_FOOTER_HEIGHT_VAR = '--pa-booking-footer-h';

/**
 * O bloco do RESERVE (ou o "Pedir estas datas" das casas parceiras).
 *
 * No cartão do computador fica no sítio dele no HTML, logo a seguir às
 * tarifas (ou aos campos do pedido): é por essa ordem que o Tab e o leitor de
 * ecrã chegam ao botão (revisão do PR #179, PDP-STICKY-KBD-1). O CSS
 * (.pa-booking-footer, index.css) é que o prende ao fundo do cartão, fora da
 * parte que rola, e o cartão guarda-lhe essa altura em baixo: não tapa nada,
 * nada passa por baixo dele, e a roda nunca o leva.
 *
 * Fora do cartão (gaveta do telemóvel, servidor, primeiro render) fica tal e
 * qual, sem invólucro.
 */
export function ReserveCtaSlot({ children, footerRef }: { children: ReactNode; footerRef?: RefObject<HTMLDivElement | null> }) {
  const slot = useBookingCardSlot();
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = footerRef ?? ownRef;
  const inCard = !!slot;
  useLayoutEffect(() => {
    const footer = ref.current;
    if (!inCard || !footer) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(BOOKING_FOOTER_HEIGHT_VAR, `${footer.getBoundingClientRect().height}px`);
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(footer);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(BOOKING_FOOTER_HEIGHT_VAR);
    };
  }, [inCard, ref]);
  if (!slot) return <>{children}</>;
  return (
    <div ref={ref} className="pa-booking-footer space-y-3 border border-black/10 bg-white px-5 py-3 shadow-sm">
      {children}
    </div>
  );
}

/**
 * Quantas vezes o hóspede usou o RESERVE do cabeçalho (pa:reserve,
 * Header.tsx) enquanto `active`: o painel volta a mostrar a tarifa escolhida
 * (ou o aviso) junto do RESERVE do rodapé.
 */
export function useHeaderReserveCount(active: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    const onReserve = () => setCount((n) => n + 1);
    window.addEventListener('pa:reserve', onReserve);
    return () => window.removeEventListener('pa:reserve', onReserve);
  }, [active]);
  return count;
}
