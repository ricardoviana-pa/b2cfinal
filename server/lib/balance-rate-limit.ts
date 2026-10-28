/**
 * Limitador da API pública do saldo (página "A segunda parte da sua estadia").
 *
 * `app.use("/api/trpc/balance", …)` não serve: o Express monta por segmentos
 * de caminho, e os pedidos do tRPC chegam como `/api/trpc/balance.view` ou,
 * em batch, `/api/trpc/balance.view,balance.help`; nenhum deles começa pelo
 * segmento `/balance`. Este módulo decide pelo nome dos procedimentos.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Pedidos por minuto e por IP na API do saldo (a página faz no máximo um
 *  pedido a cada 3 s durante 60 s depois de pagar; o resto é esporádico). */
export const BALANCE_RATE_LIMIT_PER_MIN = 30;

/**
 * true quando o caminho tRPC (com ou sem o prefixo `/api/trpc`, e com
 * quaisquer segmentos pelo meio) inclui algum
 * procedimento do router `balance` (`balance.x`), sozinho ou num batch
 * "a.b,c.d". `balanceAdmin.*` não conta (tem sessão de admin). Pura.
 */
export function isBalanceTrpcPath(path: string | null | undefined): boolean {
  let p = String(path ?? "");
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  // A mesma ordem do adaptador Express do tRPC: corta o caminho CRU depois da
  // última "/" (`/x/balance.help` chama balance.help) e só depois descodifica.
  // Descodificar primeiro deixava um "%2F" no fim (`balance.view%2C%2F`)
  // cortar o procedimento fora do texto que o limite vê.
  p = p.slice(p.lastIndexOf("/") + 1);
  try {
    // A vírgula do batch pode vir codificada (%2C).
    p = decodeURIComponent(p);
  } catch {
    // Codificação inválida: decide com o texto cru.
  }
  return p
    .split(",")
    .map((s) => s.trim())
    .some((proc) => proc.startsWith("balance."));
}

/** Aplica `limiter` só aos pedidos do saldo; o resto segue sem contar. Montar
 *  em `/api/trpc` (o caminho relativo também é aceite pelo matcher). */
export function balanceTrpcLimiter(limiter: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isBalanceTrpcPath(req.path)) return limiter(req, res, next);
    return next();
  };
}
