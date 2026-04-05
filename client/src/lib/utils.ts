import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Property, FilterDestination, SortOption } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Turn a locality name into a URL-friendly slug, e.g. "Viana do Castelo" → "viana-do-castelo" */
export function slugifyLocality(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Extract unique sorted localities from active properties */
export function getUniqueLocalities(properties: Property[]): { label: string; value: string }[] {
  const map = new Map<string, string>();
  for (const p of properties) {
    if (p.isActive && p.locality) {
      const slug = slugifyLocality(p.locality);
      if (!map.has(slug)) map.set(slug, p.locality);
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => a[1].localeCompare(b[1], 'pt'))
    .map(([value, label]) => ({ label, value }));
}

export function formatPrice(price: number): string {
  return `€${price.toLocaleString()}`;
}

export function formatWhatsAppUrl(message: string): string {
  return `https://wa.me/351927161771?text=${encodeURIComponent(message)}`;
}

export function filterProperties(
  properties: Property[],
  occasion: string,
  destination: FilterDestination,
  bedrooms?: string,
  price?: string,
  style?: string,
  tier?: string,
  location?: string,
): Property[] {
  let filtered = properties.filter(p => p.isActive);

  if (location && location !== 'all') {
    const slug = location.toLowerCase();
    filtered = filtered.filter(p => slugifyLocality(p.locality) === slug);
  } else if (destination !== 'all') {
    filtered = filtered.filter(p => p.destination === destination);
  }

  if (occasion && occasion !== 'all') {
    filtered = filtered.filter(p => p.occasions.includes(occasion));
  }

  if (tier && tier !== 'all') {
    filtered = filtered.filter(p => p.tier === tier);
  }

  if (bedrooms) {
    if (bedrooms === '1-2') filtered = filtered.filter(p => p.bedrooms >= 1 && p.bedrooms <= 2);
    else if (bedrooms === '3-4') filtered = filtered.filter(p => p.bedrooms >= 3 && p.bedrooms <= 4);
    else if (bedrooms === '5-6') filtered = filtered.filter(p => p.bedrooms >= 5 && p.bedrooms <= 6);
    else if (bedrooms === '7+') filtered = filtered.filter(p => p.bedrooms >= 7);
  }

  if (price) {
    if (price === 'under-200') filtered = filtered.filter(p => p.priceFrom < 200);
    else if (price === '200-400') filtered = filtered.filter(p => p.priceFrom >= 200 && p.priceFrom <= 400);
    else if (price === '400-600') filtered = filtered.filter(p => p.priceFrom >= 400 && p.priceFrom <= 600);
    else if (price === '600+') filtered = filtered.filter(p => p.priceFrom >= 600);
  }

  if (style) {
    filtered = filtered.filter(p => p.style.toLowerCase() === style.toLowerCase());
  }

  return filtered;
}

export function sortProperties(properties: Property[], sort: SortOption): Property[] {
  const sorted = [...properties];
  switch (sort) {
    case 'recommended': return sorted.sort((a, b) => a.sortOrder - b.sortOrder);
    case 'price-asc': return sorted.sort((a, b) => a.priceFrom - b.priceFrom);
    case 'price-desc': return sorted.sort((a, b) => b.priceFrom - a.priceFrom);
    case 'newest': return sorted.filter(p => p.tier === 'new').concat(sorted.filter(p => p.tier !== 'new'));
    default: return sorted;
  }
}
