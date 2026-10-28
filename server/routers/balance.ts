/**
 * Pagamento em duas partes, Fase 2b: a página "A segunda parte da sua
 * estadia" (/:lang/booking/balance/:intentId#t=…). O token do link
 * (services/balance-link.ts) é a capacidade: sem ele nada se lê nem se faz.
 * Toda a lógica vive no motor (services/checkout-balance.ts); isto só valida
 * a entrada e passa o IP para o registo da autorização de um cartão novo.
 *
 * Tudo são mutations (POST, token no corpo), também a leitura da vista: uma
 * query do tRPC é um GET com o input na query string, e o token ia parar aos
 * logs do Render e da Cloudflare a cada carregamento e a cada polling.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { requestClientIp } from "../services/ad-signals-store";

const linkInput = z.object({
  intentId: z.string().uuid(),
  token: z.string().min(10).max(200),
});

export const balanceRouter = router({
  /** A vista da página (antes balance.get, uma query: GET com o token na URL). */
  view: publicProcedure.input(linkInput).mutation(async ({ input }) => {
    const { guestBalanceView } = await import("../services/checkout-balance");
    return guestBalanceView(input.intentId, input.token);
  }),

  preparePayment: publicProcedure.input(linkInput).mutation(async ({ input }) => {
    const { prepareGuestPayment } = await import("../services/checkout-balance");
    return prepareGuestPayment(input.intentId, input.token);
  }),

  startCardChange: publicProcedure.input(linkInput).mutation(async ({ input }) => {
    const { startCardChange } = await import("../services/checkout-balance");
    return startCardChange(input.intentId, input.token);
  }),

  finishCardChange: publicProcedure
    .input(linkInput.extend({
      setupIntentId: z.string().regex(/^seti_[A-Za-z0-9]+$/),
      /** Caixa da autorização do cartão novo, não pré-marcada (spec 6.2). */
      consent: z.literal(true),
      /** Quando a página renderizou o texto da autorização que o hóspede viu
       *  (cardChangeConsent.renderedAt): o hash gravado é o desse texto. */
      consentRenderedAt: z.string().max(40).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { finishCardChange } = await import("../services/checkout-balance");
      return finishCardChange(input.intentId, input.token, {
        setupIntentId: input.setupIntentId,
        consent: input.consent,
        ip: requestClientIp(ctx.req.headers as Record<string, unknown>),
        consentRenderedAt: input.consentRenderedAt,
      });
    }),

  cancel: publicProcedure.input(linkInput).mutation(async ({ input }) => {
    const { guestCancel } = await import("../services/checkout-balance");
    return guestCancel(input.intentId, input.token);
  }),

  help: publicProcedure
    .input(linkInput.extend({ message: z.string().max(1000).default("") }))
    .mutation(async ({ input }) => {
      const { guestHelp } = await import("../services/checkout-balance");
      return guestHelp(input.intentId, input.token, { message: input.message });
    }),

  /** Sem token (o link expirou): só reenvia para o email da reserva, sempre "ok". */
  resendLink: publicProcedure.input(z.object({ intentId: z.string().uuid() })).mutation(async ({ input }) => {
    const { resendBalanceLink } = await import("../services/checkout-balance");
    await resendBalanceLink(input.intentId);
    // Sempre a mesma resposta: o browser nunca fica a saber se o envio saiu.
    return { ok: true as const };
  }),
});
