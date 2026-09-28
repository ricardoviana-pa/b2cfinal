/** Only non-personal planning fields cross editorial links. An incomplete or
 * invalid date pair is dropped; a catalogue page never implies availability. */
export function editorialTripContext(search: string) {
  const params = new URLSearchParams(search);
  const validDate = (value: string | null): value is string =>
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  const start = params.get("checkin");
  const end = params.get("checkout");
  const dates =
    validDate(start) && validDate(end) && end > start
      ? { checkin: start, checkout: end }
      : {};
  const count = params.get("guests");
  const guests =
    count &&
    /^\d{1,3}$/.test(count) &&
    Number(count) >= 1 &&
    Number(count) <= 100
      ? Number(count)
      : undefined;
  return { ...dates, guests };
}

export function withEditorialTrip(href: string, search: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const context = editorialTripContext(search);
  const [path, hash] = href.split("#", 2);
  const [pathname, existing] = path.split("?", 2);
  const params = new URLSearchParams(existing);
  if (context.checkin && context.checkout) {
    params.set("checkin", context.checkin);
    params.set("checkout", context.checkout);
  }
  if (context.guests) params.set("guests", String(context.guests));
  return (
    pathname + (params.size ? `?${params}` : "") + (hash ? `#${hash}` : "")
  );
}

/** Cards also retain a one-person trip and guest counts before dates are chosen. */
export function propertyTripHref(
  slug: string,
  trip: { checkin?: string; checkout?: string; guests?: number }
) {
  const query = new URLSearchParams();
  if (trip.checkin) query.set("checkin", trip.checkin);
  if (trip.checkout) query.set("checkout", trip.checkout);
  if (trip.guests !== undefined) query.set("guests", String(trip.guests));
  return withEditorialTrip(`/homes/${slug}`, query.toString());
}
