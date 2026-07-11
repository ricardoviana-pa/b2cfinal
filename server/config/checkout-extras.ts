/**
 * Checkout 2.0 — catálogo do passo "Personalizar" (Fase 2, spec v1.2 §5).
 *
 * Uma única fonte de verdade, ligada ao catálogo real do site: nomes, preços e
 * fotografias reais (nada inventado só para o checkout — §5.3). Preços
 * INDICATIVOS até validação com a Susana/Diogo (§15.6).
 *
 * Estrutura narrativa em capítulos (§5): A chegada · A casa · A mesa ·
 * Bem-estar · Experiências. A receção é uma escolha OBRIGATÓRIA no topo de
 * "A chegada" (§5.2), não um card normal.
 *
 * pricing_model: per_stay | per_day | per_person | per_unit | per_person_per_unit | on_request
 * fulfillment:   instant (vai direto ao manifesto) | needs_confirmation
 *                (cobra hoje, reembolso automático da linha em 24h se não
 *                entregável — §7) | on_request (sem preço, pedido ao concierge)
 */

export type ExtraPricingModel =
  | "per_stay"
  | "per_day"
  | "per_person"
  | "per_unit"
  | "per_person_per_unit"
  | "on_request";

export type ExtraFulfillment = "instant" | "needs_confirmation" | "on_request";

export type ExtraChapter = "arrival" | "home" | "table" | "wellness" | "experiences";

export const EXTRA_CHAPTERS: ExtraChapter[] = [
  "arrival",
  "home",
  "table",
  "wellness",
  "experiences",
];

export interface CheckoutExtra {
  sku: string;
  chapter: ExtraChapter;
  pricingModel: ExtraPricingModel;
  fulfillment: ExtraFulfillment;
  /** EUR, inteiros. Ausente para on_request. */
  unitPrice?: number;
  minQty?: number;
  maxQty?: number;
  minPeople?: number;
  /** "Mais escolhido" — no máximo 2 no catálogo (§5.3) */
  popular?: boolean;
  /** Fotografia real 3:2 (§9). Reutiliza as imagens do catálogo do site. */
  photo: string;
  /** Curadoria: ranking base (menor = mais acima) antes das regras dinâmicas */
  baseRank: number;
}

/**
 * Receção — escolha obrigatória (§5.2). Self incluído; presencial paga, com o
 * horário como modificador de preço (após as 21h). O antigo "late-checkin" some
 * como extra avulso.
 */
export const CHECKOUT_RECEPTION = {
  hostedPrice: 50,
  hostedLatePrice: 90,
  /** Hora (24h) a partir da qual a receção presencial passa a tarifa noturna */
  lateFromHour: 21,
  photoSelf: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80",
  photoHosted: "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=1200&q=80",
};

/**
 * "Incluído na sua estadia" — abre o passo Personalizar (§5). Chaves i18n
 * resolvidas no cliente (checkout.included.<key>).
 */
export const CHECKOUT_INCLUDED_KEYS = [
  "concierge",
  "linen",
  "welcome",
  "bestRate",
] as const;

const IMG = {
  chef: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=1200&q=80",
  massage: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1200&q=80",
  yoga: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1200&q=80",
  trainer: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1200&q=80",
  transfer: "/experiences/pa-mobility-maybach.webp",
  cleaning: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80",
  linen: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=1200&q=80",
  hamperEssentials: "https://images.unsplash.com/photo-1553546895-531931aa1aa8?w=1200&q=80",
  hamperGourmet: "https://images.unsplash.com/photo-1516100882582-96c3a05fe590?w=1200&q=80",
  grocery: "https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=1200&q=80",
  babysitter: "https://images.unsplash.com/photo-1476703993599-0035a21b17a9?w=1200&q=80",
  // atividades reais do site (services.json → activities)
  sup: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=1200&q=80",
  canyoning: "/experiences/canyoning-adventure.webp",
  ebike: "/experiences/ebike-tours/cover.webp",
  horseback: "https://images.unsplash.com/photo-1520333789090-1afc82db536a?w=1200&q=80",
  biketour: "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=1200&q=80",
  hikedive: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200&q=80",
  buggy: "https://images.unsplash.com/photo-1609429019995-8c40f49535a5?w=1200&q=80",
};

