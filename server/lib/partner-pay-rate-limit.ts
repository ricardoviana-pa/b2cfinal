/**
 * Limitador do pagamento das casas parceiras (booking.partnerPayStart e
 * booking.partnerPayStatus).
 *
 * `app.use("/api/trpc/booking", …)` não apanha `/api/trpc/booking.partnerPayStart`
 * (o Express monta por segmentos de caminho; ver balance-rate-limit.ts). Cada
 * partnerPayStart grava um pedido, cria uma sessão no Stripe e avisa a equipa
 * por email: sem teto, era um caminho aberto para encher a caixa da equipa.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Por minuto e por IP. Um hóspede a pagar faz um partnerPayStart e, no regresso, um partnerPayStatus. */
export const PARTNER_PAY_RATE_LIMIT_PER_MIN = 10;

/** true quando o caminho tRPC (sozinho ou num batch "a.b,c.d") chama um procedimento do pagamento parceiro. Pura. */
export function isPartnerPayTrpcPath(path: string | null | undefined): boolean {
  let p = String(path ?? "");
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  // A mesma ordem do adaptador Express do tRPC: corta depois da última "/" e só depois descodifica.
  p = p.slice(p.lastIndexOf("/") + 1);
  try { p = decodeURIComponent(p); } catch { /* codificação inválida: decide com o texto cru */ }
  return p.split(",").map((s) => s.trim()).some((proc) => proc.startsWith("booking.partnerPay"));
}

/** Aplica `limiter` só aos pedidos do pagamento parceiro. Montar em `/api/trpc`. */
export function partnerPayTrpcLimiter(limiter: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isPartnerPayTrpcPath(req.path)) return limiter(req, res, next);
    return next();
  };
}
