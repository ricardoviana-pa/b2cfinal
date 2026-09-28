/** Named accommodation photographs are examples, not panoramic destination views. */
export function destinationAccommodationCaption(
  slug: string,
  language: string
): string | undefined {
  const name =
    slug === "caminha"
      ? "Historic Riverfront Watermill, Caminha"
      : slug === "douro"
        ? "Quinta da Lameirinha, Douro"
        : undefined;
  if (!name) return undefined;
  const labels: Record<string, string> = {
    en: "An accommodation photograph.",
    pt: "Fotografia de um alojamento.",
    de: "Foto einer Unterkunft.",
    es: "Fotografía de un alojamiento.",
    fi: "Majoituskohteen valokuva.",
    fr: "Photographie d’un hébergement.",
    it: "Fotografia di un alloggio.",
    nl: "Foto van een accommodatie.",
    sv: "Foto av ett boende.",
  };
  return `${name}. ${labels[language.split("-")[0]] || labels.en}`;
}
