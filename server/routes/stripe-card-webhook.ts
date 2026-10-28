/**
 * 2b: rede de segurança do cartao de plataforma — se o cliente morrer antes do
 * finalize, o webhook cria a reserva e marca o intent pago (sem emails; o
 * caminho normal e o finalize sincrono do cliente, que dispara os hooks).
 *
 * Duas partes (Fase 1): cada evento fica registado em stripe_webhook_events
 * (event_id PK) e só ganha processed_at no fim. Uma reentrega (ou um "Resend"
 * no Dashboard) de um evento já processado não volta a correr o settle; um
 * evento recebido mas por processar (o processo morreu nos 15 s, ou o settle
 * falhou) corre outra vez, porque o settle é idempotente.
 */
import type { Express, Request, Response } from "express";
import express from "express";
import { cardWebhookSecretFromSetup } from "../services/stripe-card-webhook-setup";

/** Quanto o registo do evento pode atrasar a resposta à Stripe. Uma BD lenta
 *  não pode fazer a Stripe dar o webhook por falhado: passado este tempo
 *  segue-se como se a BD estivesse em baixo (fail-open, como hoje). */
const RECORD_EVENT_TIMEOUT_MS = 3_000;

type DbModule = typeof import("../db");
type EventRecord = { fresh: boolean; processed: boolean } | null;

/** Fail-open: sem tabela, sem BD ou BD lenta, o webhook comporta-se como antes
 *  da deduplicação (processa). Nunca lança. */
