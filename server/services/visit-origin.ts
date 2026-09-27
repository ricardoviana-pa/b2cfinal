/**
 * Origem da visita no servidor: valida o que o navegador envia, junta
 * atualizações e escreve a linha "Origem:" da nota da reserva no Guesty e o
 * resumo do email interno [Venda direta].
 *
 * A origem nunca sai daqui para terceiros: não vai para a Stripe, para a CAPI
 * da Meta nem para o dataLayer. O mapa para canal de marketing (email, Google,
 * Meta...) fica no pa-marketing (b-crm/jobs/campaign_bookings.py), que lê a
 * linha da nota.
 *
 * Formato da linha (estável, v1). "-" quer dizer vazio; os valores nunca têm
 * espaços, ";" nem ",":
 *   Origem: utm_source=email; utm_medium=email; utm_campaign=2026-09_o1_base_prevenda2027;
 *   utm_content=botao_casa; utm_term=-; clid=-; ref=-; entrada=/pt/homes/nature-hill-duo;
 *   toque=2026-09-27T16:42:10Z; primeiro=2026-09-20T10:03:55Z,email,email,2026-09_o1_base_prevenda2027;
 *   guardado=sim (origem da visita no site, v1)
 * (numa só linha). Gramática: ^Origem: (.+) \(origem da visita no site, v1\)$,
 * pares separados por "; ", cada par chave=valor.
 *   - os utm_*, clid, ref e entrada são da última visita de campanha (ou da
 *     entrada direta, quando não houve campanha) e toque é a hora dela;
 *   - primeiro = hora,fonte,meio,campanha da primeira visita dos últimos 30 dias;
 *   - guardado = sim quando o navegador guardou a origem entre visitas.
 * Sem consentimento de análise a linha é só "Origem: sem consentimento".
 */
import { z } from "zod";
import {
  CLICK_ID_KEYS,
  MAX_FUTURE_SEC,
  MAX_TOUCH_AGE_SEC,
  UTM_KEYS,
  cleanTouch,
  isCampaignTouch,
  type VisitTouch,
} from "@shared/visit-origin";

/** Toque guardado no servidor: hora ISO do relógio do servidor. */
export type ServerTouch = VisitTouch & { at: string };

export type ServerVisitOrigin =
  | { v: 1; consent: false }
  | { v: 1; consent: true; stored: boolean; first: ServerTouch | null; last: ServerTouch | null };

export const ORIGIN_NO_CONSENT_LINE = "Origem: sem consentimento";
const ORIGIN_LINE_SUFFIX = " (origem da visita no site, v1)";

// Listas fechadas: uma chave a mais invalida o toque ou o pedido inteiro.
const rawValue = z.string().max(500).optional();
const touchSchema = z
  .object({
    ageSec: z.number().int().min(-MAX_FUTURE_SEC).max(MAX_TOUCH_AGE_SEC),
    utm_source: rawValue,
    utm_medium: rawValue,
    utm_campaign: rawValue,
    utm_content: rawValue,
    utm_term: rawValue,
    clickId: z.enum(CLICK_ID_KEYS).optional(),
    referrer: rawValue,
    landing: rawValue,
  })
  .strict();
const payloadSchema = z.union([
  z.object({ v: z.literal(1), consent: z.literal(false) }).strict(),
  z
    .object({
      v: z.literal(1),
      consent: z.literal(true),
      stored: z.boolean(),
      first: z.unknown(),
      last: z.unknown(),
    })
    .strict(),
]);
const storedTouchSchema = z
  .object({
    at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    utm_source: rawValue,
    utm_medium: rawValue,
    utm_campaign: rawValue,
    utm_content: rawValue,
    utm_term: rawValue,
    clickId: z.enum(CLICK_ID_KEYS).optional(),
    referrer: rawValue,
    landing: rawValue,
  })
  .strict();

function isoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** first é sempre o mais antigo; um lado em falta copia o outro. */
function orderTouches(first: ServerTouch | null, last: ServerTouch | null): { first: ServerTouch | null; last: ServerTouch | null } {
  if (!first && !last) return { first: null, last: null };
  if (!first) return { first: last, last };
  if (!last) return { first, last: first };
  return first.at <= last.at ? { first, last } : { first: last, last: first };
}

/**
 * Valida e limpa a origem enviada pelo navegador. null quando o pedido não
 * respeita o formato (chaves desconhecidas, tipos errados): a reserva segue
 * sem origem, nunca falha por causa dela. Um toque fora da janela (mais de
 * 31 dias, ou mais de 5 minutos no futuro) é descartado sozinho.
 */
export function parseVisitOriginPayload(input: unknown, now: Date = new Date()): ServerVisitOrigin | null {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return null;
  if (!parsed.data.consent) return { v: 1, consent: false };
  const nowMs = now.getTime();
  const touch = (value: unknown): ServerTouch | null => {
    if (value == null) return null;
    const t = touchSchema.safeParse(value);
    if (!t.success) return null;
    const { ageSec, ...rest } = t.data;
    return { ...cleanTouch(rest), at: isoSeconds(nowMs - Math.max(0, ageSec) * 1000) };
  };
  const { first, last } = orderTouches(touch(parsed.data.first), touch(parsed.data.last));
  return { v: 1, consent: true, stored: parsed.data.stored, first, last };
}

