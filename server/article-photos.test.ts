import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import ArticleBody from '../client/src/components/blog/ArticleBody';
import { articlePhotos, parsePhotoBlock, stripPhotoLines } from '../shared/articlePhotos';

const SRC = 'https://assets.guesty.com/image/upload/v1/production/abc/photo.jpg';
const body = `Intro paragraph.\n\n![Piscina com vista mar](${SRC})\n[Beach Farm](/homes/beach-farm-83ef5f), Viana do Castelo\n\n## Next`;

describe('photos inside Journal articles', () => {
  it('parses a photo block with its caption', () => {
    expect(parsePhotoBlock(`![Alt](${SRC})\nCaption`)).toEqual({ alt: 'Alt', src: SRC, caption: 'Caption' });
    expect(parsePhotoBlock('Just text')).toBeNull();
    expect(articlePhotos(body).map((p) => p.src)).toEqual([SRC]);
  });

  it('renders a lazy, sized, resized figure with a linked caption', () => {
    const html = renderToStaticMarkup(React.createElement(Router, { base: '/pt', ssrPath: '/pt/blog' }, React.createElement(ArticleBody, { content: body })));
    expect(html).toContain('<figure');
    expect(html).toContain('alt="Piscina com vista mar"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="1200"');
    expect(html).toContain('/image/upload/w_1280,q_auto,f_auto/');
    expect(html).toMatch(/<figcaption[^>]*>.*href="\/pt\/homes\/beach-farm-83ef5f".*Viana do Castelo<\/figcaption>/);
    expect(html).not.toContain('![');
  });

  it('keeps photo markdown out of plain-text renderings', () => {
    expect(stripPhotoLines(body)).not.toContain('![');
    expect(stripPhotoLines(body)).toContain('Viana do Castelo');
  });
});
