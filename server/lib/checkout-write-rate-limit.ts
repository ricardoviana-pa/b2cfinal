/**
 * Limites de pedidos do que grava, cobra ou envia em `booking.*` e
 * `checkout.*` (auditoria de 14 nov 2026, segunda ronda técnica).
 *
 * `app.use("/api/trpc/booking", apiLimiter)` e
 * `app.use("/api/trpc/checkout", apiLimiter)` nunca limitaram nada: o Express
 * monta por segmentos de caminho, e os pedidos do tRPC chegam como
 * `/api/trpc/booking.getQuote` ou, em batch,
 * `/api/trpc/checkout.promoBanner,properties.catalogForSite`. Nenhum começa
 * pelo segmento `/booking` ou `/checkout`. Este módulo decide pelo nome dos
 * procedimentos, como o dos formulários (lead-rate-limit.ts), o do saldo e o
 * do pagamento das casas parceiras.
 *
 * O QUE SE LIMITA, E O QUE NÃO
 *
 * Só as mutations: o que cria um intent, grava um contacto, cria um pagamento
 * na Stripe, cria uma reserva ou mexe num cupão no fornecedor. As leituras
 * ficam de fora, todas, e de propósito. Uma visita normal é feita delas:
 * `checkout.promoBanner` em cada página, `booking.lowestNightlyBatch` (os
 * preços "desde" da listagem), `booking.getCalendar` e `booking.getQuote` na
 * página de uma casa, e o `npm run audit:quotes` pede uma cotação por casa
 * de seguida a partir de um só IP. Aplicar o limite antigo (60 por minuto) a
 * tudo o que tem "booking." ou "checkout." no caminho travava essas visitas.
 * O teste checkout-write-rate-limit.test.ts falha se uma leitura entrar numa
 * das listas, ou se aparecer uma mutation nova sem classificação.
 *
 * OS NÚMEROS (por minuto e por IP)
 *
 * Medido a 14 nov 2026 no build de produção, com o ecrã verdadeiro do
 * checkout a correr contra respostas simuladas (abrir, email, receção, cinco
 * extras um a um, continuar para o pagamento, nome e telefone): em 92
 * segundos, 15 pedidos. Cinco leituras, oito `updateIntent`, um `setOrigin`
 * e um `captureLead`; nunca mais de um procedimento por pedido de gravação.
 * Atualizar um preço caducado são mais dois `updateIntent`. O resto vem do
 * código do cliente, onde cada cobrança sai de um clique.
 *
 * - Cobranças e reservas (CHARGE_PROCEDURES): uma reserva normal faz 4 a 6
 *   no total (criar o intent, o email, pagar, confirmar), ao longo de vários
 *   minutos. O minuto mais agitado que o teste imagina (cinco códigos
 *   promocionais errados e quatro tentativas de pagar seguidas) dá 12. O
 *   limite é 60, o número que o limitador morto já tinha.
 * - Gravações do checkout (SAVE_PROCEDURES): o `updateIntent` é conversador
 *   por desenho (os extras gravam 600 ms depois de cada alteração, os dados
 *   do hóspede 800 ms depois, e cada clique na tarifa, na receção ou no Flex
 *   grava logo). O checkout medido fez 9 em minuto e meio; o minuto mais
 *   agitado do teste dá 39; o teto teórico de uma pessoa a clicar sem parar
 *   um minuto inteiro anda pelos 130. O limite é 240.
 *
 * Um pedido conta uma vez por cada procedimento limitado que leva: um batch
 * com cinco gravações vale cinco, senão bastava juntá-las num só pedido.
 *
 * O QUE ISTO NÃO FAZ
 *
 * Trava uma inundação a partir de um IP. Não trava quem forjar o cabeçalho
 * X-Forwarded-For: o servidor confia nele (`trust proxy`), e cada valor
 * forjado conta como um visitante novo. Isto vale para todos os limites do
 * site, não só para estes (verificado em produção a 14 nov 2026), e fica
 * relatado no PR; mudar a chave exige ver os cabeçalhos que chegam ao
 * servidor antes de mexer.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Cobranças, reservas, intents novos, contactos e cupões. */
export const CHECKOUT_CHARGE_RATE_LIMIT_PER_MIN = 60;

/** Gravações do estado do checkout. */
export const CHECKOUT_SAVE_RATE_LIMIT_PER_MIN = 240;

/** Criam um intent, um contacto, um pagamento, uma reserva, ou mexem na cotação do fornecedor. */
export const CHARGE_PROCEDURES: ReadonlySet<string> = new Set([
  "checkout.createIntent",
  "checkout.captureLead",
  "checkout.createCardCharge",
  "checkout.finalizeCardCharge",
  "booking.applyCoupon",
  "booking.createBEQuote",
  "booking.createBEInstantReservation",
  "booking.createPayPalPaymentIntent",
  "booking.confirmPayPalBooking",
  "booking.createKlarnaPaymentIntent",
  "booking.confirmKlarnaBooking",
]);

/** Gravam o estado de um checkout que já existe. */
export const SAVE_PROCEDURES: ReadonlySet<string> = new Set([
  "checkout.updateIntent",
  "checkout.setOrigin",
]);

/** Os procedimentos que um caminho tRPC chama, sozinho ou num batch "a.b,c.d". Pura. */
export function trpcProcedures(path: string | null | undefined): string[] {
  let p = String(path ?? "");
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  // A mesma ordem do adaptador Express do tRPC: corta depois da última "/" e só depois descodifica.
  p = p.slice(p.lastIndexOf("/") + 1);
  try { p = decodeURIComponent(p); } catch { /* codificação inválida: decide com o texto cru */ }
  return p.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Quantas chamadas do caminho pertencem a `procedures`. Pura. */
export function countProcedures(path: string | null | undefined, procedures: ReadonlySet<string>): number {
  return trpcProcedures(path).filter((proc) => procedures.has(proc)).length;
}

/**
 * Aplica `limiter` aos pedidos que chamam algum procedimento de `procedures`,
 * contando uma vez por chamada. O resto segue sem contar. Montar em
 * `/api/trpc`. O `limiter` é um express-rate-limit criado com
 * `validate: { singleCount: false }`: contar várias vezes o mesmo pedido é
 * aqui de propósito.
 */
export function weightedTrpcLimiter(limiter: RequestHandler, procedures: ReadonlySet<string>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    let left = countProcedures(req.path, procedures);
    if (left === 0) return next();
    const step = (err?: unknown) => {
      if (err) return next(err);
      left -= 1;
      if (left <= 0) return next();
      limiter(req, res, step);
    };
    limiter(req, res, step);
  };
}
