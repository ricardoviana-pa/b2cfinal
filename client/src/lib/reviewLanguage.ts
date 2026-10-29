/**
 * "Written in French" next to a homepage review that is not in the page
 * language (auditoria 29 out, ux-home-plp-07). The language name comes from
 * Intl in the page language ("francês", "Französisch"), so no list of
 * language names has to be kept in nine locale files.
 */
import type { TFunction } from 'i18next';

export function languageName(code: string, inLanguage: string): string {
  try {
    const name = new Intl.DisplayNames([inLanguage], { type: 'language' }).of(code);
    return name && name.toLowerCase() !== code.toLowerCase() ? name : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function reviewLanguageLabel(t: TFunction, pageLang: string, reviewLang: string): string {
  return t('reviewLanguage.writtenIn', { language: languageName(reviewLang, pageLang), defaultValue: 'Written in {{language}}' });
}
