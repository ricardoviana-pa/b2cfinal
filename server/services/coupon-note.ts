/**
 * Linha "Cupao: CODIGO" para a nota da reserva no Guesty.
 *
 * Até nov 2026 o reservations-v3 era criado sem o cupão e a reserva chegava
 * ao Guesty sem rasto da campanha de email que a trouxe. Desde então o settle
 * do cartão manda o código que a quote do Guesty prova aplicado, mas esta
 * linha continua a ser a que o marketing lê. O marketing atribui a reserva à
 * campanha por esta linha (pa-marketing, b-crm/jobs/campaign_bookings.py,
 * que procura o código nas notas). Vazio quando não houve código.
 */
export function couponNoteLine(quote: unknown): string {
  const raw = (quote as any)?.couponCode;
  if (raw == null) return "";
  const code = String(raw)
    .replace(/[^\p{L}\p{N} %._-]/gu, "")
    .trim()
    .slice(0, 60)
    .toUpperCase();
  return code ? `Cupao: ${code} (codigo promocional usado no site)` : "";
}