/** Relê o que está na base (defensivo: o JSON pode ter sido escrito por outra versão). */
export function parseStoredVisitOrigin(input: unknown): ServerVisitOrigin | null {
  let data = input;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.v !== 1) return null;
  if (record.consent === false) return { v: 1, consent: false };
  if (record.consent !== true) return null;
  const touch = (value: unknown): ServerTouch | null => {
    const t = storedTouchSchema.safeParse(value);
    if (!t.success) return null;
    const { at, ...rest } = t.data;
    return { ...cleanTouch(rest), at };
  };
  const { first, last } = orderTouches(touch(record.first), touch(record.last));
  return { v: 1, consent: true, stored: record.stored === true, first, last };
}

/**
 * Junta uma atualização (por exemplo um link de recuperação com UTM aberto na
 * página de checkout, ou um consentimento dado já no checkout) ao que o
 * intent tinha. Retirar o consentimento apaga a origem guardada.
 */
export function mergeVisitOrigins(existing: ServerVisitOrigin | null, incoming: ServerVisitOrigin): ServerVisitOrigin {
  if (!incoming.consent) return incoming;
  if (!existing || !existing.consent) return incoming;
  const earliest = (a: ServerTouch | null, b: ServerTouch | null) => (!a ? b : !b ? a : a.at <= b.at ? a : b);
  const latest = (a: ServerTouch | null, b: ServerTouch | null) => (!a ? b : !b ? a : a.at >= b.at ? a : b);
  // Último clique não direto: uma entrada direta nunca tapa uma de campanha.
  const pickLast = (a: ServerTouch | null, b: ServerTouch | null) => {
    const ca = isCampaignTouch(a);
    const cb = isCampaignTouch(b);
    if (ca && !cb) return a;
    if (cb && !ca) return b;
    return latest(a, b);
  };
  const { first, last } = orderTouches(earliest(existing.first, incoming.first), pickLast(existing.last, incoming.last));
  return { v: 1, consent: true, stored: existing.stored || incoming.stored, first, last };
}

/** Defesa final: nada que parta a gramática da linha chega à nota. */
function noteValue(value: string | undefined | null): string {
  const clean = String(value ?? "").replace(/[^A-Za-z0-9._~/:-]/g, "_");
  return clean || "-";
}

/**
 * A linha "Origem:" para a nota da reserva. "" quando o intent não tem
 * origem registada (por exemplo intents anteriores a esta versão do site).
 */
export function originNoteLine(origin: ServerVisitOrigin | null | undefined): string {
  if (!origin) return "";
  if (!origin.consent) return ORIGIN_NO_CONSENT_LINE;
  const last = origin.last;
  const first = origin.first;
  const pairs: Array<[string, string]> = [
    ...UTM_KEYS.map((key): [string, string] => [key, noteValue(last?.[key])]),
    ["clid", noteValue(last?.clickId)],
    ["ref", noteValue(last?.referrer)],
    ["entrada", noteValue(last?.landing)],
    ["toque", noteValue(last?.at)],
    [
      "primeiro",
      first
        ? [first.at, first.utm_source, first.utm_medium, first.utm_campaign].map(noteValue).join(",")
        : "-",
    ],
    ["guardado", origin.stored ? "sim" : "nao"],
  ];
  return "Origem: " + pairs.map(([key, value]) => `${key}=${value}`).join("; ") + ORIGIN_LINE_SUFFIX;
}

function lisbonTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-PT", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeTouch(touch: ServerTouch): string {
  if (!isCampaignTouch(touch)) return "direta (sem campanha nem site de origem)";
  const parts: string[] = [];
  const labels: Record<(typeof UTM_KEYS)[number], string> = {
    utm_source: "fonte",
    utm_medium: "meio",
    utm_campaign: "campanha",
    utm_content: "conteudo",
    utm_term: "termo",
  };
  for (const key of UTM_KEYS) if (touch[key]) parts.push(`${labels[key]} ${touch[key]}`);
  if (touch.clickId) parts.push(`clique de anuncio (${touch.clickId})`);
  if (touch.referrer) parts.push(`site de origem ${touch.referrer}`);
  return parts.join(", ");
}

/** Resumo legível para o email interno [Venda direta]. Mesmos dados da nota. */
export function originEmailSummary(origin: ServerVisitOrigin | null | undefined): string {
  if (!origin) return "sem registo no site";
  if (!origin.consent) return "sem consentimento de cookies de analise (nada guardado)";
  const { first, last } = origin;
  if (!last) return "sem visita registada";
  const parts = [describeTouch(last), `${isCampaignTouch(last) ? "clique" : "visita"} ${lisbonTime(last.at)} (Lisboa)`];
  if (last.landing) parts.push(`entrada ${last.landing}`);
  if (first && first.at !== last.at) parts.push(`primeira visita ${lisbonTime(first.at)}: ${describeTouch(first)}`);
  if (!origin.stored) parts.push("so esta sessao (o navegador nao guardou)");
  return parts.join(" · ");
}
