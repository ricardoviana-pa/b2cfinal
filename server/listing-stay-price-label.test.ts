import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it } from "vitest";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "../client/src/i18n/locales/en.json";
import PropertyCard from "../client/src/components/property/PropertyCard";

(globalThis as any).React = React;
const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false } });

const property = {
  id: "synthetic", slug: "synthetic-home", name: "Synthetic home", guestyId: "synthetic",
  locality: "Viana do Castelo", destination: "minho", bedrooms: 3, bathrooms: 2, maxGuests: 6,
  images: ["https://example.invalid/home.jpg"], isActive: true,
} as any;
const quote = { total: 5176.44, nightlyRate: 700, cleaningFee: 276.44, nights: 7, source: "live", available: true };
function render(partner = false, feesKnown = false) {
  return renderToStaticMarkup(React.createElement(I18nextProvider, { i18n },
    React.createElement(Router, { base: "/en", ssrPath: "/en/homes" },
      React.createElement(PropertyCard, {
        property: partner ? { ...property, source: "tripwix" } : property,
        nights: 7, checkin: "2027-05-10", checkout: "2027-05-17", guests: 1,
        liveQuote: partner ? { ...quote, source: "partner_calendar", feesKnown } : quote,
      }))));
}

describe("the search price describes the rate the guest is opening", () => {
  it("labels the minimum Guesty rate as a starting stay price; the PDP may default to a refundable rate", () => {
    const html = render();
    expect(html).toMatch(/From [^<]*5[,.]176[,.]44[^<]* for the stay/);
    expect(html).toContain("checkin=2027-05-10&amp;checkout=2027-05-17&amp;guests=1");
  });
  it("keeps a supplier accommodation-only amount distinct from a final total", () => {
    expect(render(true)).toContain(en.partnerBooking.accommodationLabel);
    expect(render(true)).not.toContain("for the stay");
    expect(render(true, true)).toContain(en.property.totalLabel);
  });
});
