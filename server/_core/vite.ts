import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      let page = await vite.transformIndexHtml(url, template);

      // Inject per-request locale tags so dev mirrors prod SEO behavior.
      const rawPath = url.split("?")[0];
      const first = rawPath.split('/').filter(Boolean)[0]?.toLowerCase();
      const devLang = first && ALL_LANGS.includes(first) ? first : 'en';
      const devStripped = first && ALL_LANGS.includes(first)
        ? ('/' + rawPath.split('/').filter(Boolean).slice(1).join('/') || '/')
        : rawPath;
      page = injectLocaleTags(page, { lang: devLang, pagePath: devStripped });

      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

const BOT_UA_RE = /googlebot|google-extended|googleother|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|applebot|applebot-extended|ia_archiver|gptbot|oai-searchbot|chatgpt-user|perplexitybot|perplexity-user|claudebot|claude-web|anthropic-ai|ccbot|meta-externalagent|bytespider|amazonbot|diffbot/i;

let _cachedIndexHtml: string | null = null;

function isBotRequest(req: import('express').Request): boolean {
  return BOT_UA_RE.test(req.headers['user-agent'] ?? '');
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── SEO: locale tags ──────────────────────────────────────────────────────
   Every HTML response (human or bot) carries per-request hreflang + canonical
   so Google treats /en/, /pt/, /fr/ … as distinct indexable versions instead
   of deduping them to the English root. */

const BOT_BASE_URL = 'https://www.portugalactive.com';

/** Short lang code → BCP-47 region tag used in hreflang attributes.
 *  Google recommends region tags where they aid disambiguation; we use the
 *  generic language code too so any region matches. */
const HREFLANG_REGION: Record<string, string> = {
  en: 'en-GB', pt: 'pt-PT', es: 'es-ES', fr: 'fr-FR',
  de: 'de-DE', it: 'it-IT', nl: 'nl-NL', fi: 'fi-FI', sv: 'sv-SE',
};

/** og:locale tag values. */
const OG_LOCALE: Record<string, string> = {
  en: 'en_GB', pt: 'pt_PT', es: 'es_ES', fr: 'fr_FR',
  de: 'de_DE', it: 'it_IT', nl: 'nl_NL', fi: 'fi_FI', sv: 'sv_SE',
};

const ALL_LANGS = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];

/** Build the full alternate-language link block for a given page path. */
function buildHreflangBlock(pagePath: string): string {
  const suffix = pagePath === '/' ? '' : pagePath;
  const langLinks = ALL_LANGS.map(l => {
    // emit both generic ("pt") and regional ("pt-PT") — Google picks the best match
    const generic = `    <link rel="alternate" hreflang="${l}" href="${BOT_BASE_URL}/${l}${suffix}" />`;
    const regional = `    <link rel="alternate" hreflang="${HREFLANG_REGION[l]}" href="${BOT_BASE_URL}/${l}${suffix}" />`;
    return `${generic}\n${regional}`;
  }).join('\n');
  const xDefault = `    <link rel="alternate" hreflang="x-default" href="${BOT_BASE_URL}/en${suffix}" />`;
  return `${langLinks}\n${xDefault}`;
}

/** Inject per-request locale signals: <html lang>, hreflang alternates,
 *  canonical URL, og:url, og:locale. Safe to run on any HTML response. */
