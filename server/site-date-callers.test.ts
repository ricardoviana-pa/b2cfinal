import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/* Auditoria 29 out 2026, Regression:P1. A public page that formats a date
   without a fixed time zone prints one day on the server (UTC) and another in
   a browser west of Greenwich, and React drops the server HTML (#418). Every
   date a visitor reads goes through shared/siteDate.ts (formatSiteDate) or
   names its zone; this guard finds the call sites that do neither. */

const ROOTS = ['client/src/pages', 'client/src/components'];
// Signed-in or staff screens are never server-rendered; their timestamps are
// meant in the reader's own clock.
const SKIP = [/\/admin\//, /\/pages\/Account\.tsx$/, /\/components\/ui\//];
// Known exceptions, each with its reason.
const ALLOWED: Record<string, string> = {
  // Price-hold deadline, client-only page, deliberately in the visitor's own clock.
  'client/src/pages/checkout/CheckoutPage.tsx': 'toLocaleTimeString',
  // Same bug, NOT fixed here: PR #175 rewrites the lines around it (reviews in
  // the page language). After #175 merges, format r.date with formatSiteDate
  // and delete this entry.
  'client/src/components/property/GuestFeedback.tsx': 'toLocaleDateString',
};

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** The argument list of the call that starts at `open` (the "(" index). */
function args(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

function zonelessCalls(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(/\.(toLocaleDateString|toLocaleTimeString)\(|new Intl\.DateTimeFormat\(/g)) {
    const a = args(src, m.index! + m[0].length - 1);
    // Number formatting (toLocaleString) is not a date; DateTimeFormat used
    // only for weekday/month names of a UTC date passes timeZone too.
    if (/timeZone/.test(a)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    out.push(`${m[1] || 'Intl.DateTimeFormat'}@${line}`);
  }
  return out;
}

describe('dates on public pages are formatted in a fixed zone', () => {
  const all = ROOTS.flatMap(files).filter((f) => !SKIP.some((re) => re.test(f)));

  it('finds the call sites it guards (sanity)', () => {
    expect(all.length).toBeGreaterThan(100);
    expect(all.some((f) => f.endsWith('pages/Blog.tsx'))).toBe(true);
  });

  it('no visitor-facing date is formatted in the browser time zone', () => {
    const offenders = all.flatMap((f) => zonelessCalls(f)
      .filter((c) => !(ALLOWED[f] && c.startsWith(ALLOWED[f])))
      .map((c) => `${f}:${c}`));
    expect(offenders).toEqual([]);
  });

  it('the journal and the review lists use the shared formatter', () => {
    for (const f of ['client/src/pages/Blog.tsx', 'client/src/components/property/ReviewsSection.tsx', 'client/src/components/experience/ExperienceReviews.tsx']) {
      expect(fs.readFileSync(f, 'utf8'), f).toMatch(/formatSiteDate\(/);
    }
  });
});
