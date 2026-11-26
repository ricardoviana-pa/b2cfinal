/**
 * Para onde vão os alertas dos folios do Guesty: "FOLIO(S) DO GUESTY A
 * VERIFICAR" (services/folio-guard.ts) e "ACERTAR TARIFA NO GUESTY" (settle do
 * checkout). É o CS que faz o acerto, por isso vão para a caixa do booking e
 * sem cópia à gestão (Ricardo, 26 nov 2026). FOLIO_ALERT_EMAIL muda o destino.
 */
export const FOLIO_ALERT_EMAIL = process.env.FOLIO_ALERT_EMAIL || "booking@portugalactive.com";
