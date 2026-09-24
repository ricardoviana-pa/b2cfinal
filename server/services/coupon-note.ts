/**
 * Linha "Cupao: CODIGO" para a nota da reserva no Guesty.
 *
 * O reservations-v3 é criado sem o cupão (applyPromotions: false) e o Guesty
 * não guarda o código que o hóspede escreveu no site: a reserva chega sem
 * rasto da campanha de email que a trouxe. O marketing atribui a reserva à
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
