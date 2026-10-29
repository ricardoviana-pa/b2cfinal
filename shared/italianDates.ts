/**
 * Italiano: artigo (só ou com preposição) antes de uma data em algarismos.
 *
 * O artigo segue a forma como o número se lê: "il 15 luglio", mas
 * "l'8 luglio" (otto) e "l'11 luglio" (undici), e o mesmo com al, dal e del
 * ("all'8", "dall'11", "dell'8"). O dia 1 lê-se "primo" e fica "il 1 luglio"
 * (nunca "l'1"). Um dia com zero à esquerda, como o de formatBookingDate
 * ("08 nov"), lê-se da mesma maneira: "dall'08 nov".
 *
 * Partilhado pelos dois lados para dizerem o mesmo: o servidor usa-o nos
 * emails e no mandato das duas partes; o browser, nos formatadores do i18next
 * que o it.json usa (client/src/i18n/italianDateFormats.ts, "{{date, il}}").
 */

/** Forma elidida de cada artigo, antes de 8 e de 11. */
export const IT_ELIDED = { il: "l'", al: "all'", dal: "dall'", del: "dell'" } as const;

export type ItalianDateArticle = keyof typeof IT_ELIDED;

/** O dia com que a data começa lê-se com vogal (8, 11, também 08)? */
export function italianDayTakesElision(date: string): boolean {
  return /^0?(8|11)\b/.test(date);
}

/**
 * Artigo + data: "il 15 luglio", "l'8 luglio", "dall'11 luglio".
 * `cap` = início de frase ("Il 15 luglio", "L'11 luglio").
 */
export function itArt(prep: ItalianDateArticle, date: string, cap = false): string {
  const s = italianDayTakesElision(date) ? `${IT_ELIDED[prep]}${date}` : `${prep} ${date}`;
  return cap ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
