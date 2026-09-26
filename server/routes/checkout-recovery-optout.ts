/**
 * Bloco 2 — opt-out dos lembretes de recuperação do checkout.
 *
 * GET /api/checkout/recovery-optout?intent=<id>&t=<token>
 * O token é HMAC do id do intent (ver checkout-recovery.ts): só quem recebeu
 * o email tem o link. A rota marca recovery_optout no intent e devolve uma
 * página de confirmação minimalista com a marca. Idempotente: repetir o
 * clique mostra a mesma confirmação. Nunca revela dados do intent (o id é
 * uma capability com PII, a página não mostra nada dele).
 */
import type { Express, Request, Response } from "express";
import { verifyRecoveryOptoutToken } from "../services/checkout-recovery";
import { markRecoveryOptout } from "../db";
// The branded page lives in ../lib/brand-page.ts so the newsletter
// confirmation (server/routes/newsletter-confirm.ts) shares the same look.
import { brandPage as page } from "../lib/brand-page";

export function registerRecoveryOptoutRoute(app: Express): void {
  app.get("/api/checkout/recovery-optout", async (req: Request, res: Response) => {
    const intentId = String(req.query.intent ?? "");
    const token = String(req.query.t ?? "");
    // O locale do pedido decide a língua da página (o link vem de um email
    // PT ou EN, o browser do hóspede é o melhor sinal disponível sem DB)
    const pt = String(req.headers["accept-language"] ?? "").toLowerCase().startsWith("pt");

    if (!verifyRecoveryOptoutToken(intentId, token)) {
      res
        .status(400)
        .type("html")
        .send(
          page(
            pt ? "pt" : "en",
            pt ? "Link inválido" : "Invalid link",
            pt
              ? "Este link já não é válido. Se continuar a receber lembretes que não pediu, responda ao email e tratamos disso."
              : "This link is no longer valid. If you keep receiving reminders you did not ask for, just reply to the email and we will take care of it.",
          ),
        );
      return;
    }

    const ok = await markRecoveryOptout(intentId);
    if (!ok) {
      res
        .status(500)
        .type("html")
        .send(
          page(
            pt ? "pt" : "en",
            pt ? "Algo falhou" : "Something went wrong",
            pt
              ? "Não conseguimos registar o seu pedido agora. Tente novamente dentro de instantes ou responda ao email e tratamos disso por si."
              : "We could not register your request right now. Please try again in a moment, or reply to the email and we will handle it for you.",
          ),
        );
      return;
    }

    res
      .type("html")
      .send(
        page(
          pt ? "pt" : "en",
          pt ? "Lembretes desativados" : "Reminders turned off",
          pt
            ? "Não voltará a receber lembretes sobre esta reserva. A sua seleção continua guardada e pode retomá-la a qualquer momento pelo link do email."
            : "You will not receive further reminders about this booking. Your selection is still saved and you can pick it up anytime from the link in the email.",
        ),
      );
  });
}
