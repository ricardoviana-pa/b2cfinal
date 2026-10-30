/**
 * O preço "desde" de uma casa pode mudar fora de qualquer pedido: o job
 * guarda o calendário de uma casa parceira (services/tripwix-calendar.ts),
 * ou lê-o da BD depois do arranque. Quem serviu uma página SEM esse preço
 * fica a saber aqui — server/_core/vite.ts deita fora a página que tinha em
 * cache (revisão do PR #190: a página de uma casa parceira servida antes de
 * o job ler o calendário ficava 5 min em cache a dizer "Price on request"
 * depois de o preço existir).
 *
 * Um registo mínimo e sem dependências, para não haver ciclos: o serviço e
 * o servidor importam só este ficheiro.
 */
type Listener = (listingId: string) => void;

const listeners = new Set<Listener>();

/** A fonte do preço desta casa (uid parceiro, ou id Guesty) mudou. Um
 *  ouvinte que falhe não trava os outros nem o job que avisou. */
export function notifyListingPriceChanged(listingId: string): void {
  for (const listener of listeners) {
    try {
      listener(listingId);
    } catch (err) {
      console.warn("[preços] ouvinte falhou:", (err as Error)?.message ?? err);
    }
  }
}

/** Regista um ouvinte; devolve a função que o retira. */
export function onListingPriceChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
