# Destination guides — 28 September 2026

The approved Minho page is now the visual reference for eight additional destination guides: Viana do Castelo, Caminha, Esposende, Porto, Douro, Lisbon, Alentejo and Algarve. Portuguese and English use the researched layout; other existing translations retain their current template.

Each guide has orientation, landscape photography, three local highlights, a comparison of bases, interactive 3/5/7-night suggestions, food, culture, seasons, airports and local transport, homes, related reading and eight FAQs. A stay has 2/4/6 full days plus arrival and departure. Alentejo separates Comporta from Ferreira; Algarve separates western, central and eastern itineraries. These are editorial suggestions, not included or pre-booked packages.

## Data and maintenance

- `client/src/data/destination-editorial.json`: bilingual presentation and route content.
- `client/src/data/destination-editorial-sources.json`: primary sources consulted in the destination research, linked from relevant cards and a source disclosure.
- `destinations.json` and `destinations.i18n/pt.json`: matching titles, summaries and FAQ content for existing data consumers and server-rendered metadata/schema.
- `DestinationVisualGuide`: shared presentation derived from Minho; the approved Minho implementation remains.
- Photo provenance and licences: `destination-photography.md` and public `/destinations/photography.html`.

Public research was completed on 28 September 2026. Opening hours, prices, timetables and capacity remain on official operator pages. Links are references, not statements of a commercial partnership. Shuttle proposals are organised by PA with availability and price confirmed separately.

## Geography and catalogue

Porto city homes appear separately from Trofa and Amarante, with a link to the Douro collection. Porto and Esposende structured data only describe properties in the named locality. Esposende currently receives a Minho catalogue fallback: the page explicitly labels these as regional alternatives. Generic Douro or Algarve catalogue locations are not assigned invented municipalities or distances. The real home's location should always guide the itinerary.

Caminha's regional photograph now shows Moledo rather than a property. Existing approved Douro and Esposende landscapes remain. A Viana journal-card excerpt now presents cultural discoveries positively.

## Validation and release scope

- Local full suite: 754 passed, 6 skipped; isolated checkout integration: 83 passed.
- TypeScript and production build checked without operational credentials.
- 18 Portuguese/English pages checked over HTTP: unique H1/title/IDs, visible FAQ/schema agreement, default route length, culture, arrival options and no rain framing.
- Browser checks: Viana mobile at 390px (hero and restaurant cards); Alentejo interior and 7 nights; Algarve English eastern route and 3 nights; Porto city homes and preserved travel dates/guest count.
- DEV only. Production deployment is outside this change's authorization. No operational provider configuration, reservation, payment or message was changed.
