/**
 * GET /api/health — liveness para o health check do Render e para um monitor
 * de uptime externo (auditoria de 29 out 2026,
 * tracking-legal-security-origin-502-no-health).
 *
 * Responde 200 {"ok":true} logo que o processo está a servir pedidos: o
 * server.listen só acontece depois de as rotas estarem montadas e das
 * migrações de arranque (server/_core/index.ts), por isso um 200 aqui quer
 * dizer "esta instância já pode receber tráfego". De propósito, não toca na
 * BD (TiDB, cobrada por pedido) nem na Guesty: um monitor a cada minuto não
 * pode custar request units nem tokens OAuth, e uma BD em baixo não deve tirar
 * do ar uma instância que ainda serve as páginas a partir dos JSON.
 *
 * A saúde do motor da 2.ª parte continua em /api/health/balance-scheduler.
 */
import type { Express } from "express";

export function registerHealthRoutes(app: Express): void {
  app.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ ok: true });
  });
}
