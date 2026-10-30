/**
 * Identidade legal da empresa que opera a Portugal Active: uma só fonte para
 * o bloco pré-contratual do checkout (DL 24/2014, arts. 4.º e 5.º), a linha
 * legal do rodapé do site e o rodapé dos emails transacionais.
 *
 * A marca continua a ser "Portugal Active" (nome do negócio na Stripe, nos
 * emails e no site); a denominação social só aparece onde a lei a pede.
 * A sede fica vazia até o Ricardo a confirmar: enquanto estiver vazia, a
 * linha da morada não se mostra em lado nenhum (nunca um placeholder).
 */
export const COMPANY_LEGAL_NAME = "Ricardo Torres Viana LDA";
export const COMPANY_NIPC = "515363685";
/** Sede (morada completa numa linha). Vazia até confirmação do Ricardo. */
export const COMPANY_ADDRESS = "";

/** "Ricardo Torres Viana LDA · NIPC 515363685" (sem morada). */
export function companyIdentityLine(): string {
  return `${COMPANY_LEGAL_NAME} · NIPC ${COMPANY_NIPC}`;
}

/** A sede, ou null enquanto não estiver confirmada (não se renderiza nada). */
export function companyAddressLine(): string | null {
  const address = COMPANY_ADDRESS.trim();
  return address ? address : null;
}

/** Identidade e sede numa linha, para rodapés: só junta a morada se existir. */
export function companyLegalLine(): string {
  const address = companyAddressLine();
  return address ? `${companyIdentityLine()} · ${address}` : companyIdentityLine();
}
