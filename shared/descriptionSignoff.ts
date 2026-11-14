/**
 * The older listings closed with a booking call and a slogan ("Book your stay.
 * Portugal Active, your private hotel."), and the translations carried both
 * into eight languages. The product is a villa or a home, never a "private
 * hotel" (Ricardo, 22 Oct 2026), so the sign-off leaves every description:
 * the store and the Guesty sync strip the English one, and the translation
 * files were cleaned once with this same function (auditoria 14 nov 2026).
 */

/** "private hotel" as the nine site languages wrote it. */
const HOTEL =
  '(?:private hotel|hotel privado|h[oô]tel priv[ée]|privates hotel|hotel privato|priv[ée]hotel|privata hotell|yksityinen hotelli\\p{L}*)';

/** "Portugal Active, your private hotel." — comma or dash, any possessive. */
const SLOGAN = `Portugal Active\\s*[,–—-]\\s*[^.\\n]{0,40}?${HOTEL}\\.?`;

/** The booking call that sits right before the slogan ("Book your stay today."). */
const CALL =
  '(?:Book your stay|Reserve (?:já )?a sua estadi?a|Reserve su estancia|Réservez votre séjour' +
  '|Buchen Sie (?:noch heute )?Ihren Aufenthalt|Prenotate il vostro soggiorno|Prenota il tuo soggiorno' +
  '|Boek (?:vandaag nog )?uw verblijf|Boka din vistelse|Varaa (?:oleskelusi|lomasi))[^.!\\n]{0,24}[.!]?';

const SIGNOFF = new RegExp(`[ \\t]*(?:${CALL}\\s*)?${SLOGAN}`, 'giu');

/** True when the text still carries the slogan, in any site language. */
export function hasBrandSignoff(text: unknown): boolean {
  return typeof text === 'string' && new RegExp(SLOGAN, 'iu').test(text);
}

/** The description without the sign-off; everything else is left as written. */
export function stripBrandSignoff(text: string): string {
  if (typeof text !== 'string' || !/Portugal Active/i.test(text)) return text;
  const out = text.replace(SIGNOFF, '');
  if (out === text) return text;
  // The sign-off was its own closing paragraph: drop the blank lines it leaves.
  return out.replace(/[ \t]+(\r?\n)/g, '$1').replace(/(\r?\n){3,}/g, '$1$1').trimEnd();
}
