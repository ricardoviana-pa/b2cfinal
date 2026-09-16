/** Only these hosts may load customer-facing payment and measurement services. */
export function isLiveSiteHostname(hostname: string): boolean {
  return ["www.portugalactive.com", "portugalactive.com"].includes(hostname.toLowerCase());
}