function injectLocaleTags(html: string, opts: { lang: string; pagePath: string }): string {
  const lang = ALL_LANGS.includes(opts.lang) ? opts.lang : 'en';
  const pagePath = opts.pagePath;
  const url = `${BOT_BASE_URL}/${lang}${pagePath === '/' ? '' : pagePath}`;
  const urlEsc = escAttr(url);
  const ogLocale = OG_LOCALE[lang] ?? 'en_GB';

  // 1. <html lang="…">
  html = html.replace(/<html\s+lang="[^"]*"/i, `<html lang="${lang}"`);

  // 2. Replace the full hreflang block (any existing <link rel="alternate" hreflang=…>)
  //    with the canonical 9-lang + 9-region + x-default set.
  //    Strategy: remove every existing hreflang link, then re-insert before </head>.
  html = html.replace(/\s*<link\s+rel="alternate"\s+hreflang="[^"]*"[^>]*\/?>\s*/g, '\n');
  const block = buildHreflangBlock(pagePath);
  // Insert just before the canonical link so tags stay grouped
  if (/<link rel="canonical"/.test(html)) {
    html = html.replace(/(<link rel="canonical"[^>]*>)/, `${block}\n    $1`);
  } else {
    // Fallback: insert before </head>
    html = html.replace(/<\/head>/, `${block}\n  </head>`);
  }

  // 3. canonical → per-locale URL
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, (_m, o, c) => `${o}${urlEsc}${c}`);

  // 4. og:url → per-locale URL
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, (_m, o, c) => `${o}${urlEsc}${c}`);

  // 5. og:locale → per-locale tag
  html = html.replace(/(<meta property="og:locale" content=")[^"]*(")/, (_m, o, c) => `${o}${ogLocale}${c}`);

  return html;
}

/** Per-language localized page meta. English is the source of truth; other
 *  languages hold translated titles + descriptions for the main static
 *  routes. Missing entries fall back to English. */
type MetaEntry = { title: string; description: string };
const PAGE_META: Record<string, Record<string, MetaEntry>> = {
  '/': {
    en: { title: 'Portugal Active — Luxury Holiday Homes & Private Villa Rentals in Portugal',
          description: '5-star hotel experience in private holiday homes. Professionally managed villas in Algarve, Lisbon, Alentejo, Minho. Full-service concierge, private chefs, curated adventures. Book direct.' },
    pt: { title: 'Casas Privadas de Luxo em Portugal | Serviço de Hotel | Portugal Active',
          description: '60+ casas privadas em todo Portugal, geridas como hotéis de luxo. Chef privado, concierge, piscina. Reserve direto para o melhor preço.' },
    es: { title: 'Villas Privadas de Lujo en Portugal | Servicio de Hotel | Portugal Active',
          description: 'Más de 60 villas privadas en todo Portugal, gestionadas como hoteles de lujo. Chef privado, conserjería, piscina. Reserva directa al mejor precio.' },
    fr: { title: 'Villas de Luxe Privées au Portugal | Service Hôtelier | Portugal Active',
          description: '60+ villas privées à travers le Portugal, gérées comme des hôtels de luxe. Chef privé, conciergerie, piscine. Réservation directe au meilleur tarif.' },
    de: { title: 'Private Luxusvillen in Portugal | Hotelservice | Portugal Active',
          description: 'Über 60 private Villen in ganz Portugal, geführt wie Luxushotels. Privatkoch, Concierge, Pool. Direkt buchen zum besten Preis.' },
    it: { title: 'Ville di Lusso Private in Portogallo | Servizio Hotel | Portugal Active',
          description: 'Oltre 60 ville private in tutto il Portogallo, gestite come hotel di lusso. Chef privato, concierge, piscina. Prenota diretto al miglior prezzo.' },
    nl: { title: 'Luxe Privévilla\'s in Portugal | Hotelservice | Portugal Active',
          description: '60+ privévilla\'s in heel Portugal, beheerd als luxe hotels. Privékok, conciërge, zwembad. Direct boeken voor de beste prijs.' },
    fi: { title: 'Luksushuvilat Portugalissa | Hotellipalvelu | Portugal Active',
          description: 'Yli 60 yksityistä huvilaa eri puolilla Portugalia, hoidettuna kuin luksushotelleja. Yksityiskokki, concierge, uima-allas. Varaa suoraan parhaaseen hintaan.' },
    sv: { title: 'Privata Lyxvillor i Portugal | Hotellservice | Portugal Active',
          description: 'Över 60 privata villor runt om i Portugal, skötta som lyxhotell. Privat kock, concierge, pool. Boka direkt för bästa pris.' },
  },
  '/homes': {
    en: { title: 'Luxury Holiday Properties in Portugal — Private Villas & Homes | Portugal Active',
          description: 'Browse our curated collection of 60+ luxury holiday properties across Portugal. Each home offers hotel-grade amenities, private pools, and dedicated concierge service. Book direct for the best rate.' },
    pt: { title: 'Casas Privadas em Portugal | Casas de Férias de Luxo | Portugal Active',
          description: 'Descubra mais de 60 casas privadas selecionadas em todo Portugal. Piscina, concierge e limpeza incluídos. Filtre por região e reserve direto.' },
    es: { title: 'Villas Privadas en Portugal | Casas de Vacaciones de Lujo | Portugal Active',
          description: 'Descubre más de 60 villas privadas seleccionadas en todo Portugal. Piscina, conserjería y limpieza incluidos. Filtra por región y reserva directo.' },
    fr: { title: 'Villas Privées au Portugal | Maisons de Vacances de Luxe | Portugal Active',
          description: 'Plus de 60 villas privées sélectionnées à travers le Portugal. Piscine, conciergerie et ménage inclus. Filtrez par région et réservez en direct.' },
    de: { title: 'Private Villen in Portugal | Luxus-Ferienhäuser | Portugal Active',
          description: 'Entdecken Sie über 60 ausgewählte private Villen in ganz Portugal. Pool, Concierge und Reinigung inklusive. Nach Region filtern und direkt buchen.' },
    it: { title: 'Ville Private in Portogallo | Case Vacanza di Lusso | Portugal Active',
          description: 'Oltre 60 ville private selezionate in tutto il Portogallo. Piscina, concierge e pulizie incluse. Filtra per regione e prenota diretto.' },
    nl: { title: 'Privévilla\'s in Portugal | Luxe Vakantiehuizen | Portugal Active',
          description: 'Meer dan 60 geselecteerde privévilla\'s in heel Portugal. Zwembad, conciërge en schoonmaak inbegrepen. Filter op regio en boek direct.' },
    fi: { title: 'Yksityiset Huvilat Portugalissa | Luksuslomatalot | Portugal Active',
          description: 'Selaa yli 60 käsin valittua yksityistä huvilaa ympäri Portugalia. Allas, concierge ja siivous sisältyy. Suodata alueen mukaan ja varaa suoraan.' },
    sv: { title: 'Privata Villor i Portugal | Lyxiga Semesterhus | Portugal Active',
          description: 'Utforska 60+ handplockade privata villor i Portugal. Pool, concierge och städning ingår. Filtrera efter region och boka direkt.' },
  },
  '/destinations': {
    en: { title: 'Destinations in Portugal | Minho, Porto, Algarve & More | Portugal Active',
          description: 'Explore our luxury villa destinations across Portugal — Minho Coast, Porto & Douro, Algarve, Lisbon, Alentejo. Find your perfect region.' },
    pt: { title: 'Destinos em Portugal | Minho, Porto, Algarve e mais | Portugal Active',
          description: 'Explore os nossos destinos de casas de luxo em Portugal — Costa do Minho, Porto e Douro, Algarve, Lisboa, Alentejo. Encontre a sua região perfeita.' },
    es: { title: 'Destinos en Portugal | Miño, Oporto, Algarve y más | Portugal Active',
          description: 'Explora nuestros destinos de villas de lujo en Portugal — Costa de Miño, Oporto y Duero, Algarve, Lisboa, Alentejo. Encuentra tu región perfecta.' },
    fr: { title: 'Destinations au Portugal | Minho, Porto, Algarve et plus | Portugal Active',
          description: 'Découvrez nos destinations de villas de luxe au Portugal — Côte du Minho, Porto et Douro, Algarve, Lisbonne, Alentejo. Trouvez votre région idéale.' },
    de: { title: 'Reiseziele in Portugal | Minho, Porto, Algarve & mehr | Portugal Active',
          description: 'Entdecken Sie unsere Luxusvilla-Reiseziele in ganz Portugal — Minho-Küste, Porto & Douro, Algarve, Lissabon, Alentejo. Finden Sie Ihre perfekte Region.' },
    it: { title: 'Destinazioni in Portogallo | Minho, Porto, Algarve e oltre | Portugal Active',
          description: 'Esplora le nostre destinazioni di ville di lusso in tutto il Portogallo — Costa del Minho, Porto e Douro, Algarve, Lisbona, Alentejo.' },
    nl: { title: 'Bestemmingen in Portugal | Minho, Porto, Algarve & meer | Portugal Active',
          description: 'Ontdek onze luxe villabestemmingen in heel Portugal — Minho-kust, Porto & Douro, Algarve, Lissabon, Alentejo. Vind jouw perfecte regio.' },
    fi: { title: 'Kohteet Portugalissa | Minho, Porto, Algarve ja muut | Portugal Active',
          description: 'Tutustu luksushuvilakohteisiimme Portugalissa — Minhon rannikko, Porto ja Douro, Algarve, Lissabon, Alentejo. Löydä täydellinen alueesi.' },
    sv: { title: 'Destinationer i Portugal | Minho, Porto, Algarve & mer | Portugal Active',
          description: 'Utforska våra lyxvillor i Portugal — Minhokusten, Porto & Douro, Algarve, Lissabon, Alentejo. Hitta din perfekta region.' },
  },
  '/services': {
    en: { title: 'Luxury Concierge Services | Private Chef, Spa, Transfers | Portugal Active',
          description: 'Elevate your villa stay with private chef, in-house spa, airport transfers, and bespoke experiences. Book alongside your villa.' },
    pt: { title: 'Serviços de Concierge de Luxo | Chef Privado, Spa, Transfers | Portugal Active',
          description: 'Eleve a sua estadia com chef privado, spa ao domicílio, transfers aeroporto e experiências à medida. Reserve junto com a sua casa.' },
    es: { title: 'Servicios de Conserjería de Lujo | Chef Privado, Spa, Traslados | Portugal Active',
          description: 'Eleva tu estancia con chef privado, spa a domicilio, traslados al aeropuerto y experiencias a medida. Reserva junto con tu villa.' },
    fr: { title: 'Conciergerie de Luxe | Chef Privé, Spa, Transferts | Portugal Active',
          description: 'Sublimez votre séjour avec chef privé, spa à domicile, transferts aéroport et expériences sur mesure. Réservez avec votre villa.' },
    de: { title: 'Luxus-Concierge-Services | Privatkoch, Spa, Transfers | Portugal Active',
          description: 'Veredeln Sie Ihren Aufenthalt mit Privatkoch, Haus-Spa, Flughafentransfers und individuellen Erlebnissen. Buchen Sie zusammen mit Ihrer Villa.' },
    it: { title: 'Servizi di Concierge di Lusso | Chef Privato, Spa, Trasferimenti | Portugal Active',
          description: 'Arricchisci il tuo soggiorno con chef privato, spa in villa, trasferimenti aeroporto ed esperienze su misura. Prenota insieme alla tua villa.' },
    nl: { title: 'Luxe Conciërgediensten | Privékok, Spa, Transfers | Portugal Active',
          description: 'Verhef je verblijf met privékok, in-house spa, luchthaventransfers en exclusieve ervaringen. Boek samen met je villa.' },
    fi: { title: 'Luksus-conciergepalvelut | Yksityiskokki, Kylpylä, Kuljetukset | Portugal Active',
          description: 'Kruunaa huvilalomasi yksityiskokilla, kotikylpylällä, lentokenttäkuljetuksilla ja räätälöidyillä elämyksillä. Varaa huvilan kanssa.' },
    sv: { title: 'Lyxiga Concierge-tjänster | Privat Kock, Spa, Transfer | Portugal Active',
          description: 'Lyft din vistelse med privat kock, hemspa, flygplatstransfer och skräddarsydda upplevelser. Boka tillsammans med din villa.' },
  },
  '/experiences': {
    en: { title: 'Curated Experiences in Portugal — Private Chef, Spa, Wine Tours | Portugal Active',
          description: 'Exclusive guest experiences: private chef dining, in-villa spa, wine tastings, cultural tours. Available only when staying at a Portugal Active property. Book your experience.' },
    pt: { title: 'Aventuras em Portugal | Equitação, Canyoning e Surf | Portugal Active',
          description: 'Atividades de aventura guiadas em todo Portugal — equitação, canyoning, surf, caminhadas, provas de vinho e mais. Reserve direto no Minho, Porto ou Algarve.' },
    es: { title: 'Aventuras en Portugal | Equitación, Barranquismo y Surf | Portugal Active',
          description: 'Actividades de aventura guiadas en todo Portugal — equitación, barranquismo, surf, senderismo, catas de vino y más. Reserva directo en Miño, Oporto o Algarve.' },
    fr: { title: 'Aventures au Portugal | Équitation, Canyoning et Surf | Portugal Active',
          description: 'Activités d\'aventure guidées à travers le Portugal — équitation, canyoning, surf, randonnée, œnotourisme et plus. Réservation directe au Minho, Porto ou Algarve.' },
    de: { title: 'Abenteueraktivitäten in Portugal | Reiten, Canyoning & Surfen | Portugal Active',
          description: 'Geführte Abenteueraktivitäten in ganz Portugal — Reiten, Canyoning, Surfen, Wandern, Weintouren und mehr. Direkt buchen in Minho, Porto oder Algarve.' },
    it: { title: 'Avventure in Portogallo | Equitazione, Canyoning e Surf | Portugal Active',
          description: 'Attività d\'avventura guidate in tutto il Portogallo — equitazione, canyoning, surf, escursioni, tour del vino e altro. Prenota diretto a Minho, Porto o Algarve.' },
    nl: { title: 'Avonturen in Portugal | Paardrijden, Canyoning & Surfen | Portugal Active',
          description: 'Begeleide avonturenactiviteiten in heel Portugal — paardrijden, canyoning, surfen, wandelen, wijntochten en meer. Direct boeken in Minho, Porto of Algarve.' },
    fi: { title: 'Seikkailut Portugalissa | Ratsastus, Canyoning ja Surffaus | Portugal Active',
          description: 'Opastetut seikkailuaktiviteetit ympäri Portugalia — ratsastus, canyoning, surffaus, vaellus, viinikierrokset ja muuta. Varaa suoraan Minhossa, Portossa tai Algarvessa.' },
    sv: { title: 'Äventyr i Portugal | Ridning, Canyoning & Surf | Portugal Active',
          description: 'Guidade äventyrsaktiviteter runt om i Portugal — ridning, canyoning, surf, vandring, vintouring med mera. Boka direkt i Minho, Porto eller Algarve.' },
  },
  '/adventures': {
    en: { title: 'Adventures in Portugal — Horseback Riding, Off-Road, Water Sports | Portugal Active',
          description: 'Discover unique adventure experiences across Portugal. From horseback riding in the Alentejo to off-road tours in the Algarve. Book private, curated experiences for families and groups.' },
    pt: { title: 'Aventuras em Portugal | Equitação, Canyoning e Surf | Portugal Active',
          description: 'Atividades de aventura guiadas em todo Portugal — equitação, canyoning, surf, caminhadas, provas de vinho e mais. Reserve direto no Minho, Porto ou Algarve.' },
    es: { title: 'Aventuras en Portugal | Equitación, Barranquismo y Surf | Portugal Active',
          description: 'Actividades de aventura guiadas en todo Portugal — equitación, barranquismo, surf, senderismo, catas de vino y más. Reserva directo en Miño, Oporto o Algarve.' },
    fr: { title: 'Aventures au Portugal | Équitation, Canyoning et Surf | Portugal Active',
          description: 'Activités d\'aventure guidées à travers le Portugal — équitation, canyoning, surf, randonnée, œnotourisme et plus. Réservation directe au Minho, Porto ou Algarve.' },
    de: { title: 'Abenteueraktivitäten in Portugal | Reiten, Canyoning & Surfen | Portugal Active',
          description: 'Geführte Abenteueraktivitäten in ganz Portugal — Reiten, Canyoning, Surfen, Wandern, Weintouren und mehr. Direkt buchen in Minho, Porto oder Algarve.' },
    it: { title: 'Avventure in Portogallo | Equitazione, Canyoning e Surf | Portugal Active',
          description: 'Attività d\'avventura guidate in tutto il Portogallo — equitazione, canyoning, surf, escursioni, tour del vino e altro. Prenota diretto a Minho, Porto o Algarve.' },
    nl: { title: 'Avonturen in Portugal | Paardrijden, Canyoning & Surfen | Portugal Active',
          description: 'Begeleide avonturenactiviteiten in heel Portugal — paardrijden, canyoning, surfen, wandelen, wijntochten en meer. Direct boeken in Minho, Porto of Algarve.' },
    fi: { title: 'Seikkailut Portugalissa | Ratsastus, Canyoning ja Surffaus | Portugal Active',
          description: 'Opastetut seikkailuaktiviteetit ympäri Portugalia — ratsastus, canyoning, surffaus, vaellus, viinikierrokset ja muuta. Varaa suoraan Minhossa, Portossa tai Algarvessa.' },
    sv: { title: 'Äventyr i Portugal | Ridning, Canyoning & Surf | Portugal Active',
          description: 'Guidade äventyrsaktiviteter runt om i Portugal — ridning, canyoning, surf, vandring, vintouring med mera. Boka direkt i Minho, Porto eller Algarve.' },
  },
  '/events': {
    en: { title: 'Private Events Portugal | Weddings, Retreats, Celebrations | Portugal Active',
          description: 'Host weddings, corporate retreats, and private celebrations in luxury Portuguese villas. Full event planning and concierge.' },
    pt: { title: 'Eventos Privados em Portugal | Casamentos, Retiros, Celebrações | Portugal Active',
          description: 'Acolha casamentos, retiros corporativos e celebrações privadas em casas de luxo portuguesas. Planeamento completo e concierge.' },
    es: { title: 'Eventos Privados en Portugal | Bodas, Retiros, Celebraciones | Portugal Active',
          description: 'Organiza bodas, retiros corporativos y celebraciones privadas en villas portuguesas de lujo. Planificación completa y conserjería.' },
    fr: { title: 'Événements Privés au Portugal | Mariages, Retraites, Célébrations | Portugal Active',
          description: 'Accueillez mariages, séminaires d\'entreprise et célébrations privées dans des villas portugaises de luxe. Organisation complète et conciergerie.' },
    de: { title: 'Private Events in Portugal | Hochzeiten, Retreats, Feiern | Portugal Active',
          description: 'Veranstalten Sie Hochzeiten, Firmen-Retreats und private Feiern in portugiesischen Luxusvillen. Komplette Eventplanung und Concierge.' },
    it: { title: 'Eventi Privati in Portogallo | Matrimoni, Ritiri, Celebrazioni | Portugal Active',
          description: 'Organizza matrimoni, ritiri aziendali e celebrazioni private in ville portoghesi di lusso. Pianificazione completa e concierge.' },
    nl: { title: 'Privé-evenementen in Portugal | Bruiloften, Retraites, Vieringen | Portugal Active',
          description: 'Organiseer bruiloften, zakelijke retraites en privévieringen in Portugese luxevilla\'s. Volledige eventplanning en conciërge.' },
    fi: { title: 'Yksityistapahtumat Portugalissa | Häät, Retriitit, Juhlat | Portugal Active',
          description: 'Järjestä häitä, yritysretriittejä ja yksityisjuhlia portugalilaisissa luksushuviloissa. Täysi tapahtumasuunnittelu ja concierge.' },
    sv: { title: 'Privata Evenemang i Portugal | Bröllop, Retreater, Firanden | Portugal Active',
          description: 'Arrangera bröllop, företagsretreater och privata firanden i portugisiska lyxvillor. Fullständig eventplanering och concierge.' },
  },
  '/about': {
    en: { title: 'About Portugal Active | Luxury Villa Management in Portugal',
          description: 'We manage 60+ private homes across Portugal end-to-end — bookings, concierge, housekeeping. A different kind of villa company.' },
    pt: { title: 'Sobre a Portugal Active | Gestão de Casas de Luxo em Portugal',
          description: 'Gerimos mais de 60 casas privadas em todo Portugal de ponta a ponta — reservas, concierge, limpeza. Uma empresa de casas diferente.' },
    es: { title: 'Sobre Portugal Active | Gestión de Villas de Lujo en Portugal',
          description: 'Gestionamos más de 60 casas privadas en todo Portugal de principio a fin — reservas, conserjería, limpieza. Una empresa de villas diferente.' },
    fr: { title: 'À propos de Portugal Active | Gestion de Villas de Luxe au Portugal',
          description: 'Nous gérons plus de 60 maisons privées à travers le Portugal de A à Z — réservations, conciergerie, ménage. Un autre type de société de villas.' },
    de: { title: 'Über Portugal Active | Luxusvilla-Management in Portugal',
          description: 'Wir verwalten über 60 private Häuser in ganz Portugal vollumfänglich — Buchungen, Concierge, Reinigung. Eine andere Art von Villenunternehmen.' },
    it: { title: 'Chi siamo | Portugal Active | Gestione di Ville di Lusso in Portogallo',
          description: 'Gestiamo oltre 60 case private in tutto il Portogallo dall\'inizio alla fine — prenotazioni, concierge, pulizie. Un\'azienda di ville diversa.' },
    nl: { title: 'Over Portugal Active | Luxe Villabeheer in Portugal',
          description: 'Wij beheren meer dan 60 privéwoningen in heel Portugal van A tot Z — boekingen, conciërge, schoonmaak. Een ander soort villa-bedrijf.' },
    fi: { title: 'Tietoa Portugal Activesta | Luksushuviloiden hallinta Portugalissa',
          description: 'Hoidamme yli 60 yksityistä kotia ympäri Portugalia kokonaisvaltaisesti — varaukset, concierge, siivous. Erilainen huvilayhtiö.' },
    sv: { title: 'Om Portugal Active | Lyxvilla-förvaltning i Portugal',
          description: 'Vi förvaltar 60+ privata hem över hela Portugal från A till Ö — bokningar, concierge, städning. Ett annorlunda villaföretag.' },
  },
  '/contact': {
    en: { title: 'Contact Portugal Active | Plan Your Stay in Portugal',
          description: 'Plan your Portugal stay with our concierge team. Luxury villa rentals, private chef, outdoor adventures. Phone, WhatsApp or email — we reply within 2 hours.' },
    pt: { title: 'Contacto Portugal Active | Planeie a sua estadia em Portugal',
          description: 'Planeie a sua estadia em Portugal com a nossa equipa de concierge. Casas privadas, chef privado, aventuras. Telefone, WhatsApp ou email — resposta em 2 horas.' },
    es: { title: 'Contacto Portugal Active | Planifica tu estancia en Portugal',
          description: 'Planifica tu estancia en Portugal con nuestro equipo de conserjería. Villas privadas, chef privado, aventuras. Teléfono, WhatsApp o email — respondemos en 2 horas.' },
    fr: { title: 'Contact Portugal Active | Planifiez votre séjour au Portugal',
          description: 'Planifiez votre séjour au Portugal avec notre conciergerie. Villas privées, chef privé, aventures. Téléphone, WhatsApp ou email — réponse sous 2 heures.' },
    de: { title: 'Kontakt Portugal Active | Planen Sie Ihren Portugal-Aufenthalt',
          description: 'Planen Sie Ihren Portugal-Aufenthalt mit unserem Concierge-Team. Private Villen, Privatkoch, Abenteuer. Telefon, WhatsApp oder E-Mail — Antwort binnen 2 Stunden.' },
    it: { title: 'Contatta Portugal Active | Pianifica il tuo soggiorno in Portogallo',
          description: 'Pianifica il tuo soggiorno in Portogallo con il nostro team concierge. Ville private, chef privato, avventure. Telefono, WhatsApp o email — rispondiamo in 2 ore.' },
    nl: { title: 'Contact Portugal Active | Plan uw verblijf in Portugal',
          description: 'Plan uw verblijf in Portugal met ons conciërgeteam. Privévilla\'s, privékok, avonturen. Telefoon, WhatsApp of e-mail — antwoord binnen 2 uur.' },
    fi: { title: 'Ota yhteyttä | Portugal Active | Suunnittele Portugalin-lomasi',
          description: 'Suunnittele Portugalin-lomasi concierge-tiimimme kanssa. Yksityiset huvilat, yksityiskokki, seikkailut. Puhelin, WhatsApp tai sähköposti — vastaus 2 tunnissa.' },
    sv: { title: 'Kontakta Portugal Active | Planera din vistelse i Portugal',
          description: 'Planera din Portugalvistelse med vårt concierge-team. Privata villor, privat kock, äventyr. Telefon, WhatsApp eller e-post — svar inom 2 timmar.' },
  },
  '/owners': {
    en: { title: 'Property Management Portugal | Portugal Active for Owners',
          description: 'Maximise your rental income. Full-service villa management — marketing, bookings, housekeeping, maintenance, guest concierge.' },
    pt: { title: 'Gestão de Alojamento Portugal | Portugal Active para Proprietários',
          description: 'Maximize a receita do seu alojamento. Gestão completa — marketing, reservas, limpeza, manutenção, concierge aos hóspedes.' },
    es: { title: 'Gestión de Propiedades Portugal | Portugal Active para Propietarios',
          description: 'Maximiza los ingresos de tu alquiler. Gestión integral — marketing, reservas, limpieza, mantenimiento, conserjería de huéspedes.' },
    fr: { title: 'Gestion Locative Portugal | Portugal Active pour Propriétaires',
          description: 'Maximisez vos revenus locatifs. Gestion complète — marketing, réservations, ménage, maintenance, conciergerie invités.' },
    de: { title: 'Immobilienverwaltung Portugal | Portugal Active für Eigentümer',
          description: 'Maximieren Sie Ihre Mieteinnahmen. Full-Service-Verwaltung — Marketing, Buchungen, Reinigung, Instandhaltung, Gäste-Concierge.' },
    it: { title: 'Gestione Immobiliare Portogallo | Portugal Active per Proprietari',
          description: 'Massimizza i tuoi ricavi da affitto. Gestione completa — marketing, prenotazioni, pulizie, manutenzione, concierge ospiti.' },
    nl: { title: 'Vastgoedbeheer Portugal | Portugal Active voor Eigenaren',
          description: 'Maximaliseer uw verhuurinkomsten. Volledig villabeheer — marketing, boekingen, schoonmaak, onderhoud, gastenconciërge.' },
    fi: { title: 'Kiinteistönhallinta Portugalissa | Portugal Active omistajille',
          description: 'Maksimoi vuokratulosi. Kokonaisvaltainen hallinta — markkinointi, varaukset, siivous, huolto, vieras-concierge.' },
    sv: { title: 'Fastighetsförvaltning Portugal | Portugal Active för Ägare',
          description: 'Maximera dina uthyrningsintäkter. Fullservice-förvaltning — marknadsföring, bokningar, städning, underhåll, gästconcierge.' },
  },
  '/blog': {
    en: { title: 'Portugal Travel Journal | Guides, Tips & Inspiration | Portugal Active',
          description: 'Insider guides to Portugal — best beaches, hidden restaurants, wine regions, and travel tips from our local concierge team.' },
    pt: { title: 'Diário de Viagem Portugal | Guias, Dicas e Inspiração | Portugal Active',
          description: 'Guias insider de Portugal — as melhores praias, restaurantes escondidos, regiões vinhateiras e dicas da nossa equipa local.' },
    es: { title: 'Diario de Viaje Portugal | Guías, Consejos e Inspiración | Portugal Active',
          description: 'Guías insider de Portugal — las mejores playas, restaurantes ocultos, regiones vinícolas y consejos de nuestro equipo local.' },
    fr: { title: 'Journal de Voyage Portugal | Guides, Conseils et Inspiration | Portugal Active',
          description: 'Guides d\'initiés du Portugal — meilleures plages, restaurants cachés, régions viticoles et conseils de notre équipe locale.' },
    de: { title: 'Portugal Reisejournal | Guides, Tipps & Inspiration | Portugal Active',
          description: 'Insider-Guides für Portugal — die besten Strände, versteckte Restaurants, Weinregionen und Reisetipps von unserem lokalen Team.' },
    it: { title: 'Diario di Viaggio Portogallo | Guide, Consigli e Ispirazione | Portugal Active',
          description: 'Guide da insider sul Portogallo — le migliori spiagge, ristoranti nascosti, regioni vinicole e consigli dal nostro team locale.' },
    nl: { title: 'Portugal Reisjournaal | Gidsen, Tips & Inspiratie | Portugal Active',
          description: 'Insider-gidsen van Portugal — beste stranden, verborgen restaurants, wijnregio\'s en reistips van ons lokale conciërgeteam.' },
    fi: { title: 'Portugal-matkapäiväkirja | Oppaat, Vinkit ja Inspiraatio | Portugal Active',
          description: 'Insider-oppaat Portugaliin — parhaat rannat, piilotetut ravintolat, viinialueet ja matkavinkit paikalliselta concierge-tiimiltämme.' },
    sv: { title: 'Portugal Resejournal | Guider, Tips & Inspiration | Portugal Active',
          description: 'Insider-guider till Portugal — bästa stränderna, dolda restauranger, vindistrikt och resetips från vårt lokala concierge-team.' },
  },
  '/faq': {
    en: { title: 'FAQ | Portugal Active',
          description: 'Answers to common questions about booking, cancellation, check-in, concierge services, and villa management with Portugal Active.' },
    pt: { title: 'Perguntas Frequentes | Portugal Active',
          description: 'Respostas às questões mais comuns sobre reservas, cancelamento, check-in, serviços de concierge e gestão de casas com a Portugal Active.' },
    es: { title: 'Preguntas Frecuentes | Portugal Active',
          description: 'Respuestas a preguntas comunes sobre reservas, cancelación, check-in, conserjería y gestión de villas con Portugal Active.' },
    fr: { title: 'FAQ | Portugal Active',
          description: 'Réponses aux questions courantes sur les réservations, annulation, arrivée, conciergerie et gestion de villas avec Portugal Active.' },
    de: { title: 'FAQ | Portugal Active',
          description: 'Antworten auf häufige Fragen zu Buchung, Stornierung, Check-in, Concierge-Services und Villa-Management mit Portugal Active.' },
    it: { title: 'Domande Frequenti | Portugal Active',
          description: 'Risposte alle domande comuni su prenotazioni, cancellazione, check-in, servizi concierge e gestione ville con Portugal Active.' },
    nl: { title: 'Veelgestelde Vragen | Portugal Active',
          description: 'Antwoorden op veelgestelde vragen over boeken, annuleren, inchecken, conciërgediensten en villabeheer met Portugal Active.' },
    fi: { title: 'UKK | Portugal Active',
          description: 'Vastaukset yleisimpiin kysymyksiin varauksista, peruutuksista, sisäänkirjautumisesta, concierge-palveluista ja huviloiden hallinnasta.' },
    sv: { title: 'Vanliga Frågor | Portugal Active',
          description: 'Svar på vanliga frågor om bokning, avbokning, incheckning, concierge-tjänster och villaförvaltning med Portugal Active.' },
  },
  '/careers': {
    en: { title: 'Careers at Portugal Active | Join Our Hospitality Team',
          description: 'Work in luxury hospitality across Portugal. Open roles in concierge, property management, and guest experience. Join the Portugal Active team.' },
    pt: { title: 'Carreiras na Portugal Active | Junta-te à Nossa Equipa',
          description: 'Trabalha na hotelaria de luxo em Portugal. Vagas em concierge, gestão de propriedades e experiência do hóspede. Junta-te à equipa Portugal Active.' },
  },
  '/concierge': {
    en: { title: 'Luxury Concierge Services | Private Chef, Spa, Transfers | Portugal Active',
          description: 'Elevate your villa stay with private chef, in-house spa, airport transfers, and bespoke experiences. Book alongside your villa.' },
  },
  '/legal/privacy': {
    en: { title: 'Privacy Policy | Portugal Active',
          description: 'How Portugal Active collects, uses and protects your personal data. GDPR compliant.' },
  },
  '/legal/terms': {
    en: { title: 'Terms & Conditions | Portugal Active',
          description: 'Terms and conditions for booking holiday properties and experiences with Portugal Active.' },
  },
  '/legal/cookies': {
    en: { title: 'Cookie Policy | Portugal Active',
          description: 'How Portugal Active uses cookies to improve your browsing experience.' },
  },
};

/** Look up localized meta for a static path with graceful fallback to English. */
function getPageMeta(path: string, lang: string): MetaEntry | null {
  const entry = PAGE_META[path];
  if (!entry) return null;
  return entry[lang] ?? entry.en ?? null;
}

function injectMeta(html: string, meta: {
  title: string;
  description: string;
  image?: string;
  url: string;
  type?: string;
}): string {
  const title = escText(meta.title);
  const description = escAttr(meta.description);
  const image = escAttr(meta.image ?? 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/hero-main-96HXfBCK752avi2daWhgmd.webp');
  const url = escAttr(meta.url);
  const type = escAttr(meta.type ?? 'website');

  return html
    .replace(/(<title>)[^<]*(<\/title>)/, (_m, open, close) => `${open}${title}${close}`)
    .replace(/(<meta name="description" content=")[^"]*(")/,          (_m, open, close) => `${open}${description}${close}`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/,                 (_m, open, close) => `${open}${url}${close}`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/,         (_m, open, close) => `${open}${title}${close}`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/,   (_m, open, close) => `${open}${description}${close}`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/,         (_m, open, close) => `${open}${image}${close}`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/,           (_m, open, close) => `${open}${url}${close}`)
    .replace(/(<meta property="og:type" content=")[^"]*(")/,          (_m, open, close) => `${open}${type}${close}`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/,        (_m, open, close) => `${open}${title}${close}`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/,  (_m, open, close) => `${open}${description}${close}`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/,        (_m, open, close) => `${open}${image}${close}`);
}

const DESTINATION_NAME: Record<string, string> = {
  'minho': 'Minho Coast',
  'porto': 'Porto & Douro',
  'lisbon': 'Lisbon',
  'alentejo': 'Alentejo',
  'algarve': 'Algarve',
};

/** Title template for a destination landing page, per language. */
const DESTINATION_TITLE: Record<string, (name: string) => string> = {
  en: n => `${n} Portugal | Luxury Villas and Experiences | Portugal Active`,
  pt: n => `${n}, Portugal | Casas de Luxo e Experiências | Portugal Active`,
  es: n => `${n}, Portugal | Villas de Lujo y Experiencias | Portugal Active`,
  fr: n => `${n}, Portugal | Villas de Luxe et Expériences | Portugal Active`,
  de: n => `${n}, Portugal | Luxusvillen und Erlebnisse | Portugal Active`,
  it: n => `${n}, Portogallo | Ville di Lusso ed Esperienze | Portugal Active`,
  nl: n => `${n}, Portugal | Luxevilla\'s en Ervaringen | Portugal Active`,
  fi: n => `${n}, Portugali | Luksushuvilat ja Elämykset | Portugal Active`,
  sv: n => `${n}, Portugal | Lyxvillor och Upplevelser | Portugal Active`,
};

/** Destination descriptions, per destination × language. */
const DESTINATION_DESCRIPTION: Record<string, Record<string, string>> = {
  minho: {
    en: 'Luxury villas on the Minho Coast, Portugal. Wild beaches, green valleys, and historic quintas — the undiscovered north.',
    pt: 'Casas de luxo na Costa do Minho, Portugal. Praias selvagens, vales verdes e quintas históricas — o norte por descobrir.',
    es: 'Villas de lujo en la Costa del Miño, Portugal. Playas salvajes, valles verdes y quintas históricas — el norte por descubrir.',
    fr: 'Villas de luxe sur la Côte du Minho, Portugal. Plages sauvages, vallées vertes et quintas historiques — le nord à découvrir.',
    de: 'Luxusvillen an der Minho-Küste, Portugal. Wilde Strände, grüne Täler und historische Quintas — der unentdeckte Norden.',
    it: 'Ville di lusso sulla Costa del Minho, Portogallo. Spiagge selvagge, valli verdi e quintas storiche — il nord da scoprire.',
    nl: 'Luxevilla\'s aan de Minho-kust, Portugal. Wilde stranden, groene valleien en historische quintas — het ongekende noorden.',
    fi: 'Luksushuvilat Minhon rannikolla, Portugalissa. Villejä rantoja, vihreitä laaksoja ja historiallisia quinta-kartanoita — tuntematon pohjoinen.',
    sv: 'Lyxvillor längs Minhokusten, Portugal. Vilda stränder, gröna dalar och historiska quintas — det oupptäckta norra.',
  },
  porto: {
    en: 'Luxury villas in Porto and the Douro Valley, Portugal. Wine estates, city breaks, and river views.',
    pt: 'Casas de luxo no Porto e no Vale do Douro, Portugal. Quintas de vinho, escapadas urbanas e vistas de rio.',
    es: 'Villas de lujo en Oporto y el Valle del Duero, Portugal. Quintas vinícolas, escapadas urbanas y vistas al río.',
    fr: 'Villas de luxe à Porto et dans la Vallée du Douro, Portugal. Domaines viticoles, city breaks et vues fluviales.',
    de: 'Luxusvillen in Porto und im Douro-Tal, Portugal. Weingüter, Städtereisen und Flussblicke.',
    it: 'Ville di lusso a Porto e nella Valle del Douro, Portogallo. Tenute vinicole, city break e viste sul fiume.',
    nl: 'Luxevilla\'s in Porto en de Douro-vallei, Portugal. Wijnlandgoederen, stedentrips en uitzicht op de rivier.',
    fi: 'Luksushuvilat Portossa ja Douron laaksossa, Portugalissa. Viinitilat, kaupunkilomat ja jokimaisemat.',
    sv: 'Lyxvillor i Porto och Dourodalen, Portugal. Vingårdar, citybreaks och flodutsikter.',
  },
  lisbon: {
    en: 'Luxury villas near Lisbon, Portugal. Sintra, Cascais, and the Atlantic coast — cultural capital meets beach escape.',
    pt: 'Casas de luxo perto de Lisboa, Portugal. Sintra, Cascais e a costa atlântica — capital cultural encontra fuga de praia.',
    es: 'Villas de lujo cerca de Lisboa, Portugal. Sintra, Cascais y la costa atlántica — capital cultural y escapada de playa.',
    fr: 'Villas de luxe près de Lisbonne, Portugal. Sintra, Cascais et la côte atlantique — capitale culturelle et escapade balnéaire.',
    de: 'Luxusvillen bei Lissabon, Portugal. Sintra, Cascais und die Atlantikküste — Kulturhauptstadt trifft Strandflucht.',
    it: 'Ville di lusso vicino a Lisbona, Portogallo. Sintra, Cascais e la costa atlantica — capitale culturale e fuga al mare.',
    nl: 'Luxevilla\'s vlakbij Lissabon, Portugal. Sintra, Cascais en de Atlantische kust — culturele hoofdstad ontmoet strandvakantie.',
    fi: 'Luksushuvilat lähellä Lissabonia, Portugalissa. Sintra, Cascais ja Atlantin rannikko — kulttuuripääkaupunki kohtaa rantaloman.',
    sv: 'Lyxvillor nära Lissabon, Portugal. Sintra, Cascais och Atlantkusten — kulturhuvudstad möter strandsemester.',
  },
  alentejo: {
    en: 'Luxury villas in Alentejo, Portugal. Endless plains, cork forests, and slow-travel at its finest.',
    pt: 'Casas de luxo no Alentejo, Portugal. Planícies infinitas, montados de sobro e o melhor do slow travel.',
    es: 'Villas de lujo en Alentejo, Portugal. Llanuras infinitas, bosques de alcornoques y slow travel en su máxima expresión.',
    fr: 'Villas de luxe dans l\'Alentejo, Portugal. Plaines infinies, forêts de chêne-liège et slow travel par excellence.',
    de: 'Luxusvillen im Alentejo, Portugal. Endlose Ebenen, Korkeichenwälder und Slow Travel in Bestform.',
    it: 'Ville di lusso nell\'Alentejo, Portogallo. Pianure infinite, foreste di sughero e slow travel al suo meglio.',
    nl: 'Luxevilla\'s in Alentejo, Portugal. Eindeloze vlaktes, kurkeikbossen en slow travel op zijn best.',
    fi: 'Luksushuvilat Alentejossa, Portugalissa. Loputtomia lakeuksia, korkkitammimetsiä ja rauhallista matkailua parhaimmillaan.',
    sv: 'Lyxvillor i Alentejo, Portugal. Oändliga slätter, korkekskogar och slow travel när den är som bäst.',
  },
  algarve: {
    en: 'Luxury villas in the Algarve, Portugal. Clifftop retreats, golden beaches, and year-round sunshine.',
    pt: 'Casas de luxo no Algarve, Portugal. Retiros à beira-mar, praias douradas e sol todo o ano.',
    es: 'Villas de lujo en el Algarve, Portugal. Retiros en acantilados, playas doradas y sol todo el año.',
    fr: 'Villas de luxe en Algarve, Portugal. Retraites en haut de falaise, plages dorées et soleil toute l\'année.',
    de: 'Luxusvillen an der Algarve, Portugal. Klippen-Refugien, goldene Strände und Sonne das ganze Jahr.',
    it: 'Ville di lusso in Algarve, Portogallo. Rifugi a picco sul mare, spiagge dorate e sole tutto l\'anno.',
    nl: 'Luxevilla\'s in de Algarve, Portugal. Kliftoppen, gouden stranden en zon het hele jaar door.',
    fi: 'Luksushuvilat Algarvessa, Portugalissa. Kalliopaikat, kultaiset rannat ja aurinkoa ympäri vuoden.',
    sv: 'Lyxvillor i Algarve, Portugal. Klippretreater, gyllene stränder och sol året runt.',
  },
};

/* ── Localized templates for dynamic DB-driven routes ─────────────────────
   Property, experience, service and blog pages pull titles/descriptions
   from Drizzle. Only English SEO text lives in DB, so we wrap the English
   brand name / post title with per-language framing to localize meta for
   the 8 other languages. Proper names (property "Casa do Minho", post
   titles) stay in the original language — only the framing is translated. */

/** Label for a destination slug in the visitor's language. Used in property
 *  meta (e.g. "in Minho Coast, Portugal"). Keeps region name untranslated
 *  where it's a proper noun (Minho, Alentejo, Algarve); translates "Coast",
 *  "Porto & Douro", "Lisbon". */
const DEST_LABEL: Record<string, Record<string, string>> = {
  minho: {
    en: 'Minho Coast', pt: 'Costa do Minho', es: 'Costa del Miño', fr: 'Côte du Minho',
    de: 'Minho-Küste', it: 'Costa del Minho', nl: 'Minho-kust', fi: 'Minhon rannikko',
    sv: 'Minhokusten',
  },
  porto: {
    en: 'Porto & Douro', pt: 'Porto e Douro', es: 'Oporto y Duero', fr: 'Porto et Douro',
    de: 'Porto & Douro', it: 'Porto e Douro', nl: 'Porto & Douro', fi: 'Porto ja Douro',
    sv: 'Porto & Douro',
  },
  lisbon: {
    en: 'Lisbon', pt: 'Lisboa', es: 'Lisboa', fr: 'Lisbonne', de: 'Lissabon',
    it: 'Lisbona', nl: 'Lissabon', fi: 'Lissabon', sv: 'Lissabon',
  },
  alentejo: {
    en: 'Alentejo', pt: 'Alentejo', es: 'Alentejo', fr: 'Alentejo', de: 'Alentejo',
    it: 'Alentejo', nl: 'Alentejo', fi: 'Alentejo', sv: 'Alentejo',
  },
  algarve: {
    en: 'Algarve', pt: 'Algarve', es: 'Algarve', fr: 'Algarve', de: 'Algarve',
    it: 'Algarve', nl: 'Algarve', fi: 'Algarve', sv: 'Algarve',
  },
};

function destLabel(slug: string | null | undefined, lang: string): string {
  if (!slug) return '';
  const key = slug.toLowerCase();
  return DEST_LABEL[key]?.[lang] ?? DEST_LABEL[key]?.en ?? slug;
}

/** Property title: "{name} | {bedrooms}-bedroom villa in {destination} | Portugal Active" (per-lang). */
const PROPERTY_TITLE: Record<string, (p: { name: string; bedrooms?: number | null; destination: string }) => string> = {
  en: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `${bedrooms}-Bedroom ` : '';
    return `${name} | ${b}Luxury Villa in ${destLabel(destination, 'en')} | Portugal Active`;
  },
  pt: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `T${bedrooms} ` : '';
    return `${name} | Casa de Luxo ${b}em ${destLabel(destination, 'pt')} | Portugal Active`;
  },
  es: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `de ${bedrooms} dormitorios ` : '';
    return `${name} | Villa de Lujo ${b}en ${destLabel(destination, 'es')} | Portugal Active`;
  },
  fr: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `${bedrooms} chambres ` : '';
    return `${name} | Villa de Luxe ${b}à ${destLabel(destination, 'fr')} | Portugal Active`;
  },
  de: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `${bedrooms}-Schlafzimmer-` : '';
    return `${name} | ${b}Luxusvilla in ${destLabel(destination, 'de')} | Portugal Active`;
  },
  it: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `con ${bedrooms} camere da letto ` : '';
    return `${name} | Villa di Lusso ${b}in ${destLabel(destination, 'it')} | Portugal Active`;
  },
  nl: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `met ${bedrooms} slaapkamers ` : '';
    return `${name} | Luxevilla ${b}in ${destLabel(destination, 'nl')} | Portugal Active`;
  },
  fi: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `${bedrooms} makuuhuoneen ` : '';
    return `${name} | ${b}Luksushuvila – ${destLabel(destination, 'fi')} | Portugal Active`;
  },
  sv: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `med ${bedrooms} sovrum ` : '';
    return `${name} | Lyxvilla ${b}i ${destLabel(destination, 'sv')} | Portugal Active`;
  },
};

