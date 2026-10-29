/**
 * Formatadores do i18next para o artigo italiano antes de uma data.
 *
 * O it.json escreve "{{date, il}}" em vez de "il {{date}}": o i18next passa
 * a data por itArt (shared/italianDates.ts, a mesma regra dos emails e do
 * mandato) e sai "il 15 novembre", "l'11 novembre", "l'8 dicembre". Há um
 * por artigo (il, al, dal, del) e uma versão para o início de frase com
 * "_cap" ("{{date, il_cap}}" → "Il 15 novembre", "L'11 novembre").
 * Quem chama o t() não muda: continua a passar `date` (ou `checkIn`...).
 *
 * Tem de ser registado em todas as instâncias do i18next que leem o it.json:
 * a do browser (./index.ts) e a de cada pedido no servidor (entry-server.tsx).
 * Sem ele o i18next devolve a data sem artigo.
 */
import type { i18n as I18n } from "i18next";
import { IT_ELIDED, itArt, type ItalianDateArticle } from "@shared/italianDates";

/** Nomes dos formatadores, para o teste e para quem escreve o it.json. */
export const ITALIAN_DATE_FORMATS: readonly string[] = (Object.keys(IT_ELIDED) as ItalianDateArticle[])
  .flatMap((prep) => [prep, `${prep}_cap`]);

/** Só datas em texto; outro valor (em falta, número) passa como veio. */
const withArticle = (prep: ItalianDateArticle, cap: boolean) => (value: unknown) =>
  (typeof value === "string" && value ? itArt(prep, value, cap) : value) as string;

export function addItalianDateFormats(i18n: Pick<I18n, "services">): void {
  const formatter = i18n.services.formatter;
  if (!formatter) return;
  for (const prep of Object.keys(IT_ELIDED) as ItalianDateArticle[]) {
    formatter.add(prep, withArticle(prep, false));
    formatter.add(`${prep}_cap`, withArticle(prep, true));
  }
}
