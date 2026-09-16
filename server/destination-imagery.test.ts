import { describe, expect, it } from 'vitest';
import { withoutRepeatedImages } from '../client/src/lib/destinationImagery';
import { cdnResize, cdnSrcSet } from '../client/src/lib/images';

describe('destination editorial links', () => {
  it('preserves guide links and order when a photo also appears in the hero or another card', () => {
    const articles = [
      { slug: 'city-guide', coverImage: 'https://images.unsplash.com/city?w=1200' },
      { slug: 'seasons', coverImage: '/coast.webp' },
      { slug: 'surf', coverImage: '/coast.webp' },
    ];
    const curated = withoutRepeatedImages(articles, ['https://images.unsplash.com/city?w=1600']);
    expect(curated.map(a => a.slug)).toEqual(articles.map(a => a.slug));
    expect(curated.map(a => a.coverImage)).toEqual([undefined, '/coast.webp', undefined]);
    expect(articles[0].coverImage).toContain('city?w=1200');
  });
  it('recognises Guesty resize variants and applies the limit to articles, not unique photos', () => {
    const source = 'https://assets.guesty.com/image/upload/photo.jpg';
    const articles = [{slug:'first',coverImage:source},{slug:'second',coverImage:'/two.webp'}];
    expect(withoutRepeatedImages(articles, [cdnResize(source, 900)], 1)).toEqual([{slug:'first',coverImage:undefined}]);
  });
});

describe('responsive Unsplash images', () => {
  it('downloads the requested width while retaining the crop and attribution', () => {
    const source = 'https://images.unsplash.com/photo-1?w=1600&q=80&fit=crop&ixid=author';
    const resized = new URL(cdnResize(source, 400));
    expect(resized.searchParams.get('w')).toBe('400');
    expect(resized.searchParams.get('auto')).toBe('format');
    expect(resized.searchParams.get('fit')).toBe('crop');
    expect(resized.searchParams.get('ixid')).toBe('author');
    expect(cdnSrcSet(source, [400, 800])).toContain(' 400w, ');
    expect(cdnSrcSet(source, [400, 800])).toContain('w=800');
  });
  it('leaves local files and unrelated hosts unchanged', () => {
    for (const url of ['/destinations/minho-coast.webp','https://example.com/images.unsplash.com/a.jpg']) {
      expect(cdnResize(url, 400)).toBe(url);
      expect(cdnSrcSet(url, [400])).toBe('');
    }
  });
});