/** Property description template. Uses tagline if available, else generates
 *  a descriptive sentence. Closes with a localized CTA. Trimmed to 155 chars. */
const PROPERTY_DESCRIPTION: Record<string, (p: { tagline?: string | null; bedrooms?: number | null; maxGuests?: number | null; destination: string; name: string }) => string> = {
  en: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `${bedrooms ? `${bedrooms}-bedroom ` : ''}luxury villa in ${destLabel(destination, 'en')}${maxGuests ? ` for up to ${maxGuests} guests` : ''}.`;
    return `${base} Private chef, concierge, housekeeping included. Book ${name} direct with Portugal Active.`;
  },
  pt: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Casa de luxo ${bedrooms ? `T${bedrooms} ` : ''}em ${destLabel(destination, 'pt')}${maxGuests ? ` para até ${maxGuests} hóspedes` : ''}.`;
    return `${base} Chef privado, concierge e limpeza incluídos. Reserve ${name} direto com a Portugal Active.`;
  },
  es: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Villa de lujo ${bedrooms ? `de ${bedrooms} dormitorios ` : ''}en ${destLabel(destination, 'es')}${maxGuests ? ` para hasta ${maxGuests} huéspedes` : ''}.`;
    return `${base} Chef privado, conserjería y limpieza incluidos. Reserva ${name} directo con Portugal Active.`;
  },
  fr: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Villa de luxe ${bedrooms ? `${bedrooms} chambres ` : ''}à ${destLabel(destination, 'fr')}${maxGuests ? ` jusqu'à ${maxGuests} personnes` : ''}.`;
    return `${base} Chef privé, conciergerie et ménage inclus. Réservez ${name} en direct avec Portugal Active.`;
  },
  de: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Luxusvilla ${bedrooms ? `mit ${bedrooms} Schlafzimmern ` : ''}in ${destLabel(destination, 'de')}${maxGuests ? ` für bis zu ${maxGuests} Gäste` : ''}.`;
    return `${base} Privatkoch, Concierge und Reinigung inklusive. Buchen Sie ${name} direkt bei Portugal Active.`;
  },
  it: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Villa di lusso ${bedrooms ? `con ${bedrooms} camere ` : ''}in ${destLabel(destination, 'it')}${maxGuests ? ` fino a ${maxGuests} ospiti` : ''}.`;
    return `${base} Chef privato, concierge e pulizie inclusi. Prenota ${name} diretto con Portugal Active.`;
  },
  nl: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Luxevilla ${bedrooms ? `met ${bedrooms} slaapkamers ` : ''}in ${destLabel(destination, 'nl')}${maxGuests ? ` tot ${maxGuests} gasten` : ''}.`;
    return `${base} Privékok, conciërge en schoonmaak inbegrepen. Boek ${name} direct bij Portugal Active.`;
  },
  fi: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Luksushuvila ${bedrooms ? `${bedrooms} makuuhuoneella ` : ''}kohteessa ${destLabel(destination, 'fi')}${maxGuests ? `, jopa ${maxGuests} hengelle` : ''}.`;
    return `${base} Yksityiskokki, concierge ja siivous sisältyy. Varaa ${name} suoraan Portugal Activesta.`;
  },
  sv: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Lyxvilla ${bedrooms ? `med ${bedrooms} sovrum ` : ''}i ${destLabel(destination, 'sv')}${maxGuests ? ` för upp till ${maxGuests} gäster` : ''}.`;
    return `${base} Privat kock, concierge och städning ingår. Boka ${name} direkt med Portugal Active.`;
  },
};