export const CHECKOUT_EXTRAS: CheckoutExtra[] = [
  // ── A chegada ── (a receção é escolha obrigatória, tratada à parte)
  { sku: "transfer-porto", chapter: "arrival", pricingModel: "per_unit", fulfillment: "instant", unitPrice: 120, minQty: 1, maxQty: 4, popular: true, photo: IMG.transfer, baseRank: 10 },
  { sku: "transfer-porto-van", chapter: "arrival", pricingModel: "per_unit", fulfillment: "instant", unitPrice: 160, minQty: 1, maxQty: 4, photo: IMG.transfer, baseRank: 11 },

  // ── A casa ──
  { sku: "daily-cleaning", chapter: "home", pricingModel: "per_day", fulfillment: "instant", unitPrice: 60, photo: IMG.cleaning, baseRank: 20 },
  { sku: "linen-change", chapter: "home", pricingModel: "per_unit", fulfillment: "instant", unitPrice: 45, minQty: 1, maxQty: 10, photo: IMG.linen, baseRank: 21 },
  { sku: "babysitter", chapter: "home", pricingModel: "per_person_per_unit", fulfillment: "needs_confirmation", unitPrice: 20, photo: IMG.babysitter, baseRank: 22 },

  // ── A mesa ──
  { sku: "private-chef", chapter: "table", pricingModel: "per_person", fulfillment: "needs_confirmation", unitPrice: 95, minPeople: 4, photo: IMG.chef, baseRank: 30 },
  { sku: "hamper-essentials", chapter: "table", pricingModel: "per_stay", fulfillment: "instant", unitPrice: 75, photo: IMG.hamperEssentials, baseRank: 31 },
  { sku: "hamper-gourmet", chapter: "table", pricingModel: "per_stay", fulfillment: "instant", unitPrice: 150, popular: true, photo: IMG.hamperGourmet, baseRank: 32 },
  { sku: "grocery-list", chapter: "table", pricingModel: "on_request", fulfillment: "on_request", photo: IMG.grocery, baseRank: 33 },

  // ── Bem-estar ──
  { sku: "massage", chapter: "wellness", pricingModel: "per_person_per_unit", fulfillment: "needs_confirmation", unitPrice: 90, photo: IMG.massage, baseRank: 40 },
  { sku: "private-yoga", chapter: "wellness", pricingModel: "per_person_per_unit", fulfillment: "needs_confirmation", unitPrice: 60, photo: IMG.yoga, baseRank: 41 },
  { sku: "personal-trainer", chapter: "wellness", pricingModel: "per_person_per_unit", fulfillment: "needs_confirmation", unitPrice: 55, photo: IMG.trainer, baseRank: 42 },

  // ── Experiências ── (produtos reais do catálogo; V1 on_request, V2 Bókun em tempo real)
  { sku: "exp-sup", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", photo: IMG.sup, baseRank: 50 },
  { sku: "exp-hikedive", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", photo: IMG.hikedive, baseRank: 51 },
  { sku: "exp-ebike", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", photo: IMG.ebike, baseRank: 52 },
  { sku: "exp-horseback", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", photo: IMG.horseback, baseRank: 53 },
  { sku: "exp-canyoning", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", photo: IMG.canyoning, baseRank: 54 },
  { sku: "exp-biketour", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", photo: IMG.biketour, baseRank: 55 },
  { sku: "exp-buggy", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", photo: IMG.buggy, baseRank: 56 },
];

/**
 * Curadoria determinista (§5.3), avaliada no servidor a partir do contexto da
 * reserva. Não é ML: são regras claras que sobem itens relevantes e definem o
 * stepper certo à partida (nunca pré-selecionam nada).
 */
export interface CurationContext {
  destination?: string;
  nights: number;
  guests: number;
  /** mês do check-in, 1-12 */
  month?: number;
}

/** Destinos com forte componente costeira/aquática (sobem experiências de água). */
const COASTAL = new Set(["minho", "porto", "lisbon", "algarve", "viana-do-castelo", "caminha", "esposende"]);
/** Experiências de água vs terra, para a regra costeira/interior. */
const WATER_EXP = new Set(["exp-sup", "exp-hikedive", "exp-canyoning"]);
const LAND_EXP = new Set(["exp-ebike", "exp-horseback", "exp-biketour", "exp-buggy"]);

export interface CuratedExtra extends CheckoutExtra {
  /** ranking final após regras (menor = mais acima) */
  rank: number;
  /** quantidade sugerida no stepper ao adicionar (nunca pré-seleciona) */
  suggestedQty?: number;
  suggestedDays?: number;
}

export function curateExtras(ctx: CurationContext): CuratedExtra[] {
  const coastal = ctx.destination ? COASTAL.has(ctx.destination.toLowerCase()) : false;
  const summer = ctx.month != null && ctx.month >= 5 && ctx.month <= 9;

  return CHECKOUT_EXTRAS.map((e): CuratedExtra => {
    let rank = e.baseRank;
    const out: CuratedExtra = { ...e, rank };

    // ≥5 noites: sobe limpeza/mudas e define o stepper certo à partida
    if (ctx.nights >= 5) {
      if (e.sku === "daily-cleaning") {
        rank -= 5;
        out.suggestedDays = Math.max(1, Math.floor(ctx.nights / 2));
      }
      if (e.sku === "linen-change") {
        rank -= 4;
        const suggested = Math.max(1, Math.floor(ctx.nights / 3));
        out.suggestedQty = Math.min(e.maxQty ?? suggested, suggested);
      }
    }
    // ≥6 hóspedes: sobe chef privado e transfer van
    if (ctx.guests >= 6) {
      if (e.sku === "private-chef") rank -= 6;
      if (e.sku === "transfer-porto-van") rank -= 6;
    }
    // Região costeira sobe experiências de água; interior sobe as de terra
    if (e.chapter === "experiences") {
      if (coastal && WATER_EXP.has(e.sku)) rank -= 4;
      if (!coastal && LAND_EXP.has(e.sku)) rank -= 4;
      // Verão sobe água; fora de época sobe terra
      if (summer && WATER_EXP.has(e.sku)) rank -= 2;
      if (!summer && LAND_EXP.has(e.sku)) rank -= 2;
    }

    out.rank = rank;
    return out;
  }).sort((a, b) => a.rank - b.rank);
}

/**
 * Flex — remarcação garantida (spec §6). NUNCA "seguro" (ASF).
 * Valores afináveis no fim (spec §15).
 */
export const FLEX_CONFIG = {
  price: 250,
  minTotal: 1500,
  rescheduleDaysBefore: 7,
  creditMonths: 18,
};
