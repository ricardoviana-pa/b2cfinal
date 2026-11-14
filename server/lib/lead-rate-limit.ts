/**
 * Limitador do formulário público (leads.create: contacto, pedido de
 * disponibilidade, newsletter, proprietários).
 *
 * `app.use("/api/trpc/leads.create", …)` só apanhava o pedido sozinho. O
 * Express monta por segmentos de caminho, e um batch do tRPC chega como
 * `/api/trpc/properties.localities,leads.create`: outro caminho, sem limite.
 * Cada leads.create grava um contacto e envia emails (à equipa e ao endereço
 * escrito no formulário), por isso bastava juntar outro procedimento ao pedido
 * para enviar emails sem teto em nome da marca (auditoria de 14 nov 2026).
 * Este módulo decide pelo nome dos procedimentos, como o do saldo e o do
 * pagamento das casas parceiras.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Por minuto e por IP. Uma pessoa envia um formulário de cada vez. */
export const LEAD_RATE_LIMIT_PER_MIN = 10;

const LEAD_PROCEDURE = "leads.create";

/** Quantas vezes o caminho tRPC (sozinho ou num batch "a.b,c.d") chama leads.create. Pura. */
export function leadCreateCalls(path: string | null | undefined): number {
  let p = String(path ?? "");
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  // A mesma ordem do adaptador Express do tRPC: corta depois da última "/" e só depois descodifica.
  p = p.slice(p.lastIndexOf("/") + 1);
  try { p = decodeURIComponent(p); } catch { /* codificação inválida: decide com o texto cru */ }
  return p.split(",").map((s) => s.trim()).filter((proc) => proc === LEAD_PROCEDURE).length;
}

/**
 * Aplica `limiter` aos pedidos que enviam um formulário. Um pedido com dois
 * ou mais leads.create é recusado: o site nunca envia dois formulários no
 * mesmo pedido, e o limite conta pedidos, não procedimentos. Montar em `/api/trpc`.
 */
export function leadTrpcLimiter(limiter: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const calls = leadCreateCalls(req.path);
    if (calls === 0) return next();
    if (calls > 1) {
      res.status(429).json({ error: "Too many submissions. Please wait a moment." });
      return;
    }
    return limiter(req, res, next);
  };
}