/** Experience title template. */
const EXPERIENCE_TITLE: Record<string, (e: { name: string; destination?: string | null }) => string> = {
  en: ({ name, destination }) => destination ? `${name} in ${destLabel(destination, 'en')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
  pt: ({ name, destination }) => destination ? `${name} em ${destLabel(destination, 'pt')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
  es: ({ name, destination }) => destination ? `${name} en ${destLabel(destination, 'es')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
  fr: ({ name, destination }) => destination ? `${name} à ${destLabel(destination, 'fr')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
  de: ({ name, destination }) => destination ? `${name} in ${destLabel(destination, 'de')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
  it: ({ name, destination }) => destination ? `${name} a ${destLabel(destination, 'it')}, Portogallo | Portugal Active` : `${name} | Portugal Active`,
  nl: ({ name, destination }) => destination ? `${name} in ${destLabel(destination, 'nl')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
  fi: ({ name, destination }) => destination ? `${name} – ${destLabel(destination, 'fi')}, Portugali | Portugal Active` : `${name} | Portugal Active`,
  sv: ({ name, destination }) => destination ? `${name} i ${destLabel(destination, 'sv')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
};

/** Experience description: preserve tagline if present; otherwise generate. */
const EXPERIENCE_DESCRIPTION: Record<string, (e: { name: string; tagline?: string | null; duration?: string | null; destination?: string | null }) => string> = {
  en: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` in ${destLabel(destination, 'en')}` : ''}. Guided by local experts. Book direct with Portugal Active.`,
  pt: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` em ${destLabel(destination, 'pt')}` : ''}. Guiado por especialistas locais. Reserve direto com a Portugal Active.`,
  es: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` en ${destLabel(destination, 'es')}` : ''}. Guiado por expertos locales. Reserva directa con Portugal Active.`,
  fr: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` à ${destLabel(destination, 'fr')}` : ''}. Guidé par des experts locaux. Réservation directe avec Portugal Active.`,
  de: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` in ${destLabel(destination, 'de')}` : ''}. Geführt von lokalen Experten. Direkt bei Portugal Active buchen.`,
  it: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` a ${destLabel(destination, 'it')}` : ''}. Guidato da esperti locali. Prenota diretto con Portugal Active.`,
  nl: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` in ${destLabel(destination, 'nl')}` : ''}. Begeleid door lokale experts. Direct boeken bij Portugal Active.`,
  fi: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` kohteessa ${destLabel(destination, 'fi')}` : ''}. Paikallisten asiantuntijoiden opastama. Varaa suoraan Portugal Activesta.`,
  sv: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` i ${destLabel(destination, 'sv')}` : ''}. Guidad av lokala experter. Boka direkt med Portugal Active.`,
};

