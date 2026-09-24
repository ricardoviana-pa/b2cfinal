/** Journal photo blocks. A paragraph whose first line is a markdown image
 *  becomes a figure; the lines after it are the caption (inline markdown, so
 *  it can link to the home):
 *
 *    ![Pool of Beach Farm at sunset](https://assets.guesty.com/...)
 *    [Beach Farm](/homes/beach-farm-...), Viana do Castelo
 *
 *  Only real photos of our homes go here (house rule: no AI or stock). */
export const PHOTO_LINE = /^!\[([^\]]*)\]\((\S+?)\)\s*$/;

export type ArticlePhoto = { alt: string; src: string; caption: string };

export function parsePhotoBlock(block: string): ArticlePhoto | null {
  const lines = block.trim().split('\n');
  const m = lines[0]?.match(PHOTO_LINE);
  if (!m) return null;
  return { alt: m[1].trim(), src: m[2], caption: lines.slice(1).join(' ').trim() };
}

/** Every photo in an article body, in order (for structured data). */
export function articlePhotos(content: string | undefined | null): ArticlePhoto[] {
  if (!content) return [];
  return content.split(/\n\s*\n/).map(parsePhotoBlock).filter((p): p is ArticlePhoto => !!p);
}

/** Body text without photo lines, for plain-text renderings. */
export function stripPhotoLines(content: string): string {
  return content.split('\n').filter((line) => !PHOTO_LINE.test(line.trim())).join('\n');
}
