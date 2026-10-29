import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * O cartão de reserva fixo do computador (PropertyDetail): a parte que rola e
 * o rodapé onde vive o RESERVE (ver lib/bookingCardReveal.ts e index.css,
 * .property-sticky-card). Só existe no cartão do computador; na gaveta do
 * telemóvel, no servidor e no primeiro render do cliente é null e tudo fica
 * no sítio de sempre.
 */
export interface BookingCardSlot {
  /** A parte do cartão que rola (.pa-booking-scroll). */
  scroller: HTMLElement;
  /** O rodapé fixo do cartão (.pa-booking-footer). */
  footer: HTMLElement;
}

export const BookingCardSlotContext = createContext<BookingCardSlot | null>(null);

export function useBookingCardSlot(): BookingCardSlot | null {
  return useContext(BookingCardSlotContext);
}

/**
 * O bloco do RESERVE: no cartão do computador vai para o rodapé fixo (portal);
 * no resto (gaveta do telemóvel, servidor) fica onde sempre esteve.
 */
export function ReserveCtaSlot({ children }: { children: ReactNode }) {
  const slot = useBookingCardSlot();
  return slot ? createPortal(children, slot.footer) : <>{children}</>;
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
