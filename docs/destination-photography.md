# Destination photography — 16 September 2026

This review corrects the regional selection introduced in PR #62. An HTTP 200 response was not sufficient to establish the location of a photograph. The generic mountain sunset assigned to Algarve, the snowy mountain assigned to Gerês and the unverified vineyard/forest overrides have been removed.

## Selection and provenance

| Use | Photograph | Source / photographer | Verification |
| --- | --- | --- | --- |
| Algarve region | Coast at Lagoa, Faro; Pexels 13184329 | [Gantas Vaičiulėnas](https://www.pexels.com/photo/aerial-view-of-the-coast-of-algarve-portugal-13184329/) | Source identifies Lagoa; image viewed in browser. |
| Algarve journal card | Praia da Galé; Unsplash 1623237801985 | [Hendrik Morkel](https://unsplash.com/photos/an-aerial-view-of-a-beach-at-sunset-3uNXkteFPUo) | Source identifies Praia da Galé; image viewed. |
| Alentejo region | Oak landscape; Unsplash 1725144690049 | [Joao](https://unsplash.com/photos/a-grassy-field-with-trees-in-the-distance-or_p5pyhTQI) | Source identifies Alentejo; image viewed. |
| Gerês journal card | Mountain panorama; Unsplash 1663608025293 | [Pedro Cunha](https://unsplash.com/photos/a-landscape-with-hills-and-trees-ZHbMI9la0P4) | Source identifies Peneda-Gerês National Park; image viewed. |
| Minho autumn journal card | Forest; Unsplash 1655769211458 | [Bruno Alves](https://unsplash.com/photos/a-foggy-forest-with-trees-fGh9GvPxGXM) | Source identifies Gerês, Terras de Bouro; image viewed. Illustrates the region, not a harvest event. |
| Viana region | Marina and Santa Luzia hill; Pexels 33812433 | Existing PA journal asset | Visual check identifies Viana skyline. Reused from the existing catalogue; original licence record and photographer credit were not reverified. |
| Viana journal card | Santa Luzia architectural detail; Unsplash 1645203886493 | [Nicolas Armoa](https://unsplash.com/photos/a-large-stone-building-with-a-clock-on-its-side-KaoiyMOzIrY) | Source identifies Santa Luzia in Viana; image viewed. |
| Northern Portugal seasons journal card | Minho coast | Existing local `/destinations/minho-coast.webp` | Existing PA regional photograph. |

New external selections above are offered under the source's Unsplash or Pexels licence. They are landscape/editorial images, not photographs of PA properties or evidence of included services. Porto, Lisbon and other unchanged legacy assets are outside the new-source licensing review.

## Rendering and link integrity

- Regional images continue to feed the destination hub, home cards, destination hero, related destinations and metadata.
- Unsplash now uses responsive width variants; home and related cards also use `srcSet`.
- Duplicate photographs no longer remove entire articles. Editorial order, titles and links survive; only repeated thumbnails are omitted.
- The guide considers the hero, first six home covers and experience covers when avoiding repetition.
- No blog article, route or translation was deleted.

## Validation

- TypeScript check, production build and 13 focused tests passed locally.
- Real PDP → checkout was exercised in DEV and production, with 9–17 November 2026, two guests. Both retained the selected non-refundable tariff and displayed €3,201 (€2,818 accommodation + €383 preparation) at the time of the check. Live prices can change.
- No guest contact data or payment was submitted. This proves entry into checkout, not a completed payment or reservation.

## Source verification and Esposende correction — 28 September 2026

- Viana `33812433` is [Scenic View of Viana do Castelo Waterfront](https://www.pexels.com/photo/scenic-view-of-viana-do-castelo-waterfront-33812433/) by Sandra Senabre Gilabert, offered under the [Pexels License](https://www.pexels.com/license/). This closes the public-source/photographer gap in the earlier record.
- Porto `photo-1555881400-74d7acaacd8b` is [Boats on Douro River in Porto](https://unsplash.com/photos/boats-on-douro-river-in-porto-Prb-sjOUBFs) by Nick Karvounis. Lisbon `photo-1585208798174-6cedd86e019a` is [Yellow tram in historic Lisbon street](https://unsplash.com/photos/yellow-tram-in-historic-lisbon-street-ljhCEaHYWJ8) by Aayush Gupta. Both sources identify the city and offer the [Unsplash License](https://unsplash.com/license/).
- Esposende now uses [A wooden dock leading out to the ocean](https://unsplash.com/photos/a-wooden-dock-leading-out-to-the-ocean-P9omwtjsnsk) by Tiago Oliveira, described and located by the author as a boardwalk in Esposende. CDN `photo-1660504185301-bec799d9adf0`, Unsplash License. The previous fallback was a photograph of Beach Farm in Viana do Castelo, so it could not represent Esposende. The square hero crop was inspected in the actual page.
- Caminha and Douro retain existing catalogue photographs of Historic Riverfront Watermill and Quinta da Lameirinha respectively. New captions explicitly identify accommodation photographs. Catalogue provenance does not establish an open licence; existing supplier rights remain applicable, with no invented photographer credit.

No generated images represent places or services in this update. Responsive source widths and existing image components are reused.
