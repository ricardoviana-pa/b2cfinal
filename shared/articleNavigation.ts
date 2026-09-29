export function articleHeadings(content: string) {
  const used = new Map<string, number>();
  return content.split(/\n\s*\n/).flatMap((block, index) => {
    const match = block.trim().match(/^(#{2,3})\s+(.+)$/);
    if (!match) return [];
    const title = match[2].replace(/\*\*/g, "");
    const base =
      title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "section";
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return [
      { index, title, id: `guide-${base}${count > 1 ? `-${count}` : ""}` },
    ];
  });
}

export function reviewedArticleDate(
  article: {
    modifiedDate?: string;
    updatedLocales?: string[];
    publishDate?: string;
  },
  language: string
) {
  return article.modifiedDate &&
    (!article.updatedLocales ||
      article.updatedLocales.includes(language.split("-")[0]))
    ? article.modifiedDate
    : undefined;
}
