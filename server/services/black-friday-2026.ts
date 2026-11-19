/**
 * Black Friday 2026 — desconto público de 15% em reservas diretas.
 *
 * A data refere-se ao momento da RESERVA, não ao check-in. O relógio é o de
 * Lisboa, inclusive a 30/11 até às 23:59:59. O interruptor evita qualquer
 * desconto antes de confirmar que o cupão existe no Guesty e foi testado.
 *
 * No Render: BLACK_FRIDAY_2026_AUTO_COUPON=true
 * Kill switch imediato: BLACK_FRIDAY_2026_AUTO_COUPON=false
 */
export const BLACK_FRIDAY_2026_GENERAL_CODE = "PABF15GERAL26";
export const BLACK_FRIDAY_2026_VIP_CODE = "PABF15VIP26";

export function blackFridayPublicCoupon(
  at: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.BLACK_FRIDAY_2026_AUTO_COUPON !== "true") return null;
  if (!Number.isFinite(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(at);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  return day >= "2026-11-23" && day <= "2026-11-30"
    ? BLACK_FRIDAY_2026_GENERAL_CODE : null;
}
