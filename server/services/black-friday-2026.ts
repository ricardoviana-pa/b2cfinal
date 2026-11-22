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
  return day >= "2026-11-24" && day <= "2026-11-30"
    ? BLACK_FRIDAY_2026_GENERAL_CODE : null;
}

/** VIP access starts a day before the public campaign (23 Nov, Lisbon time). */
export function blackFridayVipActive(at: Date = new Date()): boolean {
  if (!Number.isFinite(at.getTime())) return false;
  // Use explicit parts instead of relying on locale-specific date ordering.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(at);
  const read = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const ymd = `${read("year")}-${read("month")}-${read("day")}`;
  return ymd >= "2026-11-23" && ymd <= "2026-11-30";
}


/**
 * Old Guesty quotes may have accepted a Black Friday code before the website
 * started enforcing campaign dates. The payment/checkout server must not
 * trust those still-valid supplier quotes for an early booking.
 *
 * Guesty sometimes exposes the internal coupon *name*, not the typed code.
 * Match the two stable codes and their explicit Black Friday campaign labels.
 * An unidentified coupon is left alone (e.g. the unrelated recovery 5%).
 */
export function blockedBlackFridayCoupon(
  values: readonly unknown[],
  at: Date = new Date(),
): boolean {
  const labels = values
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const today = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(at);
  const part = (t: string): string => today.find((p) => p.type === t)?.value ?? "";
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  const vipAllowed = day >= "2026-11-23" && day <= "2026-11-30";
  const publicAllowed = day >= "2026-11-24" && day <= "2026-11-30";

  for (const label of labels) {
    const vip = /PABF15VIP26/.test(label) || /BLACK[\s_-]*FRIDAY.{0,40}\bVIP\b/.test(label);
    // Ambiguous "Black Friday 2026" labels are treated as public (23–30),
    // not as an early VIP voucher.
    const publicCode = /PABF15GERAL26/.test(label) ||
      (/BLACK[\s_-]*FRIDAY/.test(label) && !vip);
    if ((vip && !vipAllowed) || (publicCode && !publicAllowed)) return true;
  }
  return false;
}