/** Service title. */
const SERVICE_TITLE: Record<string, (s: { name: string }) => string> = {
  en: ({ name }) => `${name} | Luxury Villa Concierge Service | Portugal Active`,
  pt: ({ name }) => `${name} | Serviço de Concierge para Casas de Luxo | Portugal Active`,
  es: ({ name }) => `${name} | Servicio de Conserjería para Villas de Lujo | Portugal Active`,
  fr: ({ name }) => `${name} | Conciergerie pour Villas de Luxe | Portugal Active`,
  de: ({ name }) => `${name} | Concierge-Service für Luxusvillen | Portugal Active`,
  it: ({ name }) => `${name} | Concierge per Ville di Lusso | Portugal Active`,
  nl: ({ name }) => `${name} | Conciërgedienst voor Luxevilla's | Portugal Active`,
  fi: ({ name }) => `${name} | Luksushuviloiden Concierge-palvelu | Portugal Active`,
  sv: ({ name }) => `${name} | Concierge-tjänst för Lyxvillor | Portugal Active`,
};

const SERVICE_DESCRIPTION: Record<string, (s: { name: string; tagline?: string | null; duration?: string | null }) => string> = {
  en: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Add to any Portugal Active villa stay. Book alongside your villa.`,
  pt: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Acrescente a qualquer estadia Portugal Active. Reserve junto com a sua casa.`,
  es: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Añade a cualquier estancia Portugal Active. Reserva junto con tu villa.`,
  fr: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Ajoutez à tout séjour Portugal Active. Réservez avec votre villa.`,
  de: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Zu jedem Portugal-Active-Aufenthalt hinzufügen. Zusammen mit Ihrer Villa buchen.`,
  it: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Aggiungi a qualsiasi soggiorno Portugal Active. Prenota insieme alla tua villa.`,
  nl: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Voeg toe aan elk Portugal Active-verblijf. Boek samen met je villa.`,
  fi: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Lisää mihin tahansa Portugal Active -huvilalomaan. Varaa huvilasi kanssa.`,
  sv: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Lägg till vid valfri Portugal Active-vistelse. Boka tillsammans med din villa.`,
};

/** Blog title suffix — blog content is written in English, so we keep the
 *  post title as-written but swap the suffix/description framing. */
const BLOG_SUFFIX: Record<string, string> = {
  en: ' | Portugal Active Journal',
  pt: ' | Diário Portugal Active',
  es: ' | Diario Portugal Active',
  fr: ' | Journal Portugal Active',
  de: ' | Portugal Active Journal',
  it: ' | Journal Portugal Active',
  nl: ' | Portugal Active Journal',
  fi: ' | Portugal Active -päiväkirja',
  sv: ' | Portugal Active-journalen',
};

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use("/assets", express.static(path.join(distPath, "assets"), {
    maxAge: "1y",
    immutable: true,
  }));

  app.use(express.static(distPath, {
    maxAge: "1h",
  }));

  const SUPPORTED_LANGS = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];

  const KNOWN_ROUTES = new Set([
    "/", "/homes", "/about", "/contact", "/services", "/adventures",
    "/events", "/blog", "/faq", "/careers", "/owners", "/login", "/account",
    "/legal/privacy", "/legal/terms", "/legal/cookies", "/admin", "/404",
    "/destinations", "/experiences", "/concierge",
  ]);
  const KNOWN_PREFIXES = ["/homes/", "/destinations/", "/blog/", "/services/", "/admin/", "/booking/", "/experiences/", "/activities/"];

  /** Strip locale prefix from path: /pt/homes → /homes */
  function stripLocale(pathname: string): string {
    const segments = pathname.split('/').filter(Boolean);
    if (segments[0] && SUPPORTED_LANGS.includes(segments[0].toLowerCase())) {
      return '/' + segments.slice(1).join('/') || '/';
    }
    return pathname;
  }

  // Redirect bare paths to locale-prefixed paths for SEO
  app.use("*", async (req, res, next) => {
    const p = req.originalUrl.split("?")[0];
    const segments = p.split('/').filter(Boolean);

    // If first segment is a supported locale, continue
    if (segments[0] && SUPPORTED_LANGS.includes(segments[0].toLowerCase())) {
      return next();
    }

    // If it's an asset, API, or static file request, skip
    if (p.startsWith('/assets/') || p.startsWith('/api/') || p.includes('.')) {
      return next();
    }

    // Redirect to /en/ prefixed version
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(301, `/en${p === '/' ? '' : p}${query}`);
  });

  /** Extract the locale prefix from a path. Returns 'en' as fallback. */
  function extractLang(pathname: string): string {
    const first = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
    return first && SUPPORTED_LANGS.includes(first) ? first : 'en';
  }

  app.use("*", async (req, res) => {
    const rawPath = req.originalUrl.split("?")[0];
    const p = stripLocale(rawPath);
    const lang = extractLang(rawPath);
    const isKnown = KNOWN_ROUTES.has(p) || KNOWN_PREFIXES.some(pre => p.startsWith(pre));
    const status = isKnown ? 200 : 404;
    const indexPath = path.resolve(distPath, "index.html");

    // Load the shell (cached after first read).
    let html: string;
    try {
      if (_cachedIndexHtml === null) {
        _cachedIndexHtml = fs.readFileSync(indexPath, "utf-8");
      }
      html = _cachedIndexHtml;
    } catch {
      return res.status(status).sendFile(indexPath);
    }

    // Always inject locale tags — hreflang alternates, canonical, og:url,
    // og:locale, and <html lang>. This is the critical SEO fix: every
    // /{lang}/{path} response tells Google it's a distinct indexable version.
    html = injectLocaleTags(html, { lang, pagePath: p });

    // For bots, additionally inject localized title/description per route.
    const isBot = isBotRequest(req);
    if (!isBot) {
      return res.status(status).set("Content-Type", "text/html").send(html);
    }

    try {
      // Static routes → localized title/description
      const localized = getPageMeta(p, lang);
      if (localized) {
        html = injectMeta(html, {
          title: localized.title,
          description: localized.description,
          url: `${BOT_BASE_URL}/${lang}${p === '/' ? '' : p}`,
        });
        return res.status(status).set("Content-Type", "text/html").send(html);
      }

      // /homes/:slug — localized title + description via per-lang templates
      const homesMatch = p.match(/^\/homes\/([^/]+)$/);
      if (homesMatch) {
        const { getPropertyBySlug } = await import("../db");
        const prop = await getPropertyBySlug(homesMatch[1]);
        if (prop) {
          // For English, prefer hand-crafted DB seoTitle/seoDescription when set.
          const useDbEn = lang === 'en' && (prop.seoTitle || prop.seoDescription);
          const titleFn = PROPERTY_TITLE[lang] ?? PROPERTY_TITLE.en;
          const descFn = PROPERTY_DESCRIPTION[lang] ?? PROPERTY_DESCRIPTION.en;
          const title = useDbEn && prop.seoTitle
            ? prop.seoTitle
            : titleFn({ name: prop.name, bedrooms: prop.bedrooms, destination: prop.destination });
          const rawDesc = useDbEn && prop.seoDescription
            ? prop.seoDescription
            : descFn({ tagline: prop.tagline, bedrooms: prop.bedrooms, maxGuests: prop.maxGuests, destination: prop.destination, name: prop.name });
          const description = rawDesc.replace(/\s+/g, ' ').trim().slice(0, 155);
          html = injectMeta(html, {
            title,
            description,
            image: (prop.images as string[] | null)?.[0],
            url: `${BOT_BASE_URL}/${lang}/homes/${prop.slug}`,
            type: 'place',
          });
        }
        return res.status(status).set("Content-Type", "text/html").send(html);
      }

      // /blog/:slug — localize suffix + fall back to auto-excerpt. Post title
      // stays in its original language (blog content isn't translated).
      const blogMatch = p.match(/^\/blog\/([^/]+)$/);
      if (blogMatch) {
        const { getBlogPostBySlug } = await import("../db");
        const post = await getBlogPostBySlug(blogMatch[1]);
        if (post) {
          const suffix = BLOG_SUFFIX[lang] ?? BLOG_SUFFIX.en;
          // For English, prefer DB seoTitle verbatim; for other langs, swap the suffix.
          const title = lang === 'en'
            ? (post.seoTitle || `${post.title}${suffix}`)
            : `${post.title}${suffix}`;
          const description = (lang === 'en' && post.seoDescription)
            ? post.seoDescription
            : (post.excerpt ?? post.seoDescription ?? '').slice(0, 155);
          html = injectMeta(html, {
            title,
            description,
            image: post.coverImage ?? undefined,
            url: `${BOT_BASE_URL}/${lang}/blog/${post.slug}`,
            type: 'article',
          });
        }
        return res.status(status).set("Content-Type", "text/html").send(html);
      }

      // /destinations/:slug
      const destMatch = p.match(/^\/destinations\/([^/]+)$/);
      if (destMatch) {
        const slug = destMatch[1];
        const name = DESTINATION_NAME[slug];
        const desc = DESTINATION_DESCRIPTION[slug]?.[lang] ?? DESTINATION_DESCRIPTION[slug]?.en;
        const titleFn = DESTINATION_TITLE[lang] ?? DESTINATION_TITLE.en;
        if (name && desc) {
          html = injectMeta(html, {
            title: titleFn(name),
            description: desc,
            url: `${BOT_BASE_URL}/${lang}/destinations/${slug}`,
          });
        }
        return res.status(status).set("Content-Type", "text/html").send(html);
      }

      // /services/:slug — localized concierge service meta
      const serviceMatch = p.match(/^\/services\/([^/]+)$/);
      if (serviceMatch) {
        const { getServiceBySlug } = await import("../db");
        const svc = await getServiceBySlug(serviceMatch[1]);
        if (svc) {
          const titleFn = SERVICE_TITLE[lang] ?? SERVICE_TITLE.en;
          const descFn = SERVICE_DESCRIPTION[lang] ?? SERVICE_DESCRIPTION.en;
          html = injectMeta(html, {
            title: titleFn({ name: svc.name }),
            description: descFn({ name: svc.name, tagline: svc.tagline, duration: svc.duration }).replace(/\s+/g, ' ').trim().slice(0, 155),
            image: svc.image ?? undefined,
            url: `${BOT_BASE_URL}/${lang}/services/${svc.slug}`,
          });
        }
        return res.status(status).set("Content-Type", "text/html").send(html);
      }

      // /experiences/:slug and /activities/:slug (legacy alias) — same handler
      const expMatch = p.match(/^\/(?:experiences|activities)\/([^/]+)$/);
      if (expMatch) {
        const { getExperienceBySlug } = await import("../db");
        const exp = await getExperienceBySlug(expMatch[1]);
        if (exp) {
          const titleFn = EXPERIENCE_TITLE[lang] ?? EXPERIENCE_TITLE.en;
          const descFn = EXPERIENCE_DESCRIPTION[lang] ?? EXPERIENCE_DESCRIPTION.en;
          html = injectMeta(html, {
            title: titleFn({ name: exp.name, destination: exp.destination }),
            description: descFn({ name: exp.name, tagline: exp.tagline, duration: exp.duration, destination: exp.destination }).replace(/\s+/g, ' ').trim().slice(0, 155),
            image: exp.image ?? undefined,
            url: `${BOT_BASE_URL}/${lang}${p}`,
          });
        }
        return res.status(status).set("Content-Type", "text/html").send(html);
      }
    } catch (err) {
      console.error("[BotMeta] Error injecting meta:", err);
    }

    // Fallback: send HTML with only the locale tags applied.
    res.status(status).set("Content-Type", "text/html").send(html);
  });
}
