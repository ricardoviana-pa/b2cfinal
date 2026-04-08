/* ==========================================================================
   useSEO — Lightweight per-page meta tag manager for SPA
   Updates document.title, meta description, OG tags, canonical URL,
   and injects JSON-LD structured data.
   ========================================================================== */

import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description: string;
  canonical?: string;
  ogType?: string;
  ogImage?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

const BASE_URL = 'https://www.portugalactive.com';
const SITE_NAME = 'Portugal Active';

function setMeta(name: string, content: string, attr = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setJsonLd(data: Record<string, unknown> | Record<string, unknown>[]) {
  // Remove previous dynamic JSON-LD (keep the static Organization one)
  document.querySelectorAll('script[data-seo="dynamic"]').forEach(el => el.remove());
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.setAttribute('data-seo', 'dynamic');
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

export function useSEO({ title, description, canonical, ogType, ogImage, jsonLd }: SEOProps) {
  useEffect(() => {
    const fullTitle = `${title} — ${SITE_NAME}`;
    document.title = fullTitle;

    setMeta('description', description);
    setMeta('og:title', fullTitle, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:type', ogType || 'website', 'property');
    setMeta('og:site_name', SITE_NAME, 'property');
    setMeta('twitter:title', fullTitle, 'name');
    setMeta('twitter:description', description, 'name');

    if (canonical) {
      const url = canonical.startsWith('http') ? canonical : `${BASE_URL}${canonical}`;
      setMeta('og:url', url, 'property');
      setCanonical(url);
    }

    if (ogImage) {
      setMeta('og:image', ogImage, 'property');
      setMeta('twitter:image', ogImage, 'name');
    }

    if (jsonLd) {
      setJsonLd(jsonLd);
    }

    return () => {
      // Cleanup dynamic JSON-LD on unmount
      document.querySelectorAll('script[data-seo="dynamic"]').forEach(el => el.remove());
    };
  }, [title, description, canonical, ogType, ogImage, jsonLd]);
}
