import data from "./destination-editorial.json";
import sources from "./destination-editorial-sources.json";

export type EditorialText = [string, string];
export type EditorialMoment = {
  title: EditorialText;
  place: EditorialText;
  text: EditorialText;
  plan: EditorialText;
  source: string;
};
export interface DestinationEditorial {
  name: EditorialText;
  line: EditorialText;
  intro: EditorialText;
  orientation: EditorialText;
  fit: EditorialText;
  airport: EditorialText;
  mobility: EditorialText;
  point: [number, number];
  photo: { src: string; caption: EditorialText };
  moments: EditorialMoment[];
  bases: {
    name: string;
    tag: EditorialText;
    text: EditorialText;
    transport: EditorialText;
  }[];
  routes: {
    id: string;
    label: EditorialText;
    intro: EditorialText;
    days: { place: EditorialText; title: EditorialText; text: EditorialText }[];
  }[];
  taste: EditorialText;
  tables: {
    name: string;
    place: EditorialText;
    text: EditorialText;
    source: string;
  }[];
  culture: {
    title: EditorialText;
    place: EditorialText;
    text: EditorialText;
    source: string;
  }[];
  seasons: EditorialText[];
  homes: EditorialText;
  faqs: { question: EditorialText; answer: EditorialText }[];
  seo: EditorialText;
}

export const editorialGuides = data as unknown as Record<
  string,
  DestinationEditorial
>;
export const editorialSources = sources as Record<
  string,
  { label: string; url: string }
>;
export function getDestinationEditorial(slug: string, language: string) {
  return ["pt", "en"].includes(language.split("-")[0])
    ? editorialGuides[slug]
    : undefined;
}
export function editorialText(text: EditorialText, language: string): string {
  return text[language.split("-")[0] === "pt" ? 0 : 1];
}
