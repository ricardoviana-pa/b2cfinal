/**
 * Checkout 2.0 — catálogo do passo "Personalizar" (Fase 2 + 2.1, spec v1.2 §5
 * e docs/checkout_fase2_1_polish.md, direção configurador).
 *
 * Uma única fonte de verdade, ligada ao catálogo real do site: nomes e preços
 * reais. Preços INDICATIVOS até validação com a Susana/Diogo (§15.6).
 *
 * POLÍTICA DE IMAGEM (2.1 §4): máximo 5 fotografias em todo o passo — a casa
 * no resumo lateral, o chef (destaque de A mesa) e 3 experiências. PROIBIDO
 * stock e imagem gerada; só domínio próprio ou CDN do Bókun. Sku sem asset
 * aprovado fica sem imagem (photo ausente) e rende como linha tipográfica.
 *
 * pricing_model: per_stay | per_day | per_person | per_unit | per_person_per_unit | on_request
 * fulfillment:   instant | needs_confirmation (cobra hoje, reembolso automático
 *                em 24h se não entregável) | on_request (orçamento concierge)
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
  /** "Desde X €" real do catálogo do site, para on_request (experiências). */
  priceFrom?: number;
  minQty?: number;
  maxQty?: number;
  minPeople?: number;
  /** "Mais escolhido" — no máximo 2 no catálogo (§5.3) */
  popular?: boolean;
  /**
   * Fotografia real — APENAS domínio próprio ou CDN Bókun (2.1 §4). Ausente na
   * esmagadora maioria: o passo é tipográfico. Presente só no chef (destaque
   * 3.3) e nas experiências (3.4).
   */
  photo?: string;
  /** Destaque com imagem (2.1 §3.3) — máximo 1 por capítulo, só onde vende. */
  feature?: boolean;
  /** Curadoria: ranking base (menor = mais acima) antes das regras dinâmicas */
  baseRank: number;
}

/**
 * Receção — escolha obrigatória (§5.2), par de cartões TIPOGRÁFICOS (2.1 §3.1,
 * sem imagem). Self incluído; presencial paga com modificador pós-21h.
 */
export const CHECKOUT_RECEPTION = {
  hostedPrice: 50,
  hostedLatePrice: 90,
  /** Hora (24h) a partir da qual a receção presencial passa a tarifa noturna */
  lateFromHour: 21,
};

/** "Incluído na sua estadia" — linha única discreta (2.1 §1.1). */
export const CHECKOUT_INCLUDED_KEYS = [
  "concierge",
  "linen",
  "welcome",
  "bestRate",
] as const;

export const CHECKOUT_EXTRAS: CheckoutExtra[] = [
  // ── Capítulo 01 · A chegada ── (receção obrigatória tratada à parte; linhas)
  { sku: "transfer-porto", chapter: "arrival", pricingModel: "per_unit", fulfillment: "instant", unitPrice: 120, minQty: 1, maxQty: 4, popular: true, baseRank: 10 },
  { sku: "transfer-porto-van", chapter: "arrival", pricingModel: "per_unit", fulfillment: "instant", unitPrice: 160, minQty: 1, maxQty: 4, baseRank: 11 },

  // ── Capítulo 02 · A casa ── (babysitter atrás de "ver mais" por rank)
  { sku: "daily-cleaning", chapter: "home", pricingModel: "per_day", fulfillment: "instant", unitPrice: 60, baseRank: 20 },
  { sku: "linen-change", chapter: "home", pricingModel: "per_unit", fulfillment: "instant", unitPrice: 45, minQty: 1, maxQty: 10, baseRank: 21 },
  { sku: "babysitter", chapter: "home", pricingModel: "per_person_per_unit", fulfillment: "needs_confirmation", unitPrice: 20, baseRank: 22 },

  // ── Capítulo 03 · A mesa ── (chef = único destaque com imagem dos caps 01-04)
  { sku: "private-chef", chapter: "table", pricingModel: "per_person", fulfillment: "needs_confirmation", unitPrice: 95, minPeople: 4, feature: true, photo: "/experiences/private-chef-dinner.webp", baseRank: 30 },
  { sku: "hamper-essentials", chapter: "table", pricingModel: "per_stay", fulfillment: "instant", unitPrice: 75, baseRank: 31 },
  { sku: "hamper-gourmet", chapter: "table", pricingModel: "per_stay", fulfillment: "instant", unitPrice: 150, popular: true, baseRank: 32 },
  { sku: "grocery-list", chapter: "table", pricingModel: "on_request", fulfillment: "on_request", baseRank: 33 },

  // ── Capítulo 04 · Bem estar ── (treino atrás de "ver mais" por rank)
  { sku: "massage", chapter: "wellness", pricingModel: "per_person_per_unit", fulfillment: "needs_confirmation", unitPrice: 90, baseRank: 40 },
  { sku: "private-yoga", chapter: "wellness", pricingModel: "per_person_per_unit", fulfillment: "needs_confirmation", unitPrice: 60, baseRank: 41 },
  { sku: "personal-trainer", chapter: "wellness", pricingModel: "per_person_per_unit", fulfillment: "needs_confirmation", unitPrice: 55, baseRank: 42 },

  // ── Capítulo 05 · Experiências ── única zona fotográfica (2.1 §3.4): fotos
  // do domínio próprio; preços "desde" reais de services.json. hike-dive e
  // bike-tour não têm asset aprovado → sem photo → não entram nos 3 cards.
  { sku: "exp-sup", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", priceFrom: 45, photo: "/experiences/sup-river.webp", baseRank: 50 },
  { sku: "exp-canyoning", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", priceFrom: 65, photo: "/experiences/canyoning-adventure.webp", baseRank: 51 },
  { sku: "exp-ebike", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", priceFrom: 55, photo: "/experiences/ebike-tours/cover.webp", baseRank: 52 },
  { sku: "exp-horseback", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", priceFrom: 75, photo: "/experiences/horseback-beach.webp", baseRank: 53 },
  { sku: "exp-buggy", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", priceFrom: 120, photo: "/videos/can-am-poster.webp", baseRank: 54 },
  { sku: "exp-hikedive", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", priceFrom: 95, baseRank: 55 },
  { sku: "exp-biketour", chapter: "experiences", pricingModel: "on_request", fulfillment: "on_request", priceFrom: 45, baseRank: 56 },
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
