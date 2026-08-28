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

const PA = {
  dark: "#1A1A18",
  earth: "#6B6860",
  warm: "#F5F1EB",
  sand: "#E8E4DC",
} as const;
// Mesma banda dos emails (auto-hospedada): esta pagina e o destino do link no
// rodape do email, e o CDN da plataforma original morreu a 24 ago 2026.
const LOGO_URL = "https://www.portugalactive.com/email/brand-band.png";
const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "'DM Sans',Arial,Helvetica,sans-serif";

function page(lang: string, title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${title} · Portugal Active</title>
</head>
<body style="margin:0;padding:0;background:${PA.warm};font-family:${SANS};">
  <div style="text-align:center;">
    <img src="${LOGO_URL}" alt="Portugal Active" width="600" style="display:block;margin:0 auto;width:100%;max-width:600px;height:auto;" />
  </div>
  <div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center;">
    <h1 style="font-family:${SERIF};font-size:28px;font-weight:400;line-height:1.25;color:${PA.dark};margin:0 0 14px;">${title}</h1>
    <p style="font-size:15px;line-height:1.65;color:${PA.earth};margin:0;">${message}</p>
    <p style="margin:36px 0 0;padding-top:28px;border-top:1px solid ${PA.sand};font-family:${SERIF};font-size:16px;color:${PA.dark};">Portugal Active</p>
  </div>
</body>
</html>`;
}

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