async function recordEvent(db: DbModule | null, event: { id: string; type: string; livemode: boolean }): Promise<EventRecord> {
  if (!db) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      db.recordStripeWebhookEvent({ eventId: event.id, type: event.type, livemode: event.livemode }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`[Card2b] registo do evento ${event.id} demorou mais de ${RECORD_EVENT_TIMEOUT_MS} ms (fail-open)`);
          resolve(null);
        }, RECORD_EVENT_TIMEOUT_MS);
      }),
    ]);
  } catch (err: any) {
    console.warn(`[Card2b] registo do evento ${event.id} falhou (fail-open):`, err?.message);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Os helpers da BD já não lançam; o catch é só para nunca deixar uma
 *  rejeição solta derrubar o processo a partir de um setTimeout. */
function markProcessed(db: DbModule | null, eventId: string): void {
  if (!db) return;
  void Promise.resolve()
    .then(() => db.markStripeWebhookEventProcessed(eventId))
    .catch((err: any) => console.warn(`[Card2b] marcar evento ${eventId} processado falhou:`, err?.message));
}

function markFailed(db: DbModule | null, eventId: string, error: string): void {
  if (!db) return;
  void Promise.resolve()
    .then(() => db.markStripeWebhookEventFailed(eventId, error))
    .catch((err: any) => console.warn(`[Card2b] marcar evento ${eventId} falhado falhou:`, err?.message));
}

export function registerStripeCardWebhookRoute(app: Express) {
  app.post("/api/webhooks/stripe-card", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    try {
      const sig = req.headers["stripe-signature"];
      if (!sig || typeof sig !== "string") return res.status(400).send("missing signature");
      const secret =
        process.env.STRIPE_CARD_WEBHOOK_SECRET ||
        cardWebhookSecretFromSetup() ||
        process.env.STRIPE_KLARNA_WEBHOOK_SECRET;
      if (!secret) return res.status(500).send("webhook secret not configured");
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const event = stripe.webhooks.constructEvent(req.body, sig, secret);

      // Só depois da assinatura: um pedido forjado nunca chega a escrever na BD.
      // O import falhado (módulo da BD a partir no boot) conta como BD em baixo.
      const db = await import("../db").catch((err: any) => {
        console.warn("[Card2b] módulo da BD indisponível (fail-open):", err?.message);
        return null;
      });
      const seen = await recordEvent(db, event);
      if (seen?.processed) {
        return res.json({ received: true, duplicate: true });
      }

      if (event.type === "charge.dispute.created") {
        // Disputa num pagamento do site: alguém tem de responder com a prova
        // (mandato, emails) dentro do prazo da Stripe. Só alerta, mas o alerta
        // é a única notícia: se não sair, 500 para a Stripe reenviar.
        const dispute = event.data.object as any;
        let sent = false;
        try {
          const { sendOpsAlert } = await import("../services/transactional-email");
          sent = await sendOpsAlert(`DISPUTA aberta na Stripe — ${dispute.payment_intent ?? dispute.charge ?? dispute.id}`, [
            `Valor ${((Number(dispute.amount) || 0) / 100).toFixed(2)} EUR, motivo "${dispute.reason ?? "?"}".`,
            `Responder no Dashboard da Stripe antes do prazo. Em reservas em duas partes, juntar o mandato aceite e os emails enviados.`,
          ], { copyToSales: true });
        } catch (err: any) {
          console.error("[Card2b] alerta de disputa falhou:", err?.message);
        }
        if (!sent) {
          markFailed(db, event.id, "alerta de disputa não saiu");
          return res.status(500).send("dispute alert not sent");
        }
        markProcessed(db, event.id);
        return res.json({ received: true });
      }
      if (event.type === "refund.failed") {
        // Reembolso que falhou depois de aceite: o hóspede já leu que o
        // dinheiro voltou. Marca a linha e alerta (com cópia à gestão), antes
        // de responder: se uma das duas falhar, 500 e a Stripe reenvia (o
        // markRefundFailed ignora uma repetição; o alerta pode sair duas
        // vezes, nunca zero).
        const refund = event.data.object as any;
        const rawScheduledId = String(refund.metadata?.scheduledPaymentId ?? "");
        // O reembolso automático de uma 2.ª parte cobrada duas vezes leva
        // "-dup": não é o reembolso do cancelamento, e marcá-lo na linha faria
        // um cancelamento futuro saltar o reembolso (refund_status já cheio).
        const isDuplicateRefund = rawScheduledId.endsWith("-dup");
        const scheduledId = isDuplicateRefund ? "" : rawScheduledId;
        let markError: string | null = null;
        if (scheduledId) {
          if (!db) {
            markError = "módulo da BD indisponível";
          } else {
            try {
              const marked = await db.markRefundFailed(scheduledId, { refundId: refund.id, refundCents: Number(refund.amount) || 0 });
              if (marked === "conflict") markError = "a linha mudou durante a escrita";
              else if (marked === "missing") console.warn(`[Card2b] refund.failed ${refund.id}: linha ${scheduledId} não existe`);
            } catch (err: any) {
              markError = String(err?.message ?? err);
              console.error(`[Card2b] marcar reembolso falhado na linha ${scheduledId} falhou:`, markError);
            }
          }
        }
        let sent = false;
        try {
          const { sendOpsAlert } = await import("../services/transactional-email");
          sent = await sendOpsAlert(`REEMBOLSO FALHOU na Stripe — ${refund.payment_intent ?? refund.id}`, [
            `Reembolso ${refund.id} de ${((Number(refund.amount) || 0) / 100).toFixed(2)} EUR falhou (${String(refund.failure_reason ?? "sem motivo")}).`,
            isDuplicateRefund
              ? `Era o reembolso automático de uma 2.ª parte cobrada duas vezes (linha ${rawScheduledId.replace(/-dup$/, "")}). Contactar o hóspede e devolver por outra via.`
              : `O hóspede pode ter sido informado de que o dinheiro voltou. Contactar o hóspede e reembolsar por outra via.`,
            `O dinheiro volta ao saldo Stripe (até 30 dias). A Stripe só devolve ao meio de pagamento original: não repetir o reembolso no mesmo cartão sem falar com o hóspede.`,
            ...(markError ? [`A linha ${scheduledId} NÃO ficou marcada (${markError}): a Stripe vai reenviar o evento.`] : []),
          ], { copyToSales: true });
        } catch (err: any) {
          console.error("[Card2b] alerta de reembolso falhado não saiu:", err?.message);
        }
        if (markError || !sent) {
          markFailed(db, event.id, markError ? `markRefund: ${markError}` : "alerta de reembolso falhado não saiu");
          return res.status(500).send("refund.failed not handled");
        }
        markProcessed(db, event.id);
        return res.json({ received: true });
      }
      if (event.type !== "payment_intent.succeeded") {
        // Outros tipos subscritos (falhas, reembolsos) ficam registados; o
        // motor da 2.ª parte decide pelo estado real do PI em cada passagem.
        markProcessed(db, event.id);
        return res.json({ received: true });
      }

      const pi = event.data.object as any;
      if (pi.metadata?.part === "balance" || pi.metadata?.flow === "card_v2_balance") {
        // 2.ª parte: só muda o estado da linha (os efeitos — Guesty, nota,
        // email — correm no sweep). Nunca pode cair no settle da 1.ª parte.
        try {
          const { handleBalancePaymentSucceeded } = await import("../services/checkout-balance");
          const r = await handleBalancePaymentSucceeded(pi);
          console.info(`[Balance] webhook: PI de saldo ${pi.id} → ${r}`);
          markProcessed(db, event.id);
        } catch (err: any) {
          // Sem processed_at: a Stripe reentrega e o sweep relê o PI.
          console.error(`[Balance] webhook do saldo falhou ${pi.id}:`, err?.message);
          markFailed(db, event.id, String(err?.message ?? err));
          return res.status(500).send("balance webhook failed");
        }
        return res.json({ received: true });
      }
      if (pi.metadata?.flow !== "card_v2" || !pi.metadata?.intentId) {
        // Klarna/PayPal (têm o seu webhook) e PIs fora do checkout v2.
        console.info(`[Card2b] webhook: ${pi.id} ignorado (flow=${pi.metadata?.flow ?? "—"})`);
        markProcessed(db, event.id);
        return res.json({ received: true });
      }

      const intentId = pi.metadata.intentId as string;
      // Cortesia ao finalize síncrono do cliente: o webhook chega muitas
      // vezes ANTES de o browser fechar a reserva; se ambos correm em
      // simultâneo, o cliente tropeça (visto na 1.ª reserva live). Responde
      // já ao Stripe e processa daqui a 15s — na esmagadora maioria o
      // cliente já fechou tudo e isto é um no-op; se o browser morreu, o
      // webhook fecha a reserva E envia os emails que o cliente enviaria.
      setTimeout(async () => {
        try {
          const { settleCardCharge } = await import("../services/checkout-card-charge");
          const { updateBookingIntent, getBookingIntent } = await import("../db");
          const before = await getBookingIntent(intentId);
          if (before && (before as any).status === "paid") {
            markProcessed(db, event.id); // cliente fechou — nada a fazer
            return;
          }
          const r = await settleCardCharge(intentId, pi.id);
          const m = await getBookingIntent(intentId);
          if (m && (m as any).status !== "paid") {
            await updateBookingIntent(intentId, { status: "paid" } as any);
            console.info(`[Card2b] webhook finalizou intent ${intentId} → ${r.confirmationCode} (cliente não fechou)`);
            const { fireCheckoutPaidEmails } = await import("../routers/checkout");
            void fireCheckoutPaidEmails(
              { ...m, status: "paid", reservationId: r.reservationId, confirmationCode: r.confirmationCode },
              intentId,
            );
          }
          markProcessed(db, event.id);
        } catch (err: any) {
          console.error(`[Card2b] webhook (diferido) falhou intent ${intentId}:`, err?.message);
          // Sem processed_at: uma reentrega do mesmo evento volta a tentar.
          markFailed(db, event.id, String(err?.message ?? err));
          // Dinheiro capturado (payment_intent.succeeded) e reserva por
          // criar: alertar já; o sweep de settle continua a tentar.
          const { alertFailedSettle } = await import("../services/checkout-card-charge");
          void alertFailedSettle(intentId, pi.id, String(err?.message ?? err), "webhook-card");
        }
      }, 15_000);
      res.json({ received: true });
    } catch (err: any) {
      console.error("[Card2b] webhook error:", err?.message);
      res.status(400).send(`Webhook Error: ${err?.message}`);
    }
  });
}
