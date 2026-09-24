import React from 'react';
import { Link } from 'wouter';
import { parsePhotoBlock } from '@shared/articlePhotos';
import { cdnSrcSet, cdnVariant } from '@/lib/images';

export function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const key = match.index;
    if (match[1]) {
      parts.push(<strong key={key} className="text-[#1A1A18] font-semibold">{renderInline(match[1])}</strong>);
    } else {
      const href = match[3].replace(/^\/(en|pt|fr|es|it|fi|de|nl|sv)(?=\/)/, '');
      const className = 'text-pa-gold-aa underline underline-offset-2 hover:text-[#1A1A18] transition-colors';
      if (/^https?:\/\//.test(href)) {
        parts.push(<a key={key} href={href} className={className} target="_blank" rel="noopener noreferrer">{match[2]}</a>);
      } else if (href.startsWith('/') && !href.startsWith('//')) {
        parts.push(<Link key={key} href={href} className={className}>{match[2]}</Link>);
      } else {
        parts.push(match[2]);
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export default function ArticleBody({ content }: { content: string }) {
  return <div className="prose prose-lg max-w-none">
    {content.split(/\n\s*\n/).map((block, index) => {
      const text = block.trim();
      if (!text) return null;
      const photo = parsePhotoBlock(text);
      if (photo) {
        const resize = cdnVariant(photo.src);
        return <figure key={index} className="my-10">
          <img
            src={resize ? resize(1280) : photo.src}
            srcSet={cdnSrcSet(photo.src, [640, 960, 1280]) || undefined}
            sizes="(min-width: 768px) 720px, 100vw"
            alt={photo.alt}
            width={1200}
            height={800}
            loading="lazy"
            decoding="async"
            className="w-full h-auto aspect-[3/2] object-cover rounded-lg bg-[#F5F1EB]"
          />
          {photo.caption && <figcaption className="mt-3 text-sm text-[#726D63]">{renderInline(photo.caption)}</figcaption>}
        </figure>;
      }
      if (text.startsWith('### ')) return <h3 key={index} className="text-[#1A1A18] font-display text-xl md:text-2xl mt-10 mb-4">{renderInline(text.slice(4))}</h3>;
      if (text.startsWith('## ')) return <h2 key={index} className="text-[#1A1A18] font-display text-2xl md:text-3xl mt-12 mb-5">{renderInline(text.slice(3))}</h2>;
      const lines = text.split('\n');
      if (lines.every(line => /^-\s/.test(line))) return <ul key={index} className="list-disc pl-6 space-y-3 text-[#6B6860]">{lines.map((line, i) => <li key={i}>{renderInline(line.slice(2))}</li>)}</ul>;
      if (lines.length >= 2 && /^\|\s*:?-{3,}/.test(lines[1])) {
        const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
        return <div key={index} className="my-8 rounded-lg border border-[#E8E4DC] overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead><tr className="bg-[#F5F1EB]">{cells(lines[0]).map((cell, i) => <th key={i} scope="col" className="px-4 py-3 font-medium text-[#1A1A18] border-b border-[#E8E4DC]">{renderInline(cell)}</th>)}</tr></thead>
            <tbody>{lines.slice(2).map((line, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF7]'}>{cells(line).map((cell, j) => <td key={j} className="px-4 py-3 text-[#6B6860] border-b border-[#E8E4DC] align-top">{renderInline(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>;
      }
      return <p key={index} className="text-[#6B6860] leading-relaxed mb-6">{renderInline(text)}</p>;
    })}
  </div>;
}
