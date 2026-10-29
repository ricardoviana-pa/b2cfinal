/**
 * performance-03-plp-lcp-lazy: what the server HTML of a listing grid says
 * about its card photos. Rendered with renderToPipeableStream, as
 * entry-server.tsx does, so React's own image preloads are included.
 */
import { Writable } from "node:stream";
import React from "react";
import { renderToPipeableStream } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it } from "vitest";
import PropertyCard from "../client/src/components/property/PropertyCard";
import { cardPriority } from "../client/src/lib/listingImagePriority";

// The app compiles JSX with the automatic runtime; vitest uses tsconfig's
// classic transform, which expects a React global.
(globalThis as any).React = React;

const IMG = "https://assets.guesty.com/image/upload/v1/production/a.jpg";
const home = (n: number) => ({
  id: `p${n}`, slug: `home-${n}`, name: `Home ${n}`, guestyId: `g${n}`, locality: "Ponte de Lima",
  destination: "minho", bedrooms: 3, bathrooms: 2, maxGuests: 6, isActive: true,
  images: [`${IMG.replace("a.jpg", `h${n}-1.jpg`)}`, `${IMG.replace("a.jpg", `h${n}-2.jpg`)}`],
}) as any;

function renderGrid(count: number): Promise<string> {
  const tree = React.createElement(Router, { base: "/en", ssrPath: "/en/homes" },
    ...Array.from({ length: count }, (_, i) => React.createElement(PropertyCard, { key: i, property: home(i + 1), ...cardPriority("homes", i) })));
  return new Promise((resolve, reject) => {
    let html = "";
    const sink = new Writable({ write(chunk, _e, cb) { html += chunk.toString(); cb(); } });
    sink.on("finish", () => resolve(html));
    const { pipe } = renderToPipeableStream(tree, { onAllReady: () => pipe(sink), onError: reject });
  });
}

const imgTag = (html: string, n: number) => html.match(new RegExp(`<img[^>]*h${n}-1\\.jpg[^>]*>`))?.[0] ?? "";
const preloads = (html: string) => html.match(/<link rel="preload" as="image"[^>]*>/g) ?? [];

describe("listing grid card photos in the server HTML", () => {
  it("card 1: eager, fetchpriority=high, and React preloads it with its srcset and sizes", async () => {
    const html = await renderGrid(5);
    const first = imgTag(html, 1);
    expect(first).toMatch(/loading="eager"/);
    expect(first).toMatch(/fetchPriority="high"/i);
    const p = preloads(html).find((l) => l.includes("h1-1.jpg"));
    expect(p).toBeTruthy();
    expect(p).toMatch(/fetchPriority="high"/i);
    expect(p).toMatch(/imageSrcSet="[^"]*w_400[^"]*400w/i);
    expect(p).toMatch(/imageSizes="\(max-width: 640px\) 100vw/i);
    expect(p).not.toMatch(/media=/);
  });

  it("cards 2–3: the <img> stays lazy and low, the preload only on screens where they share the first row", async () => {
    const html = await renderGrid(5);
    for (const [n, media] of [[2, "(min-width: 768px)"], [3, "(min-width: 1024px)"]] as const) {
      expect(imgTag(html, n)).toMatch(/loading="lazy"/);
      expect(imgTag(html, n)).toMatch(/fetchPriority="low"/i);
      const p = preloads(html).find((l) => l.includes(`h${n}-1.jpg`));
      expect(p, `card ${n}`).toBeTruthy();
      expect(p).toContain(`media="${media}"`);
      expect(p).not.toMatch(/fetchPriority="high"/i);
    }
  });

  it("cards 4+: lazy, low priority, never preloaded; second photos never preloaded", async () => {
    const html = await renderGrid(6);
    for (const n of [4, 5, 6]) {
      expect(imgTag(html, n)).toMatch(/loading="lazy"/);
      expect(preloads(html).some((l) => l.includes(`h${n}-1.jpg`))).toBe(false);
    }
    expect(preloads(html).some((l) => /h\d-2\.jpg/.test(l))).toBe(false);
  });
});
