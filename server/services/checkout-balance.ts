/**
 * Pagamento em duas partes, Fase 2: o motor que cobra a segunda parte.
 * Regras, estados e porquês em docs/pagamento_duas_partes.md (2.3, 2.4, 2.5,
 * 5.3, 5.5, 5.9). Desligado por omissão: só corre com CHECKOUT_BALANCE=true
 * no serviço de produção (canRunBalanceEngine).
 *
 * Desenho:
 * - Tudo é data-driven: cada passagem lê o estado das linhas na BD e faz só o
 *   passo seguinte. Um deploy falhado ou um processo que morre a meio é
 *   retomado na passagem seguinte, sem memória em processo.
 * - Cada mudança de estado é um UPDATE condicional (claim): duas instâncias
 *   nunca cobram, cancelam ou reembolsam a mesma linha duas vezes.
 * - Nunca se cobra depois de H (hard_stop_at): a lista de cobranças exclui
 *   essas linhas, e o claim volta a verificar a data.
 * - O Guesty é espelho, nunca cobrador: lê-se antes de cada ação, regista-se o
 *   que a plataforma cobrou, e o cartão nunca lá entra.
 */
import { withCheckoutChargeLock } from "../lib/checkout-charge-attempt";
import { isPreviewDeployment } from "../lib/preview-isolation";
import { lisbonToday } from "@shared/cancellationPolicy";
import { addDays, lisbonWallTimeToUtc, readTwoPartsConfig, TWO_PARTS_RULES } from "./payment-plan";
import { siteOriginForSchedule } from "./checkout-plan";
import type { BalanceScope } from "../db";
import type { CheckoutScheduledPayment as CheckoutScheduledPaymentRow } from "../../drizzle/schema";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Quanto tempo uma linha pode ficar em `charging` antes de o sweep a reler. */
export const STUCK_CHARGING_MS = 30 * MINUTE;
/** Leitura do Guesty inválida antes de cobrar: tenta de novo daqui a isto. */
export const GUESTY_UNREADABLE_RETRY_MS = HOUR;
/** Lembrete E1 só se a confirmação tiver mais do que isto (spec 2.4). */
export const REMINDER_MIN_AGE_MS = 48 * HOUR;

/* ════════════════════════════════════════════════════════════════
   Guarda e âmbito
   ════════════════════════════════════════════════════════════════ */

/**
 * O serviço de produção (o mesmo filtro de canRunBalanceEngine, sem a flag):
 * onde o digest diário sai e onde os efeitos de um pagamento do hóspede
 * correm mesmo com o motor desligado (spec 3.1 #7: com CHECKOUT_BALANCE a
 * false o site continua a aceitar pagamentos pela página e alguém tem de ver
 * as linhas abertas todos os dias).
 */
export function isBalanceProductionService(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production") return false;
  if (!env.RENDER_SERVICE_ID) return false;
  return !isPreviewDeployment(env);
}

/**
 * O motor só corre no serviço de produção, com a flag ligada. A BD já foi
 * partilhada com o DEV (incidente de 16 set 2026); um DEV que cobrasse linhas
 * reais seria o pior erro possível deste projeto. CHECKOUT_BALANCE=false
 * desliga-o em produção sem deploy.
 */
export function canRunBalanceEngine(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CHECKOUT_BALANCE !== "true") return false;
  return isBalanceProductionService(env);
}

/** As linhas que este processo pode tocar: o modo da chave Stripe e a origem do site. */
export function balanceScope(env: NodeJS.ProcessEnv = process.env): BalanceScope {
  return { livemode: readTwoPartsConfig(env).livemode, siteOrigin: siteOriginForSchedule(env) };
}

/* ════════════════════════════════════════════════════════════════
   Calendário (puro)
   ════════════════════════════════════════════════════════════════ */

/** Dia de calendário em Lisboa de um instante. */
export function lisbonDay(at: Date): string {
  return lisbonToday(at);
}

/** Retentativas automáticas (só recusas soft): C+1 e C+3 às 10:00 de Lisboa. */
export function retryDatesFor(chargeAt: Date): Date[] {
  const day = lisbonDay(chargeAt);
  return TWO_PARTS_RULES.retryOffsetsDays.map((o) => lisbonWallTimeToUtc(addDays(day, o), 10, 0));
}

/**
 * Próxima tentativa automática depois de uma recusa soft. `attemptsMade`
 * conta as tentativas do sweep já feitas (a 1.ª é em C). Sem mais
 * retentativas, ou se a próxima já cai em H ou depois, devolve null: a linha
 * passa a `needs_action` e só o hóspede (ou H) a resolve.
 */
export function nextRetryAt(row: Pick<CheckoutScheduledPaymentRow, "chargeAt" | "hardStopAt">, attemptsMade: number, now: Date): Date | null {
  if (attemptsMade < 1) return null;
  const retries = retryDatesFor(new Date(row.chargeAt));
  const byCount = retries[attemptsMade - 1];
  // Um "Cobrar agora" do admin também conta em attempts: a contagem sozinha
  // saltava uma retentativa que o E3 prometeu e ainda está por vir. Vale a
  // próxima data que falta; só uma retentativa já passada (sweep atrasado) é
  // compensada daqui a uma hora.
  const ahead = retries.find((r) => r.getTime() > now.getTime());
  const at = byCount && byCount.getTime() <= now.getTime() ? new Date(now.getTime() + HOUR) : ahead;
  if (!at) return null;
  return at.getTime() < new Date(row.hardStopAt).getTime() ? at : null;
}

/**
 * H depois do aviso escrito de falha (spec 2.3): o maior de C+7 às 12:00 e
 * aviso+7 dias, limitado a D−1 às 12:00. `complete` diz se os 7 dias de aviso
 * cabem antes desse limite; se não couberem, ninguém cancela sozinho: a linha
 * vai para decisão humana antes do fim do cancelamento gratuito.
 */
export function hardStopAfterNotice(
  row: Pick<CheckoutScheduledPaymentRow, "chargeAt" | "freeCancelDeadline">,
  noticeSentAt: Date,
): { hardStopAt: Date; complete: boolean } {
  const cPlus7 = lisbonWallTimeToUtc(addDays(lisbonDay(new Date(row.chargeAt)), TWO_PARTS_RULES.noticeDays), 12, 0);
  const noticePlus7 = new Date(noticeSentAt.getTime() + TWO_PARTS_RULES.noticeDays * DAY);
  const limit = hardStopLimit(row);
  const wanted = Math.max(cPlus7.getTime(), noticePlus7.getTime());
  const hardStopAt = new Date(Math.min(wanted, limit.getTime()));
  return { hardStopAt, complete: noticePlus7.getTime() <= hardStopAt.getTime() };
}

/** Janela do escudo "o hóspede está a pagar" (spec 2.4: 60 minutos). */
const GUEST_ACTIVE_MS = HOUR;

/** O hóspede agiu na página do saldo na última hora ("Pagar agora", também a
 *  reutilizar o PI, ou "Usar outro cartão"): nada se cancela, pausa ou cobra
 *  por cima dele. Sem guest_active_at não há escudo. */
export function guestIsActive(row: Pick<CheckoutScheduledPaymentRow, "guestActiveAt">, now: Date): boolean {
  if (!row.guestActiveAt) return false;
  const at = new Date(row.guestActiveAt).getTime();
  return Number.isFinite(at) && now.getTime() - at < GUEST_ACTIVE_MS;
}

/** Último sinal de que o hóspede está a pagar: a ação dele na página
 *  (guest_active_at) ou a criação do PI dele, o mais recente. 0 sem nenhum. */
function guestPayingSince(row: Pick<CheckoutScheduledPaymentRow, "guestActiveAt">, guestPi: { created?: number | null } | null): number {
  const active = row.guestActiveAt ? new Date(row.guestActiveAt).getTime() : 0;
  const created = guestPi && typeof guestPi.created === "number" ? guestPi.created * 1000 : 0;
  return Math.max(Number.isFinite(active) ? active : 0, created);
}

/** O cartão de um PI da Stripe (id, expandido ou não). */
function pmOf(pi: { payment_method?: string | { id?: string } | null }): string | undefined {
  return typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
}

/** O H mais tardio possível: D − 1 às 12:00 de Lisboa. */
function hardStopLimit(row: Pick<CheckoutScheduledPaymentRow, "freeCancelDeadline">): Date {
  return lisbonWallTimeToUtc(addDays(lisbonDay(new Date(row.freeCancelDeadline)), -1), 12, 0);
}

/** Os 7 dias de aviso escrito cabem antes de H (a paragem dura vai poder cancelar)? */
function noticeFitsBeforeHardStop(row: Pick<CheckoutScheduledPaymentRow, "failureNoticeSentAt" | "hardStopAt">): boolean {
  if (!row.failureNoticeSentAt) return false;
  return new Date(row.failureNoticeSentAt).getTime() + TWO_PARTS_RULES.noticeDays * DAY <= new Date(row.hardStopAt).getTime();
}

/** Os 7 dias de aviso escrito estão cumpridos neste instante? */
export function noticePeriodComplete(row: Pick<CheckoutScheduledPaymentRow, "failureNoticeSentAt">, now: Date): boolean {
  if (!row.failureNoticeSentAt) return false;
  return new Date(row.failureNoticeSentAt).getTime() + TWO_PARTS_RULES.noticeDays * DAY <= now.getTime();
}

/** Que lembrete enviar agora (E1 a C−7, E2 a C−1, às 09:00 de Lisboa), ou nenhum. */
export function reminderDue(
  row: Pick<CheckoutScheduledPaymentRow, "chargeAt" | "reminderStage" | "createdAt">,
  now: Date,
): { to: 1 | 2; send: boolean } | null {
  const cDay = lisbonDay(new Date(row.chargeAt));
  const e1 = lisbonWallTimeToUtc(addDays(cDay, -7), 9, 0);
  const e2 = lisbonWallTimeToUtc(addDays(cDay, -1), 9, 0);
  const stage = Number(row.reminderStage ?? 0);
  if (now.getTime() >= e2.getTime() && stage < 2) return { to: 2, send: now.getTime() < new Date(row.chargeAt).getTime() };
  if (now.getTime() >= e1.getTime() && stage < 1) {
    // Uma confirmação com menos de 48 h não recebe "falta uma semana" minutos
    // depois: salta-se o E1 e fica só o E2.
    const age = now.getTime() - new Date(row.createdAt ?? 0).getTime();
    return { to: 1, send: age >= REMINDER_MIN_AGE_MS };
  }
  return null;
}

/** O cartão expira antes da data da cobrança? (último dia do mês de validade) */
export function cardExpiresBefore(row: Pick<CheckoutScheduledPaymentRow, "cardExpMonth" | "cardExpYear">, at: Date): boolean {
  const m = Number(row.cardExpMonth);
  const y = Number(row.cardExpYear);
  if (!m || !y) return false;
  const endOfMonth = Date.UTC(y, m, 1) - 1; // mês seguinte, menos 1 ms
  return endOfMonth < at.getTime();
}

/* ════════════════════════════════════════════════════════════════
   Dependências (importadas no momento, para os testes as poderem simular)
   ════════════════════════════════════════════════════════════════ */

const db = () => import("../db");
const stripe = () => import("./stripe-balance");
const guesty = () => import("./guesty-balance");
const guestyPay = () => import("./guesty-openapi-paypal");
const mail = () => import("./transactional-email");
const sms = () => import("./sms");
const links = () => import("./balance-link");

function escapeOps(text: string): string {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function opsAlert(subject: string, lines: string[]): Promise<void> {
  try {
    const { sendOpsAlert } = await mail();
    // As linhas levam dados do hóspede (mensagens, telefone, email) e o nome
    // da casa: nunca HTML cru nos emails da equipa.
    await sendOpsAlert(escapeOps(subject), lines.map(escapeOps), { copyToSales: true });
  } catch (err: any) {
    console.error(`[Balance] alerta nao enviado (${subject}): ${err?.message}`);
  }
}

function eurLabel(cents: number): string {
  return `${(cents / 100).toFixed(2)} EUR`;
}

function rowLabel(row: CheckoutScheduledPaymentRow): string {
  return `${row.confirmationCode || row.reservationId} · ${row.propertyName || row.listingId} · ${row.checkIn}`;
}

/** Link sem login para a página do saldo, válido até max(H, D) + 3 dias. */
async function balanceLink(row: CheckoutScheduledPaymentRow): Promise<string> {
  const { balanceLinkUrl, balanceLinkExpiresAt } = await links();
  return balanceLinkUrl(row.intentId, row.locale, balanceLinkExpiresAt(row));
}

async function guestFirstName(row: CheckoutScheduledPaymentRow): Promise<string | null> {
  try {
    const { getBookingIntent } = await db();
    const m: any = await getBookingIntent(row.intentId);
    return (m?.guestFirstName as string) || null;
  } catch {
    return null;
  }
}

/* ════════════════════════════════════════════════════════════════
   Cobrança de uma linha
   ════════════════════════════════════════════════════════════════ */

export type ChargeResult =
  | "not-claimed"
  | "succeeded"
  | "processing"
  | "retry"
  | "needs_action"
  | "paid_externally"
  | "needs_review"
  | "released";

/**
 * Cobra a segunda parte de uma linha, uma tentativa. Serve o sweep (C e
 * retentativas) e, na Fase 2b, a página do saldo ("pagar agora") e o admin.
 * Ordem: claim → PI anterior pelo estado real → leitura válida do Guesty →
 * criar PI (confirm:false) → gravar o id → confirmar off-session.
 */
export async function chargeScheduledPayment(
  row: CheckoutScheduledPaymentRow,
  source: "sweep" | "guest" | "admin",
  now = new Date(),
): Promise<ChargeResult> {
  return withCheckoutChargeLock(`balance:${row.intentId}`, () => chargeUnlocked(row, source, now));
}

async function chargeUnlocked(listed: CheckoutScheduledPaymentRow, source: "sweep" | "guest" | "admin", now: Date): Promise<ChargeResult> {
  const D = await db();
  const S = await stripe();
  // `now` é a hora desta linha (o sweep passa o relógio a cada linha, nunca a
  // hora de início da passagem): uma passagem lenta não cobra depois de H.
  if (new Date(listed.hardStopAt).getTime() <= now.getTime()) return "not-claimed"; // nunca depois de H
  if (!(await D.claimScheduledPaymentForCharge(listed.id, source, now))) return "not-claimed";
  // A linha relida depois do claim: um PI do hóspede gravado entre a lista e
  // o claim tem de ser visto antes de qualquer cobrança.
  const row = (await D.getScheduledPaymentById(listed.id)) ?? listed;
  // De onde veio o claim (gravado no mesmo UPDATE); a leitura da lista só
  // serve numa linha anterior à coluna.
  const previous = claimedFrom(row) ?? (listed.status as "scheduled" | "retry" | "needs_action");
  const attempt = Number(row.attempts ?? 1);
  const release = (nextAttemptAt: Date, error: string) =>
    D.releaseChargeClaim(row.id, { toStatus: previous, nextAttemptAt, error });
  // Erro técnico (Stripe, chave, cliente), não uma recusa do banco: adia uma
  // hora. Passadas 6 h desde C, alguém tem de saber (cada libertação empurra
  // next_attempt_at e o monitor de atrasos nunca a apanha; o hóspede não
  // recebe aviso nenhum porque nada foi recusado).
  const releaseTechnical = async (error: string) => {
    await release(new Date(now.getTime() + HOUR), error);
    if (now.getTime() - new Date(row.chargeAt).getTime() > 6 * HOUR) {
      await throttledAlert(row.id, "charge-technical", `DUAS PARTES: cobrança adiada por erro técnico — ${rowLabel(row)}`, [
        `A 2.ª parte (${eurLabel(row.balanceCents)}) está por cobrar desde ${new Date(row.chargeAt).toISOString()} e a última tentativa falhou por erro técnico (não foi uma recusa do banco).`,
        `Último erro: ${error}`,
        `O sistema tenta de hora a hora até ${new Date(row.hardStopAt).toISOString()}; o hóspede não foi avisado de nenhuma falha. Verificar a Stripe (cliente, cartão guardado, chave).`,
      ]);
    }
  };

  // 1) Uma tentativa anterior (do sweep ou do hóspede na página) pode ter
  //    cobrado (webhook perdido, processo que morreu depois do confirm). Age-se
  //    pelo estado real de cada PI, nunca às cegas. Um PI do hóspede a meio do
  //    3DS tem prioridade: o sweep não cobra por cima dele.
  const priorIds = Array.from(new Set([row.guestPaymentIntentId, row.balancePaymentIntentId].filter(Boolean) as string[]));
  for (const priorId of priorIds) {
    try {
      const prev = await S.retrieveBalancePaymentIntent(priorId);
      if (prev.status === "succeeded") {
        await D.markScheduledPaymentSucceeded(row.id, prev.id, now);
        return "succeeded";
      }
      if (prev.status === "processing" || prev.status === "requires_capture") {
        // O banco ainda está a decidir: nem cobrar outra vez nem soltar. O
        // webhook fecha-a; o sweep relê as linhas presas em `charging`.
        return "processing";
      }
      // O hóspede está a confirmar na página (à espera do 3DS): espera-se por
      // ele durante 1 h desde o último sinal dele, a ação na página
      // (guest_active_at, também quando reutiliza o PI) ou a criação do PI.
      // Nunca pelo claimed_at da linha, que o claim do sweep reescreve. Um PI
      // no cartão antigo (o hóspede trocou de cartão depois) já não é ele a
      // pagar: fecha-se e cobra-se no cartão novo, como o E6 diz.
      const guestBusy =
        priorId === row.guestPaymentIntentId &&
        source !== "guest" &&
        (prev.status === "requires_action" || prev.status === "requires_confirmation") &&
        pmOf(prev) === row.paymentMethodId &&
        now.getTime() - guestPayingSince(row, prev) < GUEST_ACTIVE_MS;
      if (guestBusy) {
        await release(new Date(now.getTime() + 30 * MINUTE), "hospede a pagar na pagina");
        return "released";
      }
      if (prev.status !== "canceled") {
        const r = await S.cancelOpenPaymentIntent(prev.id);
        if (r === "succeeded") {
          await D.markScheduledPaymentSucceeded(row.id, prev.id, now);
          return "succeeded";
        }
      }
    } catch (err: any) {
      await releaseTechnical(`PI anterior ilegivel: ${String(err?.message ?? err).slice(0, 200)}`);
      return "released";
    }
  }

  // 2) Leitura válida do Guesty antes de cobrar: reserva ativa, as mesmas
  //    datas e casa, ninguém pagou (nem tem um payment link aberto) por fora.
  //    Sem leitura não se decide nada: adia 1 h e, ao fim de 6 h desde C,
  //    chama um humano.
  const G = await guesty();
  const snap = await G.readReservationSnapshot(row.reservationId).catch(() => null);
  if (!snap) {
    await release(new Date(now.getTime() + GUESTY_UNREADABLE_RETRY_MS), "reserva Guesty ilegivel antes da cobranca");
    if (now.getTime() - new Date(row.chargeAt).getTime() > 6 * HOUR) {
      await throttledAlert(row.id, "guesty-unreadable", `DUAS PARTES: Guesty ilegível há mais de 6 h — ${rowLabel(row)}`, [
        `A 2.ª parte (${eurLabel(row.balanceCents)}) devia ter sido cobrada a ${new Date(row.chargeAt).toISOString()}, mas o Guesty não responde para esta reserva.`,
        `A cobrança fica adiada (de hora a hora) até a reserva voltar a ler-se. Verificar a reserva no Guesty.`,
      ]);
    }
    return "released";
  }
  const toReview = async (reason: string, lines: string[]) => {
    await release(new Date(now.getTime() + HOUR), reason);
    await D.markNeedsReview(row.id, reason, new Date(row.hardStopAt));
    await opsAlert(`DUAS PARTES: 2.ª parte suspensa — ${rowLabel(row)}`, [
      ...lines,
      `A cobrança de ${eurLabel(row.balanceCents)} NÃO foi feita e a linha passou a "a rever". Decidir no ecrã Saldos.`,
    ]);
    return "needs_review" as const;
  };
  if (!/^confirmed$/i.test(snap.status)) {
    return toReview(`reserva Guesty em ${snap.status}`, [`Estado no Guesty: ${snap.status}.`]);
  }
  if ((snap.checkIn && snap.checkIn !== row.checkIn) || (snap.checkOut && snap.checkOut !== row.checkOut) || (snap.listingId && snap.listingId !== row.listingId)) {
    return toReview("datas ou casa alteradas no Guesty", [`O Guesty mostra ${snap.checkIn} → ${snap.checkOut} (${snap.listingId}); a 2.ª parte foi autorizada para ${row.checkIn} → ${row.checkOut}.`]);
  }
  const ours = [row.depositPaymentIntentId, row.balancePaymentIntentId, row.guestPaymentIntentId].filter(Boolean) as string[];
  const foreign = G.foreignPayments(snap, ours);
  if (foreign.succeededCents >= row.balanceCents - 100) {
    // Alguém recebeu o saldo por outra via (transferência, link do Guesty).
    // Nunca cobrar outra vez: marca e avisa.
    await release(now, "saldo pago por fora");
    await D.markPaidExternally(row.id, `guesty:${eurLabel(foreign.succeededCents)}`);
    await opsAlert(`DUAS PARTES: 2.ª parte já paga por fora — ${rowLabel(row)}`, [
      `O Guesty mostra ${eurLabel(foreign.succeededCents)} recebidos por outra via. A plataforma NÃO cobrou e não vai cobrar.`,
    ]);
    return "paid_externally";
  }
  if (foreign.succeededCents > 0) {
    return toReview(`pagamento parcial por fora (${eurLabel(foreign.succeededCents)})`, [`O Guesty mostra ${eurLabel(foreign.succeededCents)} recebidos por outra via.`]);
  }
  if (foreign.pendingCents > 0) {
    // Um payment link ou cobrança pendente no Guesty: cobrar agora podia dar
    // um segundo pagamento quando o hóspede usasse o link.
    return toReview("pagamento pendente no Guesty (payment link?)", [`O Guesty tem ${eurLabel(foreign.pendingCents)} pendentes por outra via: apagar o link ou confirmar com o hóspede.`]);
  }

  // 3) Criar sem confirmar, gravar o id e só depois confirmar (spec 5.1):
  //    um processo que morra entre os dois passos deixa o id na linha, e a
  //    próxima tentativa age pelo estado real desse PI. A chave inclui o PI
  //    anterior: uma retoma da mesma tentativa lógica nunca recebe da Stripe o
  //    PI já cancelado.
  const keyNonce = (source === "guest" ? row.guestPaymentIntentId : row.balancePaymentIntentId) ?? "first";
  let pi: any;
  try {
    pi = await S.createBalancePaymentIntent({
      scheduledPaymentId: row.id,
      attempt,
      source,
      keyNonce,
      amountCents: row.balanceCents,
      customer: row.stripeCustomerId,
      paymentMethod: row.paymentMethodId,
      description: `Estadia ${row.propertyName || row.listingId} ${row.checkIn}: 2.a parte`,
      metadata: {
        intentId: row.intentId,
        scheduledPaymentId: row.id,
        reservationId: row.reservationId,
        confirmationCode: row.confirmationCode ?? "",
        attempt: String(attempt),
        source,
      },
    });
  } catch (err: any) {
    await releaseTechnical(`criar PI: ${String(err?.message ?? err).slice(0, 200)}`);
    return "released";
  }
  if (!(await D.setBalancePaymentIntentId(row.id, source === "guest" ? "guestPaymentIntentId" : "balancePaymentIntentId", pi.id))) {
    // A linha saiu de `charging` entretanto (webhook, admin): este PI não pode ficar vivo.
    await S.cancelOpenPaymentIntent(pi.id).catch(() => {});
    return "not-claimed";
  }
  // Última verificação de H antes de mover dinheiro, com a hora do relógio
  // real (a criação do PI pode ter demorado).
  if (Date.now() >= new Date(row.hardStopAt).getTime()) {
    await S.cancelOpenPaymentIntent(pi.id).catch(() => {});
    await release(new Date(row.hardStopAt), "H atingido antes de confirmar");
    return "released";
  }
  const res = await S.confirmBalanceOffSession(pi.id, { scheduledPaymentId: row.id, attempt, source, keyNonce });

  if (res.outcome === "succeeded") {
    await D.markScheduledPaymentSucceeded(row.id, pi.id, now);
    return "succeeded";
  }
  if (res.outcome === "processing") return "processing";
  if (res.outcome === "requires_action") {
    await D.markScheduledPaymentNeedsAction(row.id, { declineCode: "authentication_required", error: "o banco pede confirmacao (3DS)" });
    return "needs_action";
  }
  if (res.outcome === "declined") {
    // Recusa soft: as retentativas automáticas seguem, como o E3 promete. Uma
    // tentativa do admin a partir de scheduled/retry não as apaga; só a partir
    // de needs_action (ou do hóspede) fica tudo com o hóspede.
    const keepsRetries = source === "sweep" || (source === "admin" && previous !== "needs_action");
    if (res.kind === "soft" && keepsRetries) {
      const next = nextRetryAt(row, attempt, now);
      if (next) {
        await D.markScheduledPaymentRetry(row.id, { declineCode: res.declineCode, error: res.message.slice(0, 400), nextAttemptAt: next });
        return "retry";
      }
    }
    await D.markScheduledPaymentNeedsAction(row.id, { declineCode: res.declineCode ?? res.kind, error: res.message.slice(0, 400) });
    return "needs_action";
  }
  // Erro técnico (rede, 5xx): o resultado é desconhecido. Relê o PI antes de
  // decidir; nunca se assume "falhou" com dinheiro possivelmente cobrado.
  try {
    const after = await S.retrieveBalancePaymentIntent(pi.id);
    if (after.status === "succeeded") {
      await D.markScheduledPaymentSucceeded(row.id, pi.id, now);
      return "succeeded";
    }
    if (after.status === "processing") return "processing";
  } catch {
    return "processing"; // fica em `charging`; o sweep das presas relê-o
  }
  await releaseTechnical(`confirmar: ${res.message.slice(0, 200)}`);
  return "released";
}

/** Estado de onde o claim da cobrança veio (claim_prev_status), se válido. */
function claimedFrom(row: Pick<CheckoutScheduledPaymentRow, "claimPrevStatus">): "scheduled" | "retry" | "needs_action" | null {
  const prev = row.claimPrevStatus;
  return prev === "scheduled" || prev === "retry" || prev === "needs_action" ? prev : null;
}

/* ════════════════════════════════════════════════════════════════
   Efeitos depois da cobrança (um claim por efeito)
   ════════════════════════════════════════════════════════════════ */

export async function runPostChargeEffects(row: CheckoutScheduledPaymentRow, now = new Date()): Promise<void> {
  const D = await db();
  const piId = row.balancePaymentIntentId || row.guestPaymentIntentId;
  if (!piId) {
    console.error(`[Balance] linha ${row.id} paga sem PI do saldo gravado — efeitos adiados`);
    return;
  }
  // Guesty: regista a 2.ª parte da estadia, idempotente pela nota com o id do PI.
  if (!row.guestyBalanceRecordedAt && (await D.claimEffect(row.id, "guestyBalanceClaimedAt", now))) {
    try {
      const { recordExternalPayment } = await guestyPay();
      const outcome = await recordExternalPayment(row.reservationId, row.balanceCents / 100, "EUR", piId);
      await D.markGuestyBalanceRecorded(row.id, now);
      if (outcome === "settled") {
        // O folio já estava a zero sem o nosso registo: alguém pode ter
        // recebido o saldo por outra via, e a plataforma cobrou-o também.
        await opsAlert(`DUAS PARTES: verificar pagamento duplicado — ${rowLabel(row)}`, [
          `A plataforma cobrou a 2.ª parte (${eurLabel(row.balanceCents)}, PI ${piId}), mas o folio no Guesty já não tinha saldo.`,
          `Se o hóspede pagou também por outra via, devolver uma das duas.`,
        ]);
      }
    } catch (err: any) {
      // O claim expira em 30 min e o sweep tenta outra vez; o digest mostra-o.
      console.error(`[Balance] registo da 2.a parte no Guesty falhou linha ${row.id}: ${err?.message}`);
    }
  }
  if (!row.noteClaimedAt && (await D.claimEffect(row.id, "noteClaimedAt", now))) {
    const { appendReservationNote } = await guestyPay();
    const noted = await appendReservationNote(
      row.reservationId,
      `Checkout 2.0 em duas partes: 2.a parte ${eurLabel(row.balanceCents)} cobrada pela plataforma (PI ${piId}). ` +
        `Estadia LIQUIDADA pelo site. Qualquer saldo residual e divergencia de preco: NAO cobrar ao hospede.`,
    ).catch(() => false);
    // A nota não se repete (appendReservationNote ignora texto já presente):
    // uma falha liberta o claim para a passagem seguinte.
    if (!noted) await D.releaseEffect(row.id, "noteClaimedAt");
  }
  if (!row.emailPaidClaimedAt && (await D.claimEffect(row.id, "emailPaidClaimedAt", now))) {
    if (!row.email) {
      // Sem email não há E4 possível: o claim fica (a linha sai da lista de
      // efeitos por fechar) e o ops sabe que tem de avisar por outra via.
      await opsAlert(`DUAS PARTES: 2.ª parte paga, hóspede sem email — ${rowLabel(row)}`, [
        `A 2.ª parte (${eurLabel(row.balanceCents)}) foi cobrada. Avisar o hóspede por telefone (${row.phone ?? "sem telefone"}).`,
      ]);
    } else {
      const { sendBalancePaid } = await mail();
      const sent = await sendBalancePaid({
        email: row.email,
        locale: row.locale,
        guestFirstName: await guestFirstName(row),
        propertyName: row.propertyName ?? "",
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        amountCents: row.balanceCents,
        totalPaidCents: row.depositCents + row.balanceCents,
        cardLast4: row.cardLast4,
        confirmationCode: row.confirmationCode ?? "",
      }).catch(() => false);
      if (!sent) await D.releaseEffect(row.id, "emailPaidClaimedAt");
    }
  }
}

/* ════════════════════════════════════════════════════════════════
   Cancelamento e reembolso (H, ou decisão humana)
   ════════════════════════════════════════════════════════════════ */

/**
 * Cancela uma linha já em `cancelling`: PIs abertos, reserva no Guesty,
 * reembolso integral da 1.ª parte, email ao hóspede só com o reembolso feito,
 * estado final. Cada passo tem o seu claim e é retomável: uma passagem que
 * morra a meio continua na seguinte (listCancelling).
 */
/**
 * Quem pediu o cancelamento, gravado no claim (review_reason):
 * - "unpaid": a plataforma, em H, por falta da 2.ª parte (devolve tudo, E5);
 * - "guest": o hóspede na página, dentro do prazo (Flex retido depois de 14
 *   dias, devolve também a 2.ª parte se paga, E7);
 * - "admin": a equipa no ecrã Saldos ("devolver tudo"; email kind "team",
 *   neutro: "Cancelámos a sua reserva e devolvemos…", sem "a seu pedido" nem
 *   "dentro do prazo", que podem não ser verdade).
 */
export type CancellationKind = "unpaid" | "guest" | "admin";

export function cancellationKindFromReason(reason: string | null | undefined): CancellationKind {
  if (reason === "cancel:guest") return "guest";
  if (reason === "cancel:admin") return "admin";
  return "unpaid";
}

export async function runCancellation(row: CheckoutScheduledPaymentRow, kind: CancellationKind, now = new Date()): Promise<"done" | "pending" | "paid"> {
  const D = await db();
  const S = await stripe();
  const alreadyPaid = !!row.succeededAt;

  // 1) PIs abertos do saldo: se um deles acabou de ser pago, não se cancela nada.
  //    Corre em todas as passagens (cancelar um PI é idempotente): um claim
  //    sem marca de "feito" deixaria uma passagem retomada saltar este passo e
  //    cancelar a reserva com um pagamento ainda vivo. Numa linha já paga (o
  //    hóspede cancela depois da 2.ª parte), o PI pago é o esperado: não trava.
  for (const id of [row.balancePaymentIntentId, row.guestPaymentIntentId].filter(Boolean) as string[]) {
    if (alreadyPaid && id === row.balancePaymentIntentId) continue;
    let r: Awaited<ReturnType<typeof S.cancelOpenPaymentIntent>>;
    try {
      r = await S.cancelOpenPaymentIntent(id);
    } catch (err: any) {
      // PI ainda em processamento (ou ilegível): a 2.ª parte pode chegar.
      // Nada se cancela nem devolve; a passagem seguinte tenta outra vez.
      console.warn(`[Balance] cancelamento adiado linha ${row.id}: PI ${id} ${err?.message}`);
      return "pending";
    }
    if (r === "succeeded") {
      if (alreadyPaid) {
        // Um segundo pagamento numa linha já paga: o webhook devolve-o
        // (refundDuplicate); o cancelamento segue com o pagamento conhecido.
        continue;
      }
      await D.markCancellingAsSucceeded(row.id, id, now);
      await opsAlert(`DUAS PARTES: 2.ª parte paga no momento do cancelamento — ${rowLabel(row)}`, [
        `O pagamento ${id} chegou enquanto a reserva ia ser cancelada. NADA foi cancelado nem reembolsado; a reserva segue paga.`,
      ]);
      return "paid";
    }
  }

  // 2) Reserva no Guesty (irreversível; só depois de os PIs estarem fechados).
  //    Sem o cancelamento confirmado no Guesty, nada avança: o reembolso só
  //    sai com a casa liberta, e um claim perdido (outra passagem ou outra
  //    instância a meio) espera em vez de saltar o passo.
  if (!row.guestyCancelledAt) {
    if (!(await D.claimEffect(row.id, "guestyCancelClaimedAt", now))) return "pending";
    const G = await guesty();
    const r = await G.cancelGuestyReservation(row.reservationId, {
      canceledBy: kind === "guest" ? "GUEST" : "HOST",
      reason: kind === "unpaid" ? "2.a parte por pagar no prazo" : kind === "guest" ? "cancelada pelo hospede" : "cancelada pela equipa",
      note:
        kind === "unpaid"
          ? `Cancelada automaticamente pela plataforma: 2.a parte de ${eurLabel(row.balanceCents)} por pagar ao fim do prazo de aviso. A 1.a parte vai ser reembolsada pela plataforma.`
          : kind === "guest"
            ? `Cancelada pelo hospede dentro do prazo gratuito. O reembolso e feito pela plataforma.`
            : `Cancelada pela equipa no ecra Saldos, com reembolso integral feito pela plataforma.`,
    });
    if (r !== "canceled" && r !== "already-canceled") {
      await throttledAlert(row.id, "guesty-cancel", `DUAS PARTES: cancelamento no Guesty por fazer — ${rowLabel(row)}`, [
        `O Guesty respondeu "${r}" ao cancelamento automático. O sweep volta a tentar em 30 min.`,
        `Se persistir: cancelar a reserva à mão no Guesty. O reembolso só sai depois do cancelamento.`,
      ]);
      return "pending";
    }
    await D.markGuestyCancelled(row.id, now);
  }

  // 3) Reembolso. Falta de pagamento: devolve-se tudo (estadia, receção,
  //    extras e Flex: foi a PA a cancelar dentro do prazo gratuito; spec 2.4,
  //    decisão 5). Hóspede: o Flex fica retido depois de 14 dias da compra, e
  //    a 2.ª parte (se já foi cobrada) também volta.
  let refund: { refundId: string | null; refundCents: number; status: string } | null = null;
  if (!row.refundStatus) {
    if (!(await D.claimEffect(row.id, "refundClaimedAt", now))) return "pending";
    try {
      const plan = kind === "guest" ? await guestRefundPlan(row, now) : { depositWithholdCents: 0, totalCents: 0 };
      const dep = await S.refundRemaining({
        paymentIntentId: row.depositPaymentIntentId,
        intentId: row.intentId,
        scheduledPaymentId: row.id,
        reason: kind === "unpaid" ? "two_parts_unpaid" : kind === "guest" ? "two_parts_guest_cancel" : "two_parts_admin_cancel",
        withholdCents: plan.depositWithholdCents,
      });
      refund = dep;
      if (kind !== "unpaid" && alreadyPaid && row.balancePaymentIntentId) {
        const bal = await S.refundRemaining({
          paymentIntentId: row.balancePaymentIntentId,
          intentId: row.intentId,
          scheduledPaymentId: row.id,
          reason: kind === "guest" ? "two_parts_guest_cancel" : "two_parts_admin_cancel",
        });
        const ok = new Set(["succeeded", "pending", "nothing"]);
        refund = {
          refundId: dep.refundId ?? bal.refundId,
          refundCents: dep.refundCents + bal.refundCents,
          // O pior dos dois decide: um reembolso falhado não pode passar por feito.
          status: !ok.has(dep.status) ? dep.status : !ok.has(bal.status) ? bal.status : dep.status === "nothing" ? bal.status : dep.status,
        };
      }
      await D.markRefund(row.id, { refundId: refund.refundId, refundCents: refund.refundCents, refundStatus: refund.status });
    } catch (err: any) {
      await D.releaseEffect(row.id, "refundClaimedAt");
      await throttledAlert(row.id, "refund", `DUAS PARTES: reembolso por fazer — ${rowLabel(row)}`, [
        `A reserva foi cancelada no Guesty mas o reembolso (PI ${row.depositPaymentIntentId}) falhou: ${String(err?.message ?? err).slice(0, 200)}.`,
        `O sweep volta a tentar. Se persistir, reembolsar no Stripe.`,
      ]);
      return "pending";
    }
  }
  const refundStatus = refund?.status ?? row.refundStatus;
  if (!refundStatus) return "pending";
  // Reembolso falhado que o CS resolveu à mão (markRefundManual: transferência,
  // por exemplo). O dinheiro voltou por outra via: a linha fecha, mas sem o
  // email automático, que diria "devolvemos para o cartão".
  const refundedByHand = refundStatus === "manual";
  if (!refundedByHand && !["succeeded", "pending", "nothing"].includes(refundStatus)) {
    // Reembolso falhado ou à espera de ação: a linha não fecha como cancelada
    // sem o dinheiro devolvido. Fica em `cancelling` e o digest mostra-a.
    await throttledAlert(row.id, "refund-status", `DUAS PARTES: reembolso em "${refundStatus}" — ${rowLabel(row)}`, [
      `A reserva foi cancelada no Guesty, mas o reembolso (PI ${row.depositPaymentIntentId}) está em "${refundStatus}".`,
      `Resolver no Stripe; o hóspede ainda não recebeu o email de cancelamento.`,
    ]);
    return "pending";
  }
  const refundCents = refund?.refundCents ?? Number(row.refundCents ?? 0);

  // 4) Email ao hóspede só com o reembolso feito ou em curso (spec 2.4). Um
  //    envio falhado liberta o claim: a passagem seguinte tenta outra vez, e
  //    a linha só fecha com o hóspede avisado (ou sem email possível).
  //    Um claim que já existe na leitura é de outra passagem: com menos de
  //    30 min está (ou pode estar) a enviar, e a linha não fecha por cima
  //    dele; o envio pode ainda falhar e libertar o claim. Passados 30 min
  //    (o prazo dos claims de efeito) fecha como antes.
  if (row.email && !refundedByHand && row.emailCancelClaimedAt &&
      now.getTime() - new Date(row.emailCancelClaimedAt).getTime() < EMAIL_CLAIM_FRESH_MS) {
    return "pending";
  }
  let guestTold = !row.email || (!refundedByHand && !!row.emailCancelClaimedAt);
  if (row.email && !refundedByHand && !row.emailCancelClaimedAt) {
    if (!(await D.claimEffect(row.id, "emailCancelClaimedAt", now))) return "pending";
    const { sendBalanceCancelled } = await mail();
    const sent = await sendBalanceCancelled({
      kind: kind === "unpaid" ? "unpaid" : kind === "guest" ? "guest" : "team",
      email: row.email,
      locale: row.locale,
      guestFirstName: await guestFirstName(row),
      propertyName: row.propertyName ?? "",
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      refundCents,
      confirmationCode: row.confirmationCode ?? "",
      deadlineAt: kind === "unpaid" ? new Date(row.hardStopAt) : null,
      // O reembolso volta aos cartões dos pagamentos (1.ª parte e, se paga, a
      // 2.ª), que podem não ser o cartão atual da linha (troca de cartão).
      refundCardsLast4: await refundCardsFor(row),
      creditNoteRef: row.creditNoteRef,
    }).catch(() => false);
    if (!sent) {
      await D.releaseEffect(row.id, "emailCancelClaimedAt");
      return "pending";
    }
    guestTold = true;
  }
  const done = kind === "unpaid" ? await D.markCancelledUnpaid(row.id, now) : await D.markCancelledByGuest(row.id, now);
  if (done) {
    const told = !row.email
      ? "Sem email do hóspede: avisar por telefone."
      : refundedByHand
        ? "Reembolso resolvido à mão (fora da Stripe): o email automático de cancelamento NÃO foi enviado; confirmar com o hóspede."
        : guestTold ? "Email enviado ao hóspede." : "";
    await opsAlert(`DUAS PARTES: reserva cancelada ${kind === "unpaid" ? "por falta da 2.ª parte" : kind === "guest" ? "pelo hóspede" : "pela equipa"} — ${rowLabel(row)}`, [
      `Reserva cancelada no Guesty e reembolso de ${eurLabel(refundCents)} (${refundStatus}). ${told}`,
      `A casa fica livre para revenda. Nota de crédito: verificar que a Hostkit a emitiu e registá-la no ecrã Saldos.`,
    ]);
  }
  return "done";
}

/** Um claim do email de cancelamento mais novo do que isto é de uma passagem
 *  que ainda pode estar a enviar (o mesmo prazo dos claims de efeito). */
const EMAIL_CLAIM_FRESH_MS = 30 * MINUTE;

/* ── Cartões que recebem um reembolso (E5/E7, página e admin) ─────── */

const REFUND_CARDS_TTL_MS = 10 * MINUTE;
/** Uma leitura falhada guarda-se menos tempo: a seguinte pode já ler. */
const REFUND_CARDS_FAIL_TTL_MS = MINUTE;
const refundCardsCache = new Map<string, { at: number; cards: string[]; ttl: number }>();

/** Últimos 4 dígitos do cartão de um PI (payment_method expandido, ou o
 *  detalhe do pagamento), ou null. Lança se o PI não se ler. */
async function cardLast4Of(piId: string): Promise<string | null> {
  const { getPaymentIntent } = await import("./stripe-klarna");
  const pi: any = await getPaymentIntent(piId, undefined, { expand: ["payment_method"] });
  const last4 = pi?.payment_method?.card?.last4 ?? pi?.latest_charge?.payment_method_details?.card?.last4;
  return /^\d{4}$/.test(String(last4 ?? "")) ? String(last4) : null;
}

/**
 * Para onde vai o dinheiro de um reembolso: os últimos 4 do cartão da 1.ª
 * parte e, se a 2.ª foi cobrada, do cartão que a pagou (sem repetidos, por
 * essa ordem). Lista vazia se algum não se ler: o texto diz então "para o
 * cartão com que pagou", nunca um número que pode estar errado. Guardado
 * 10 min por linha (a página do saldo faz polling).
 */
export async function refundCardsFor(row: CheckoutScheduledPaymentRow): Promise<string[]> {
  const paidPi = row.succeededAt && row.balancePaymentIntentId ? row.balancePaymentIntentId : null;
  const key = `${row.id}:${row.depositPaymentIntentId}:${paidPi ?? ""}`;
  const hit = refundCardsCache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return [...hit.cards];
  let cards: string[] = [];
  let ttl = REFUND_CARDS_TTL_MS;
  try {
    const ids = [row.depositPaymentIntentId, paidPi].filter(Boolean) as string[];
    const found: string[] = [];
    for (const id of ids) {
      const last4 = await cardLast4Of(id);
      if (!last4) throw new Error(`PI ${id} sem cartão legível`);
      if (!found.includes(last4)) found.push(last4);
    }
    cards = found;
  } catch {
    cards = [];
    ttl = REFUND_CARDS_FAIL_TTL_MS;
  }
  for (const [k, v] of refundCardsCache) if (Date.now() - v.at >= v.ttl) refundCardsCache.delete(k);
  refundCardsCache.set(key, { at: Date.now(), cards, ttl });
  return [...cards];
}

const alertThrottle = new Map<string, number>();
/** Só para testes: os travões e caches vivem em memória do processo. */
export function resetBalanceAlertThrottle(): void {
  alertThrottle.clear();
  resendAt.clear();
  resendInFlight.clear();
  refundCardsCache.clear();
}
/**
 * Alertas repetidos da mesma linha e do mesmo problema: no máximo um por
 * janela (6 h por omissão; o digest mostra o resto). Devolve false quando o
 * travão o segurou.
 */
async function throttledAlert(rowId: string, key: string, subject: string, lines: string[], windowMs = 6 * HOUR): Promise<boolean> {
  const k = `${rowId}:${key}`;
  const last = alertThrottle.get(k) ?? 0;
  if (Date.now() - last < windowMs) return false;
  alertThrottle.set(k, Date.now());
  await opsAlert(subject, lines);
  return true;
}

/* ════════════════════════════════════════════════════════════════
   Aviso escrito de falha (E3): o que fixa o prazo H
   ════════════════════════════════════════════════════════════════ */

/** E3b e alerta "cancela amanhã": véspera de H (dia de Lisboa), às 10:00. */
export function lastCallAt(hardStopAt: Date): Date {
  return lisbonWallTimeToUtc(addDays(lisbonDay(hardStopAt), -1), 10, 0);
}

/**
 * Envia o E3 (e o S1) da primeira falha. Os 7 dias da regra Visa contam do
 * aviso ESCRITO: só um email que saiu mesmo (o fornecedor aceitou) fixa
 * `failure_notice_sent_at` e o novo H. Um envio falhado devolve a linha ao
 * estágio 0 e tenta na passagem seguinte; entretanto o H antigo mantém-se, e
 * a paragem dura nunca cancela sem os 7 dias cumpridos (vai para um humano).
 */
/** Folga entre o cálculo de H e o envio do E3: o aviso sai sempre dentro
 *  dela, e os 7 dias contam do envio real. */
const NOTICE_SEND_MARGIN_MS = 15 * MINUTE;

async function sendFailureNotice(row: CheckoutScheduledPaymentRow, at: Date, clock: () => Date): Promise<boolean> {
  const D = await db();
  if (!(await D.claimFailureNoticeStage(row.id, 0, 1, {}))) return false;
  const computedAt = at;
  // H calcula-se como se o aviso saísse no fim da folga: o envio real (logo a
  // seguir) fica sempre antes, e os 7 dias contados dele cabem antes de H.
  const { hardStopAt, complete } = hardStopAfterNotice(row, new Date(computedAt.getTime() + NOTICE_SEND_MARGIN_MS));
  const { classifyDecline } = await stripe();
  const variant = classifyDecline(row.lastDeclineCode, null);
  let link: string | null = null;
  try {
    link = await balanceLink({ ...row, hardStopAt } as CheckoutScheduledPaymentRow);
  } catch (err: any) {
    console.error(`[Balance] link do saldo indisponivel linha ${row.id}: ${err?.message}`);
  }
  let delivered = false;
  if (row.email && link) {
    const M = await mail();
    const retries = retryDatesFor(new Date(row.chargeAt)).filter((d) => d.getTime() > computedAt.getTime());
    delivered = await M.sendBalanceFailed({
      variant,
      email: row.email,
      locale: row.locale,
      guestFirstName: await guestFirstName(row),
      propertyName: row.propertyName ?? "",
      checkIn: row.checkIn,
      amountCents: row.balanceCents,
      nextRetryAt: row.status === "retry" ? new Date(row.nextAttemptAt) : null,
      retryAts: variant === "soft" && row.status === "retry" ? retries : null,
      // Sem valor: o texto diz "devolvemos o que já pagou", sempre verdade
      // (reembolsos por linha já feitos ficariam a mais num valor fixo).
      hardStopAt,
      freeCancelDeadlineAt: new Date(row.freeCancelDeadline),
      cardLast4: row.cardLast4,
      link,
      now: computedAt,
    }).catch(() => false);
  }
  if (!delivered) {
    await D.claimFailureNoticeStage(row.id, 1, 0, {});
    if (!row.email || !link) {
      // Sem email (ou sem link) não há aviso escrito possível: decide um humano.
      await D.markNeedsReview(row.id, "aviso de falha impossivel (sem email ou sem link)", new Date(row.hardStopAt));
      await opsAlert(`DUAS PARTES: aviso de falha por enviar — ${rowLabel(row)}`, [
        `A 2.ª parte (${eurLabel(row.balanceCents)}) falhou e não foi possível enviar o aviso escrito ao hóspede.`,
        `Contactar o hóspede (${row.phone ?? "sem telefone"}) e decidir no ecrã Saldos.`,
      ]);
    }
    return false;
  }
  // O aviso saiu: fixa o relógio dos 7 dias (hora real do envio) e o novo H.
  await D.claimFailureNoticeStage(row.id, 1, 1, { failureNoticeSentAt: clock(), hardStopAt });
  if (row.phone && link) {
    const SMS = await sms();
    const smsSent = await SMS.sendBalanceFailedSms({ phone: row.phone, locale: row.locale, propertyName: row.propertyName, link, hardStopAt, now: computedAt }).catch(() => false);
    // sms_stage só sobe com o SMS aceite: o digest e o admin mostram o que saiu.
    if (smsSent) await D.setSmsStage(row.id, 1).catch(() => false);
  }
  if (!complete) {
    // Os 7 dias contados do aviso já não cabem antes de D−1. As retentativas
    // e o link continuam (é o que o aviso promete), mas a paragem dura nunca
    // cancela sozinha sem os 7 dias: em H a linha passa a decisão humana.
    await opsAlert(`DUAS PARTES: decisão humana antes de ${lisbonDay(new Date(row.freeCancelDeadline))} — ${rowLabel(row)}`, [
      `A 2.ª parte (${eurLabel(row.balanceCents)}) falhou e o aviso de 7 dias já não termina antes do fim do cancelamento gratuito.`,
      `O hóspede foi avisado e pode pagar pelo link; as retentativas continuam. Se não pagar até ${hardStopAt.toISOString()}, a reserva NÃO é cancelada sozinha: decidir no ecrã Saldos.`,
    ]);
  }
  return true;
}

/* ════════════════════════════════════════════════════════════════
   Passagem do sweep
   ════════════════════════════════════════════════════════════════ */

export interface BalanceSweepReport {
  stuck: number;
  reconciled: number;
  reminders: number;
  charged: Record<string, number>;
  effects: number;
  notices: number;
  hardStops: number;
  cancellations: number;
  errors: string[];
}

async function step(report: BalanceSweepReport, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err: any) {
    // Um passo que rebenta não pode impedir os outros (a paragem dura, por
    // exemplo, tem de correr mesmo que a reconciliação falhe).
    const msg = `${name}: ${String(err?.message ?? err).slice(0, 200)}`;
    report.errors.push(msg);
    console.error(`[Balance] ${msg}`);
  }
}

export async function runBalanceSweep(fixedNow?: Date, env: NodeJS.ProcessEnv = process.env): Promise<BalanceSweepReport> {
  // Relógio: em produção a hora real, lida linha a linha (as decisões de H e
  // dos avisos nunca usam a hora de início de uma passagem lenta); nos testes,
  // um instante fixo.
  const clock = fixedNow ? () => fixedNow : () => new Date();
  const now = clock();
  const report: BalanceSweepReport = { stuck: 0, reconciled: 0, reminders: 0, charged: {}, effects: 0, notices: 0, hardStops: 0, cancellations: 0, errors: [] };
  const scope = balanceScope(env);
  const D = await db();

  // 1) Linhas presas em `charging` (processo morreu, banco lento): relê o PI.
  await step(report, "presas", async () => {
    const S = await stripe();
    for (const row of await D.listStuckCharging(scope, new Date(now.getTime() - STUCK_CHARGING_MS))) {
      report.stuck++;
      const piId = row.guestPaymentIntentId && row.claimSource === "guest" ? row.guestPaymentIntentId : row.balancePaymentIntentId;
      if (piId) {
        const pi = await S.retrieveBalancePaymentIntent(piId).catch(() => null);
        if (!pi) continue; // Stripe ilegível: fica para a próxima passagem
        if (pi.status === "succeeded") {
          await D.markScheduledPaymentSucceeded(row.id, pi.id, now);
          continue;
        }
        if (pi.status === "processing") continue;
        await S.cancelOpenPaymentIntent(pi.id).catch(() => {});
      }
      // Volta ao estado de onde o claim veio (claim_prev_status): uma tentativa
      // do admin numa linha agendada (ou em retry) não pode acabar em
      // needs_action, que cortava a cobrança em C (ou as retentativas que o
      // E3 prometeu) e mandava um E3 "o banco recusou" sem recusa nenhuma.
      // Sem a coluna (linhas anteriores), o cálculo antigo: hóspede e admin
      // vinham de needs_action.
      const toStatus = claimedFrom(row) ?? (row.claimSource === "guest" || row.claimSource === "admin"
        ? "needs_action"
        : Number(row.attempts) > 1 ? "retry" : "scheduled");
      // A próxima tentativa marcada antes do claim mantém-se (C de uma linha
      // agendada, a retentativa de uma em retry); vencida, daqui a 5 min. Nunca
      // depois de H.
      const planned = new Date(row.nextAttemptAt).getTime();
      const next = new Date(Math.min(
        Math.max(Number.isFinite(planned) ? planned : 0, now.getTime() + 5 * MINUTE),
        new Date(row.hardStopAt).getTime() - MINUTE,
      ));
      await D.releaseChargeClaim(row.id, { toStatus, nextAttemptAt: next, error: "tentativa presa, retomada" });
    }
  });

  // 2) Reconciliação com o Guesty (linhas com ação nas próximas 24 h e, uma
  //    vez por dia, todas as abertas).
  await step(report, "reconciliacao", async () => {
    const G = await guesty();
    const rows = await D.listForReconciliation(scope, { actionBefore: new Date(now.getTime() + DAY), staleBefore: new Date(now.getTime() - DAY) });
    for (const row of rows) {
      const snap = await G.readReservationSnapshot(row.reservationId).catch(() => null);
      if (!snap) {
        await D.applyReconciliation(row.id, { guestyStatus: null, guestyCheckIn: null, guestyCheckOut: null, guestyListingId: null, guestyTotalCents: null, guestyTotalPaidCents: null, guestyPendingForeignCents: null, error: "leitura invalida" }, now);
        continue;
      }
      report.reconciled++;
      const ours = [row.depositPaymentIntentId, row.balancePaymentIntentId, row.guestPaymentIntentId].filter(Boolean) as string[];
      const foreign = G.foreignPayments(snap, ours);
      await D.applyReconciliation(row.id, {
        guestyStatus: snap.status,
        guestyCheckIn: snap.checkIn,
        guestyCheckOut: snap.checkOut,
        guestyListingId: snap.listingId,
        guestyTotalCents: snap.totalCents,
        guestyTotalPaidCents: snap.totalPaidCents,
        guestyPendingForeignCents: foreign.pendingCents,
        error: null,
      }, now);
      if (row.status === "needs_review") continue; // já à espera de um humano
      if (/cancel/i.test(snap.status)) {
        // Cancelada no Guesty (o CS cancelou à mão, ou o hóspede por um canal):
        // o reembolso depende de linhas (extras com data, Flex) que pedem uma
        // decisão; nunca automático a partir de uma leitura do Guesty.
        await D.markNeedsReview(row.id, "reserva cancelada no Guesty", new Date(row.freeCancelDeadline));
        await opsAlert(`DUAS PARTES: reserva cancelada no Guesty — ${rowLabel(row)}`, [
          `A 2.ª parte (${eurLabel(row.balanceCents)}) deixou de ser cobrada. A 1.ª parte (${eurLabel(row.depositCents)}) continua na conta Stripe.`,
          `Decidir no ecrã Saldos o reembolso: dentro do cancelamento gratuito (até ${lisbonDay(new Date(row.freeCancelDeadline))}) devolve-se tudo.`,
        ]);
        continue;
      }
      const datesChanged =
        (snap.checkIn && snap.checkIn !== row.checkIn) ||
        (snap.checkOut && snap.checkOut !== row.checkOut) ||
        (snap.listingId && snap.listingId !== row.listingId);
      // O total do folio só serve de referência depois de o settle ter
      // registado a 1.ª parte (o acerto do folio, a fee AFE, vem antes): sem
      // isto, a fee lançada pelo settle passava por "total alterado".
      const baselineReady =
        !!row.guestyDepositRecordedAt && !!row.lastReconciledAt &&
        new Date(row.lastReconciledAt).getTime() > new Date(row.guestyDepositRecordedAt).getTime();
      const totalChanged =
        baselineReady && row.guestyTotalCents != null && snap.totalCents != null && Math.abs(snap.totalCents - Number(row.guestyTotalCents)) > 100;
      if (datesChanged || totalChanged) {
        await D.markNeedsReview(row.id, datesChanged ? "datas ou casa alteradas no Guesty" : "total alterado no Guesty", new Date(row.chargeAt));
        await opsAlert(`DUAS PARTES: reserva alterada no Guesty — ${rowLabel(row)}`, [
          `O Guesty mostra ${snap.checkIn} → ${snap.checkOut} (${snap.listingId}), total ${snap.totalCents != null ? eurLabel(snap.totalCents) : "?"}.`,
          `A 2.ª parte (${eurLabel(row.balanceCents)}) ficou suspensa até alguém decidir no ecrã Saldos.`,
        ]);
        continue;
      }
      if (foreign.succeededCents >= row.balanceCents - 100) {
        await D.markPaidExternally(row.id, `guesty:${eurLabel(foreign.succeededCents)}`);
        await opsAlert(`DUAS PARTES: 2.ª parte paga por fora — ${rowLabel(row)}`, [
          `O Guesty mostra ${eurLabel(foreign.succeededCents)} recebidos por outra via. A plataforma não vai cobrar.`,
        ]);
      } else if (foreign.succeededCents > 0) {
        await D.markNeedsReview(row.id, `pagamento parcial por fora (${eurLabel(foreign.succeededCents)})`, new Date(row.chargeAt));
        await opsAlert(`DUAS PARTES: pagamento parcial por fora — ${rowLabel(row)}`, [
          `O Guesty mostra ${eurLabel(foreign.succeededCents)} recebidos por outra via (a 2.ª parte é ${eurLabel(row.balanceCents)}). A cobrança automática ficou suspensa: decidir no ecrã Saldos.`,
        ]);
      } else if (foreign.pendingCents > 0 && !(Number(row.guestyPendingForeignCents ?? 0) > 0)) {
        // Um payment link ou cobrança pendente acabou de aparecer no Guesty:
        // se o hóspede o usar, paga duas vezes. Avisa já, uma vez.
        await opsAlert(`DUAS PARTES: pagamento pendente no Guesty — ${rowLabel(row)}`, [
          `O Guesty tem ${eurLabel(foreign.pendingCents)} pendentes por outra via (payment link?). A 2.ª parte é cobrada pela plataforma: apagar o link no Guesty.`,
          `Enquanto o pendente existir, a cobrança automática não avança.`,
        ]);
      }
    }
  });

  // 3) Lembretes E1 (C−7) e E2 (C−1).
  await step(report, "lembretes", async () => {
    const M = await mail();
    for (const row of await D.listScheduledForReminders(scope, new Date(now.getTime() + 8 * DAY))) {
      const due = reminderDue(row, now);
      if (!due) continue;
      const link = due.send ? await balanceLink(row).catch(() => null) : null;
      if (due.send && !link) continue; // sem segredo do link: nada se consome, tenta depois
      if (due.send) {
        // Um lembrete só sai com a reserva confirmada no Guesty, nas mesmas
        // datas: nunca "falta uma semana" a quem já cancelou com o CS.
        const snap = await (await guesty()).readReservationSnapshot(row.reservationId).catch(() => null);
        if (!snap) continue; // sem leitura: tenta na próxima passagem
        if (!/^confirmed$/i.test(snap.status) || (snap.checkIn && snap.checkIn !== row.checkIn) || (snap.checkOut && snap.checkOut !== row.checkOut)) continue;
      }
      if (!(await D.claimReminderStage(row.id, Number(row.reminderStage ?? 0), due.to))) continue;
      if (!due.send || !row.email || !link) continue;
      report.reminders++;
      await M.sendBalanceReminder({
        stage: due.to,
        email: row.email,
        locale: row.locale,
        guestFirstName: await guestFirstName(row),
        propertyName: row.propertyName ?? "",
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        amountCents: row.balanceCents,
        chargeAt: new Date(row.chargeAt),
        cardBrand: row.cardBrand,
        cardLast4: row.cardLast4,
        cardExpiresBeforeCharge: cardExpiresBefore(row, new Date(row.chargeAt)),
        link,
        now,
      }).catch(() => false);
    }
  });

  // 4) Cobranças devidas (C e retentativas).
  let chargeRowsOk = 0;
  let chargeRowsThrew = 0;
  await step(report, "cobrancas", async () => {
    for (const row of await D.listDueScheduledPayments(scope, now)) {
      let threw = false;
      const r = await chargeScheduledPayment(row, "sweep", clock()).catch((err: any) => {
        threw = true;
        report.errors.push(`cobranca ${row.id}: ${String(err?.message ?? err).slice(0, 200)}`);
        return "released" as ChargeResult;
      });
      if (threw) chargeRowsThrew++;
      else chargeRowsOk++;
      report.charged[r] = (report.charged[r] ?? 0) + 1;
    }
  });

  // 5) Efeitos das cobranças feitas (Guesty, nota, E4).
  await step(report, "efeitos", async () => {
    for (const row of await D.listPostChargeIncomplete(scope)) {
      report.effects++;
      await runPostChargeEffects(row, now);
    }
  });

  // 6) Avisos de falha: E3 (+ SMS) na 1.ª falha, que fixa H; E3b (+ SMS e
  //    alerta ao ops) na véspera de H.
  await step(report, "avisos", async () => {
    for (const row of await D.listFailureNoticeCandidates(scope)) {
      const stage = Number(row.failureNoticeStage ?? 0);
      if (stage === 0) {
        if (await sendFailureNotice(row, clock(), clock)) report.notices++;
        continue;
      }
      // stage 1 → 2 (E3b enviado) ou 3 (véspera fechada sem E3b): véspera de
      // H (dia de Lisboa), a partir das 10:00.
      const H = new Date(row.hardStopAt);
      const at = clock();
      if (at.getTime() < lastCallAt(H).getTime() || at.getTime() >= H.getTime()) continue;
      // Estágio 1 sem a hora do envio: o E3 ainda está a sair noutra passagem.
      if (!row.failureNoticeSentAt) continue;
      const hDay = lisbonDay(H);
      const hTime = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(H);
      if (!noticeFitsBeforeHardStop(row)) {
        // Os 7 dias de aviso não cabem antes de H: em H a linha vai para um
        // humano, nada é cancelado sozinho. Dizer ao hóspede "amanhã
        // cancelamos e devolvemos" (E3b) ou ao ops "cancela amanhã" seria
        // falso. Fecha a véspera sem E3b (estágio 3).
        if (!(await D.claimFailureNoticeStage(row.id, 1, 3, {}))) continue;
        // O alerta "decisão humana" já saiu com o E3 quando foi aí que o H
        // ficou preso em D − 1 às 12:00; só falta se os 7 dias deixaram de
        // caber depois disso.
        if (H.getTime() !== hardStopLimit(row).getTime()) {
          await opsAlert(`DUAS PARTES: não cancela sozinha, decidir antes de ${lisbonDay(new Date(row.freeCancelDeadline))} — ${rowLabel(row)}`, [
            `A 2.ª parte (${eurLabel(row.balanceCents)}) continua por pagar, mas os 7 dias de aviso escrito não terminam antes do prazo H (${H.toISOString()}).`,
            `Em H a reserva NÃO é cancelada sozinha: passa a "a rever". Decidir no ecrã Saldos antes do fim do cancelamento gratuito (${new Date(row.freeCancelDeadline).toISOString()}). Hóspede: ${row.email ?? "?"} · ${row.phone ?? "?"}.`,
          ]);
        }
        continue;
      }
      if (lisbonDay(at) !== addDays(hDay, -1)) {
        // Passou a véspera sem o aviso (servidor parado): no próprio dia de H
        // já não há "amanhã" verdadeiro para dizer ao hóspede. O ops é avisado
        // uma vez e a véspera fecha sem E3b (estágio 3).
        if (!(await D.claimFailureNoticeStage(row.id, 1, 3, {}))) continue;
        await opsAlert(`DUAS PARTES: cancela HOJE às ${hTime} — ${rowLabel(row)}`, [
          `A 2.ª parte (${eurLabel(row.balanceCents)}) continua por pagar e o último aviso ao hóspede não saiu a tempo.`,
          `Hoje às ${hTime} (Lisboa) a reserva é cancelada e a 1.ª parte devolvida, se os 7 dias de aviso estiverem cumpridos. Hóspede: ${row.email ?? "?"} · ${row.phone ?? "?"}.`,
        ]);
        continue;
      }
      if (!(await D.claimFailureNoticeStage(row.id, 1, 2, {}))) continue;
      const link = await balanceLink(row).catch(() => null);
      const M = await mail();
      const SMS = await sms();
      let delivered = false;
      if (row.email && link) {
        delivered = await M.sendBalanceLastCall({
          email: row.email,
          locale: row.locale,
          guestFirstName: await guestFirstName(row),
          propertyName: row.propertyName ?? "",
          checkIn: row.checkIn,
          amountCents: row.balanceCents,
          hardStopAt: H,
          link,
          now: at,
        }).catch(() => false);
      }
      if (row.email && link && !delivered) {
        // Falhou o envio: volta ao estágio 1 e tenta na passagem seguinte
        // (ainda na véspera). SMS e alerta ao ops só com o email enviado.
        await D.claimFailureNoticeStage(row.id, 2, 1, {});
        continue;
      }
      if (!delivered) {
        // Sem email ou sem link não há E3b: a véspera fecha no estágio 3, para
        // o admin e o digest nunca dizerem "último aviso enviado".
        await D.claimFailureNoticeStage(row.id, 2, 3, {});
      }
      report.notices++;
      if (row.phone && link) {
        const smsSent = await SMS.sendBalanceLastCallSms({ phone: row.phone, locale: row.locale, propertyName: row.propertyName, link, hardStopAt: H, now: at }).catch(() => false);
        if (smsSent) await D.setSmsStage(row.id, 2).catch(() => false);
      }
      await opsAlert(`DUAS PARTES: cancela amanhã às ${hTime} — ${rowLabel(row)}`, [
        `A 2.ª parte (${eurLabel(row.balanceCents)}) continua por pagar. Amanhã às ${hTime} (Lisboa) a reserva é cancelada e a 1.ª parte devolvida.`,
        ...(delivered ? [] : [`O último aviso por email NÃO saiu (${row.email ? "link indisponível" : "sem email do hóspede"}).`]),
        `Hóspede: ${row.email ?? "?"} · ${row.phone ?? "?"}. Uma chamada hoje pode salvar a reserva.`,
      ]);
    }
  });

  // 7) Paragem dura (H): cancela e devolve, só com os 7 dias de aviso cumpridos.
  await step(report, "paragem", async () => {
    for (const row of await D.listHardStopDue(scope, now)) {
      const at = clock();
      if (!noticePeriodComplete(row, at)) {
        // Prazo da decisão: D − 1 às 12:00, ou D se esse já passou (o H preso
        // em D − 1 às 12:00 por um aviso que já não cabia).
        const limit = hardStopLimit(row);
        const dueAt = limit.getTime() > at.getTime() ? limit : new Date(row.freeCancelDeadline);
        await D.markNeedsReview(row.id, "prazo H sem 7 dias de aviso cumpridos", dueAt);
        await opsAlert(`DUAS PARTES: prazo atingido sem aviso completo — ${rowLabel(row)}`, [
          row.failureNoticeSentAt
            ? `A 2.ª parte (${eurLabel(row.balanceCents)}) não foi paga e o prazo H passou, mas os 7 dias do aviso escrito (enviado a ${new Date(row.failureNoticeSentAt).toISOString()}) ainda não terminaram.`
            : `A 2.ª parte (${eurLabel(row.balanceCents)}) não foi paga e o prazo H passou, mas o hóspede não teve os 7 dias de aviso (servidor parado ou aviso por enviar).`,
          `Nada foi cancelado nem cobrado. Decidir no ecrã Saldos antes do fim do cancelamento gratuito (${new Date(row.freeCancelDeadline).toISOString()}).`,
        ]);
        continue;
      }
      // Antes de um cancelamento irreversível: o hóspede não está a pagar
      // agora mesmo, e o Guesty confirma que a reserva segue ativa, nas mesmas
      // datas, sem pagamento por fora. Sem leitura válida, espera-se, mas o
      // ops sabe: a passagem seguinte pode continuar sem ler até D.
      const postponed = async (key: string, why: string) => {
        await throttledAlert(row.id, key, `DUAS PARTES: cancelamento automático adiado — ${rowLabel(row)}`, [
          `O prazo H (${new Date(row.hardStopAt).toISOString()}) passou com a 2.ª parte (${eurLabel(row.balanceCents)}) por pagar, mas ${why}.`,
          `Nada foi cancelado; o sistema tenta a cada passagem. O cancelamento gratuito termina a ${new Date(row.freeCancelDeadline).toISOString()}: se persistir, decidir no ecrã Saldos antes disso.`,
        ]);
      };
      if (row.guestPaymentIntentId) {
        const S = await stripe();
        const gpi = await S.retrieveBalancePaymentIntent(row.guestPaymentIntentId).catch(() => null);
        if (!gpi) {
          await postponed("hard-stop-guest-pi", `o pagamento do hóspede na página (${row.guestPaymentIntentId}) não se lê na Stripe`);
          continue;
        }
        if (gpi.status === "succeeded") {
          await D.markScheduledPaymentSucceeded(row.id, gpi.id, at);
          continue;
        }
        // O hóspede está a pagar: a última ação dele na página ou o PI com
        // menos de 1 h (o mais recente dos dois).
        if (gpi.status === "processing" ||
            ((gpi.status === "requires_action" || gpi.status === "requires_confirmation") && at.getTime() - guestPayingSince(row, gpi) < GUEST_ACTIVE_MS)) {
          continue; // o hóspede está a pagar: a próxima passagem decide
        }
      }
      const G = await guesty();
      const snap = await G.readReservationSnapshot(row.reservationId).catch(() => null);
      if (!snap) {
        await postponed("hard-stop-guesty", "a reserva não se lê no Guesty");
        continue;
      }
      if (!/^confirmed$/i.test(snap.status) ||
          (snap.checkIn && snap.checkIn !== row.checkIn) || (snap.checkOut && snap.checkOut !== row.checkOut) ||
          (snap.listingId && snap.listingId !== row.listingId)) {
        await D.markNeedsReview(row.id, "reserva alterada no Guesty no prazo H", null);
        await opsAlert(`DUAS PARTES: prazo H com a reserva alterada no Guesty — ${rowLabel(row)}`, [
          `No momento do cancelamento automático, o Guesty mostra ${snap.status}, ${snap.checkIn} → ${snap.checkOut}. Nada foi cancelado nem reembolsado. Decidir no ecrã Saldos.`,
        ]);
        continue;
      }
      const foreign = G.foreignPayments(snap, [row.depositPaymentIntentId, row.balancePaymentIntentId, row.guestPaymentIntentId].filter(Boolean) as string[]);
      if (foreign.succeededCents >= row.balanceCents - 100) {
        await D.markPaidExternally(row.id, `guesty:${eurLabel(foreign.succeededCents)}`);
        await opsAlert(`DUAS PARTES: 2.ª parte paga por fora no prazo H — ${rowLabel(row)}`, [
          `O Guesty mostra ${eurLabel(foreign.succeededCents)} recebidos por outra via. A reserva NÃO foi cancelada.`,
        ]);
        continue;
      }
      if (foreign.succeededCents > 0 || foreign.pendingCents > 0) {
        await D.markNeedsReview(row.id, "pagamento por fora (parcial ou pendente) no prazo H", null);
        await opsAlert(`DUAS PARTES: prazo H com pagamento por fora — ${rowLabel(row)}`, [
          `O Guesty mostra ${eurLabel(foreign.succeededCents)} recebidos e ${eurLabel(foreign.pendingCents)} pendentes por outra via. Nada foi cancelado. Decidir no ecrã Saldos.`,
        ]);
        continue;
      }
      if (!(await D.claimScheduledPaymentForCancel(row.id, ["retry", "needs_action"], { hardStopNow: at, reason: "cancel:unpaid" }))) continue;
      report.hardStops++;
      const fresh = (await D.getScheduledPaymentById(row.id)) ?? row;
      await runCancellation(fresh, "unpaid", at);
    }
  });

  // 8) Cancelamentos a meio (um passo falhou numa passagem anterior).
  await step(report, "cancelamentos", async () => {
    for (const row of await D.listCancelling(scope)) {
      report.cancellations++;
      // Quem pediu o cancelamento fica gravado no claim (review_reason).
      await runCancellation(row, cancellationKindFromReason(row.reviewReason), now);
    }
  });

  // O pulso só bate com as cobranças e a paragem dura a correr sem erro: um
  // motor que passa mas não consegue cobrar tem de pôr o monitor a vermelho.
  // Linhas a falhar uma a uma também contam quando nenhuma passou: é o mesmo
  // motor parado, só que sem rebentar o passo inteiro.
  const critical =
    report.errors.some((e) => e.startsWith("cobrancas:") || e.startsWith("paragem:")) ||
    (chargeRowsThrew > 0 && chargeRowsOk === 0);
  if (!critical) await D.setBalanceHeartbeat(clock(), scope);
  return report;
}

/* ════════════════════════════════════════════════════════════════
   Webhook da Stripe (só estado; os efeitos correm no sweep, salvo com o
   motor desligado no serviço de produção)
   ════════════════════════════════════════════════════════════════ */

/**
 * payment_intent.succeeded de um PI do saldo: marca a linha paga. Os efeitos
 * (Guesty, nota, E4) correm na passagem seguinte do sweep; com o motor
 * desligado no serviço de produção (CHECKOUT_BALANCE=false, o interruptor de
 * emergência) não há sweep, e correm logo aqui. Um pagamento numa linha já
 * cancelada é dinheiro a devolver: alerta.
 */
export async function handleBalancePaymentSucceeded(
  pi: { id: string; amount: number; metadata?: Record<string, string> | null },
  now = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<"marked" | "already" | "orphan" | "terminal" | "duplicate"> {
  const D = await db();
  // O id gravado na linha muda a cada tentativa: um PI de uma tentativa anterior
  // encontra-se pela metadata (scheduledPaymentId), que só o servidor escreve.
  const row =
    (await D.getScheduledPaymentByBalancePi(pi.id)) ??
    (pi.metadata?.scheduledPaymentId ? await D.getScheduledPaymentById(pi.metadata.scheduledPaymentId) : null);
  if (!row) {
    await opsAlert(`DUAS PARTES: pagamento da 2.ª parte sem linha — ${pi.id}`, [
      `A Stripe confirmou ${eurLabel(pi.amount)} no PI ${pi.id} (intent ${pi.metadata?.intentId ?? "?"}), mas não existe linha agendada com esse PI.`,
      `Verificar no Stripe e no ecrã Saldos; se não houver reserva, reembolsar.`,
    ]);
    return "orphan";
  }
  const paid = alreadyPaidOutcome(row, pi);
  if (paid === "duplicate") return refundDuplicate(row, pi);
  if (paid) {
    // Já marcada por outro caminho ("Pagar agora" que leu o PI pago, ou o
    // cancelamento que o encontrou pago): com o motor desligado ninguém mais
    // corre os efeitos, e esta entrega é a única ocasião (cada efeito tem o
    // seu claim: repetir não duplica nada).
    await postChargeEffectsIfEngineOff(row.id, now, env);
    return "already";
  }
  if (await D.markScheduledPaymentSucceeded(row.id, pi.id, now)) {
    await afterMarkedPaid(row, pi, now, env);
    return "marked";
  }
  if (row.status === "cancelling" && (await D.markCancellingAsSucceeded(row.id, pi.id, now))) {
    await afterMarkedPaid(row, pi, now, env);
    return "marked";
  }
  // Em revisão por uma pausa (do CS ou pedido de ajuda) ou por um aviso que
  // não saiu: o dinheiro entrou e a linha fecha paga. Em revisão pelo Guesty
  // (reserva cancelada ou alterada, pagamento por fora) não: registar a
  // estadia como liquidada e mandar o E4 numa reserva que pode já não existir
  // está errado; a linha fica a rever e o alerta "terminal" abaixo pede a
  // decisão (devolver ou manter).
  const reviewFromGuesty = /guesty|por fora/i.test(row.reviewReason ?? "");
  if (row.status === "needs_review" && !reviewFromGuesty && piBelongsTo(row, pi) && (await D.markReviewAsSucceeded(row.id, pi.id, now))) {
    await opsAlert(`DUAS PARTES: 2.ª parte paga durante a revisão — ${rowLabel(row)}`, [
      `A Stripe confirmou ${eurLabel(pi.amount)} no PI ${pi.id} com a linha "a rever" (${row.reviewReason ?? "sem motivo"}). A linha passou a paga.`,
      `Rever o motivo da revisão: se foi um pagamento por fora, há um possível duplicado a devolver.`,
    ]);
    await afterMarkedPaid(row, pi, now, env);
    return "marked";
  }
  // A linha lida pode estar desatualizada (o sweep marcou-a entretanto):
  // relê antes de alarmar.
  const fresh = await D.getScheduledPaymentById(row.id);
  const freshPaid = fresh ? alreadyPaidOutcome(fresh, pi) : null;
  if (fresh && freshPaid === "duplicate") return refundDuplicate(fresh, pi);
  if (fresh && freshPaid) {
    await postChargeEffectsIfEngineOff(fresh.id, now, env);
    return "already";
  }
  const reason = (fresh ?? row).status === "needs_review" ? (fresh ?? row).reviewReason : null;
  await opsAlert(`DUAS PARTES: 2.ª parte paga numa reserva ${fresh?.status ?? row.status} — ${rowLabel(row)}`, [
    `A Stripe confirmou ${eurLabel(pi.amount)} no PI ${pi.id}, mas a linha está em "${fresh?.status ?? row.status}"${reason ? ` (${reason})` : ""}.`,
    ...(reason
      ? [`A linha continua "a rever": nada foi registado no Guesty nem enviado ao hóspede.`,
         `Se a reserva foi cancelada ou já estava paga por fora, devolver este valor no Stripe. Se a estadia se mantém, registar o pagamento no Guesty e marcar a linha como paga no ecrã Saldos.`]
      : [`Se a reserva foi cancelada, este valor tem de ser devolvido ao hóspede no Stripe.`]),
  ]);
  return "terminal";
}

/** O PI é desta linha: o do hóspede ou do sweep gravado, ou a metadata que
 *  só o servidor escreve. */
function piBelongsTo(row: CheckoutScheduledPaymentRow, pi: { id: string; metadata?: Record<string, string> | null }): boolean {
  return pi.id === row.guestPaymentIntentId || pi.id === row.balancePaymentIntentId || pi.metadata?.scheduledPaymentId === row.id;
}

/**
 * Uma linha que já tinha a 2.ª parte paga (succeeded, ou a cancelar/cancelada
 * depois de paga: succeeded_at preenchido): o mesmo PI é uma repetição
 * ("already"); outro PI é um segundo pagamento, devolvido na hora.
 */
function alreadyPaidOutcome(row: CheckoutScheduledPaymentRow, pi: { id: string }): "already" | "duplicate" | null {
  const paidRow = row.status === "succeeded" ||
    (!!row.succeededAt && (row.status === "cancelling" || row.status === "cancelled_by_guest" || row.status === "cancelled_unpaid"));
  if (!paidRow) return null;
  return row.balancePaymentIntentId && row.balancePaymentIntentId !== pi.id ? "duplicate" : "already";
}

/** Depois de marcar a linha paga: os outros PIs abertos deixam de poder
 *  cobrar e, com o motor desligado em produção, os efeitos correm já. */
async function afterMarkedPaid(row: CheckoutScheduledPaymentRow, pi: { id: string }, now: Date, env: NodeJS.ProcessEnv): Promise<void> {
  // O outro PI aberto (do sweep ou do hóspede) deixa de poder cobrar.
  const S = await stripe();
  for (const other of [row.balancePaymentIntentId, row.guestPaymentIntentId].filter((x) => x && x !== pi.id) as string[]) {
    await S.cancelOpenPaymentIntent(other).catch(() => {});
  }
  await postChargeEffectsIfEngineOff(row.id, now, env);
}

/** Com o motor desligado no serviço de produção (CHECKOUT_BALANCE=false) não
 *  há sweep: sem estes efeitos não há E4, registo no Guesty nem nota "NAO
 *  cobrar", e o folio continua com o saldo em dívida (alguém pode cobrar
 *  outra vez). Só numa linha paga; nunca lança (a resposta do webhook não
 *  depende disto). */
async function postChargeEffectsIfEngineOff(rowId: string, now: Date, env: NodeJS.ProcessEnv): Promise<void> {
  if (!isBalanceProductionService(env) || canRunBalanceEngine(env)) return;
  try {
    const D = await db();
    const paid = await D.getScheduledPaymentById(rowId);
    if (paid?.status === "succeeded") await runPostChargeEffects(paid, now);
  } catch (err: any) {
    console.error(`[Balance] efeitos do pagamento por fazer (motor desligado) linha ${rowId}: ${err?.message}`);
  }
}

/**
 * Duas cobranças da 2.ª parte na mesma linha (hóspede e sweep ao mesmo
 * tempo): a segunda é devolvida na hora e por inteiro. O hóspede nunca paga
 * a mesma metade duas vezes, nem por um minuto mais do que o necessário.
 */
async function refundDuplicate(row: CheckoutScheduledPaymentRow, pi: { id: string; amount: number }): Promise<"duplicate"> {
  const S = await stripe();
  let result = "falhou";
  try {
    const r = await S.refundRemaining({ paymentIntentId: pi.id, intentId: row.intentId, scheduledPaymentId: `${row.id}-dup`, reason: "two_parts_duplicate" });
    result = `${r.status} (${eurLabel(r.refundCents)})`;
  } catch (err: any) {
    result = `falhou: ${String(err?.message ?? err).slice(0, 200)}`;
  }
  await opsAlert(`DUAS PARTES: 2.ª parte cobrada duas vezes — ${rowLabel(row)}`, [
    `A linha já estava paga pelo PI ${row.balancePaymentIntentId}; o PI ${pi.id} (${eurLabel(pi.amount)}) também foi cobrado.`,
    `Reembolso automático do segundo: ${result}. ${result.startsWith("falhou") ? "Reembolsar à mão no Stripe AGORA." : "Nada a fazer."}`,
  ]);
  return "duplicate";
}

/* ════════════════════════════════════════════════════════════════
   Arranque, saúde e digest
   ════════════════════════════════════════════════════════════════ */

let started = false;

export function startBalanceEngine(env: NodeJS.ProcessEnv = process.env): void {
  if (started) return;
  if (!canRunBalanceEngine(env)) {
    console.info("[Balance] Motor da 2.a parte desligado (CHECKOUT_BALANCE != true ou fora do servico de producao)");
    return;
  }
  started = true;
  let running = false;
  const tick = async () => {
    if (running) return; // uma passagem lenta nunca se sobrepõe à seguinte
    running = true;
    try {
      const r = await runBalanceSweep(new Date(), env);
      if (r.errors.length || Object.keys(r.charged).length || r.hardStops) {
        console.info(`[Balance] sweep: ${JSON.stringify(r)}`);
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 10 * MINUTE);
  timer.unref?.();
  const first = setTimeout(() => void tick(), 90 * 1000);
  first.unref?.();
  console.info("[Balance] Motor da 2.a parte agendado (10 min)");
}

/** Saúde do motor para o monitor externo: 503 se ligado e sem passagem há 30 min. */
export async function balanceHealth(now = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<{ ok: boolean; enabled: boolean; lastRunAt: string | null; ageMinutes: number | null }> {
  if (!canRunBalanceEngine(env)) return { ok: true, enabled: false, lastRunAt: null, ageMinutes: null };
  const D = await db();
  const scope = balanceScope(env);
  const last = await D.getBalanceHeartbeat(scope);
  if (!last) return { ok: false, enabled: true, lastRunAt: null, ageMinutes: null };
  const age = Math.round((now.getTime() - last.getTime()) / MINUTE);
  // Cobranças atrasadas mais de 1 h: o motor corre mas não está a cobrar.
  const overdue = await D.listDueScheduledPayments(scope, new Date(now.getTime() - HOUR), 1).catch(() => []);
  return { ok: age <= 30 && overdue.length === 0, enabled: true, lastRunAt: last.toISOString(), ageMinutes: age };
}

/** Digest diário às 09:00 de Lisboa (ops, com cópia à gestão), no serviço de produção. */
export async function sendDailyBalanceDigest(now = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  // Sai também com o motor desligado (spec 3.1 #7: alerta todos os dias
  // enquanto houver linhas abertas); chargesEnabled diz ao digest que nada é
  // cobrado nem cancelado sozinho.
  if (!isBalanceProductionService(env)) return false;
  const D = await db();
  const scope = balanceScope(env);
  const data = await D.listBalanceDigest(scope, now);
  // Motor desligado e nada aberto (antes do lançamento, por exemplo): um email
  // vazio todos os dias só ensina a equipa a ignorar este alerta. Com o motor
  // ligado sai sempre, mesmo vazio: é a prova de que o sweep corre (spec 3.1 #9).
  const chargesEnabled = canRunBalanceEngine(env);
  const OPEN = ["scheduled", "charging", "retry", "needs_action", "needs_review", "cancelling"] as const;
  const openRows = OPEN.reduce((n, st) => n + (Number(data.counts?.[st]) || 0), 0);
  const anything = openRows + data.refundFailures.length + data.postChargeIncomplete.length + data.cancelled24h.length;
  if (!chargesEnabled && anything === 0) return false;
  const heartbeatAt = await D.getBalanceHeartbeat(scope);
  const { sendBalanceDigest } = await mail();
  return sendBalanceDigest({
    ...data,
    generatedAt: now,
    livemode: scope.livemode,
    siteOrigin: scope.siteOrigin,
    heartbeatAt,
    chargesEnabled,
  });
}

/* ════════════════════════════════════════════════════════════════
   Fase 2b: página "A segunda parte da sua estadia" (link com token)
   ════════════════════════════════════════════════════════════════ */

const OPEN_UNPAID = new Set(["scheduled", "retry", "needs_action"]);
/** Dias depois da compra em que o Flex ainda é devolvido num cancelamento do hóspede
 *  (spec 5.9, enquanto a declaração de execução imediata não estiver em produção). */
const FLEX_REFUND_WINDOW_DAYS = 14;
const HELP_PAUSE_DAYS = 5;

export type GuestBalanceView =
  | { kind: "expired"; emailMasked: string | null }
  | { kind: "not_found" }
  | {
      kind: "ok";
      status: string;
      propertyName: string;
      checkIn: string;
      checkOut: string;
      locale: string | null;
      amountLaterCents: number;
      amountPaidCents: number;
      currency: "EUR";
      chargeAt: string;
      hardStopAt: string;
      freeCancelDeadlineAt: string;
      cardBrand: string | null;
      cardLast4: string | null;
      lastDeclineKind: "soft" | "hard" | "auth" | null;
      /** Próxima tentativa automática (só em `retry`). */
      nextAttemptAt: string | null;
      canPayNow: boolean;
      canConfirmSameCard: boolean;
      canChangeCard: boolean;
      canCancelFree: boolean;
      refundIfCancelCents: number | null;
      canRequestHelp: boolean;
      helpPausedUntil: string | null;
      cancelledAt: string | null;
      refundCents: number | null;
      succeededAt: string | null;
      /** Últimos 4 dos cartões que recebem um reembolso (refundCardsFor): só
       *  quando há cancelamento gratuito ou a linha está cancelada; senão []. */
      refundCardsLast4: string[];
      /** Texto da autorização do cartão novo, renderizado agora (renderedAt,
       *  ISO): finishCardChange grava o hash deste mesmo texto. */
      cardChangeConsent: { text: string; version: string; renderedAt: string } | null;
    };

function maskEmail(email: string | null | undefined): string | null {
  const e = String(email ?? "");
  const at = e.indexOf("@");
  if (at < 1) return null;
  return `${e[0]}${"•".repeat(Math.max(1, Math.min(6, at - 1)))}${e.slice(at)}`;
}

/** A linha do link, só se o token for válido e a linha for deste ambiente. */
async function rowForLink(intentId: string, token: string, now: Date): Promise<
  { ok: true; row: CheckoutScheduledPaymentRow } | { ok: false; expired: boolean; email: string | null }
> {
  const D = await db();
  const row = await D.getScheduledPaymentByIntent(intentId);
  const { verifyBalanceLinkToken } = await links();
  if (!row) return { ok: false, expired: false, email: null };
  const scope = balanceScope();
  if (!!row.livemode !== scope.livemode || row.siteOrigin !== scope.siteOrigin) return { ok: false, expired: false, email: null };
  if (!verifyBalanceLinkToken(intentId, token, now)) {
    // Só um token verdadeiro mas fora de prazo é "expirado" (e mostra o email
    // mascarado); um token falso é "não encontrado", sem pistas.
    const exp = Number(String(token).split(".")[0]);
    const genuine = Number.isFinite(exp) && verifyBalanceLinkToken(intentId, token, new Date(exp * 1000 - 1000));
    return { ok: false, expired: genuine, email: genuine ? row.email : null };
  }
  return { ok: true, row };
}

/**
 * O que um cancelamento do hóspede devolve: a 1.ª parte (menos o Flex depois
 * de 14 dias da compra, e menos o que já foi devolvido por linha) e a 2.ª, se
 * já foi cobrada. Lê os PIs reais: a página nunca promete um valor que o
 * reembolso não vai fazer. `fullCents` é o mesmo sem retenção nenhuma (o
 * "devolver tudo" da equipa); `flexCents` o Flex ainda por devolver na 1.ª
 * parte (0 sem Flex ou já devolvido por linha).
 */
export async function guestRefundPlan(row: CheckoutScheduledPaymentRow, now: Date): Promise<{
  depositWithholdCents: number; totalCents: number; fullCents: number; flexCents: number;
}> {
  const { getPaymentIntent } = await import("./stripe-klarna");
  const deposit: any = await getPaymentIntent(row.depositPaymentIntentId, undefined, { expand: ["latest_charge"] });
  const received = Number(deposit.amount_received ?? 0);
  const refunded = Number(deposit.latest_charge?.amount_refunded ?? 0);
  const flexAlreadyRefunded = String(deposit.metadata?.refunded_skus ?? "").split(",").includes("flex");
  const flexCents = flexAlreadyRefunded ? 0 : Number(deposit.metadata?.flexCents ?? 0) || 0;
  // Os 14 dias contam da compra, o pagamento da 1.ª parte (a cobrança), não
  // da criação do PI: o checkout reutiliza um PI aberto quando o hóspede volta
  // dias depois (funil de recuperação), e o created é desse primeiro dia.
  const charge = deposit.latest_charge && typeof deposit.latest_charge === "object" ? deposit.latest_charge : null;
  const boughtSec = typeof charge?.created === "number" ? charge.created : typeof deposit.created === "number" ? deposit.created : null;
  const boughtAt = boughtSec != null ? boughtSec * 1000 : now.getTime();
  const flexWithheld = now.getTime() - boughtAt > FLEX_REFUND_WINDOW_DAYS * DAY ? flexCents : 0;
  const depositLeft = Math.max(0, received - refunded);
  let balanceLeft = 0;
  if (row.succeededAt && row.balancePaymentIntentId) {
    const bal: any = await getPaymentIntent(row.balancePaymentIntentId, undefined, { expand: ["latest_charge"] });
    balanceLeft = Math.max(0, Number(bal.amount_received ?? 0) - Number(bal.latest_charge?.amount_refunded ?? 0));
  }
  return {
    depositWithholdCents: flexWithheld,
    totalCents: Math.max(0, depositLeft - flexWithheld) + balanceLeft,
    fullCents: depositLeft + balanceLeft,
    flexCents,
  };
}

/**
 * Números do reembolso para o ecrã Saldos, com os mesmos cálculos do
 * reembolso real (runCancellation): `policy` é o cancelamento do hóspede
 * (Flex retido depois de 14 dias), `full` o "devolver tudo" da equipa (o
 * remanescente de cada PI, sem retenção). O browser nunca recalcula. Lança
 * se a Stripe não se ler (o admin mostra "sem pré-visualização").
 */
export async function adminRefundPreview(row: CheckoutScheduledPaymentRow, now: Date): Promise<{
  policy: { totalCents: number; flexCents: number; flexWithheldCents: number };
  full: { totalCents: number };
  refundCardsLast4: string[];
}> {
  const plan = await guestRefundPlan(row, now);
  return {
    policy: { totalCents: plan.totalCents, flexCents: plan.flexCents, flexWithheldCents: plan.depositWithholdCents },
    full: { totalCents: plan.fullCents },
    refundCardsLast4: await refundCardsFor(row),
  };
}

/** Estados do reembolso em que o dinheiro voltou (ou está a voltar) ao
 *  cartão; "nothing" = nada a devolver. Fora disto, falhou ou foi à mão. */
const REFUND_TO_CARD = new Set(["succeeded", "pending", "nothing"]);

function freeCancelOpen(row: CheckoutScheduledPaymentRow, now: Date): boolean {
  return now.getTime() <= new Date(row.freeCancelDeadline).getTime();
}

export async function guestBalanceView(intentId: string, token: string, now = new Date()): Promise<GuestBalanceView> {
  const r = await rowForLink(intentId, token, now);
  if (!r.ok) return r.expired ? { kind: "expired", emailMasked: maskEmail(r.email) } : { kind: "not_found" };
  const row = r.row;
  const { classifyDecline } = await stripe();
  const open = OPEN_UNPAID.has(row.status);
  const beforeH = now.getTime() < new Date(row.hardStopAt).getTime();
  const lastDeclineKind = row.lastDeclineCode ? classifyDecline(row.lastDeclineCode, null) : null;
  const canCancelFree = (open || row.status === "succeeded") && freeCancelOpen(row, now);
  let refundIfCancelCents: number | null = null;
  if (canCancelFree) {
    refundIfCancelCents = await guestRefundPlan(row, now).then((p) => p.totalCents).catch(() => null);
  }
  // Para onde vai o dinheiro: só lido quando a página fala de um reembolso.
  const cancelled = row.status === "cancelled_unpaid" || row.status === "cancelled_by_guest" || row.status === "cancelling";
  // Um reembolso que falhou na Stripe (refund.failed, cartão fechado) ou que a
  // equipa devolveu por outra via ("manual") não voltou ao cartão: a página
  // não pode dizer "X foram devolvidos ao cartão ••••1234". Sem valor nem
  // cartões, diz só que a reserva foi cancelada (o CS fala com o hóspede).
  const refundReachedCard = !row.refundStatus || REFUND_TO_CARD.has(String(row.refundStatus));
  const refundCardsLast4 = canCancelFree || (cancelled && refundReachedCard) ? await refundCardsFor(row).catch(() => []) : [];
  let cardChangeConsent: { text: string; version: string; renderedAt: string } | null = null;
  if (open && beforeH) {
    const { renderCardChangeMandate } = await import("./two-parts-mandate");
    const m = renderCardChangeMandate(row.locale, {
      amountLaterCents: row.balanceCents,
      chargeAt: new Date(row.chargeAt),
      freeCancelDeadlineAt: new Date(row.freeCancelDeadline),
      now,
    });
    cardChangeConsent = { text: m.text, version: m.version, renderedAt: now.toISOString() };
  }
  return {
    kind: "ok",
    status: row.status,
    propertyName: row.propertyName ?? "",
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    locale: row.locale,
    amountLaterCents: row.balanceCents,
    amountPaidCents: row.depositCents,
    currency: "EUR",
    chargeAt: new Date(row.chargeAt).toISOString(),
    hardStopAt: new Date(row.hardStopAt).toISOString(),
    freeCancelDeadlineAt: new Date(row.freeCancelDeadline).toISOString(),
    cardBrand: row.cardBrand,
    cardLast4: row.cardLast4,
    lastDeclineKind,
    nextAttemptAt: row.status === "retry" ? new Date(row.nextAttemptAt).toISOString() : null,
    canPayNow: open && beforeH && !!row.paymentMethodId,
    canConfirmSameCard: open && beforeH && lastDeclineKind === "auth",
    canChangeCard: open && beforeH,
    canCancelFree,
    refundIfCancelCents,
    canRequestHelp: open,
    helpPausedUntil: row.helpPausedUntil ? new Date(row.helpPausedUntil).toISOString() : null,
    cancelledAt: row.cancelledAt ? new Date(row.cancelledAt).toISOString() : null,
    refundCents: refundReachedCard ? row.refundCents ?? null : null,
    succeededAt: row.succeededAt ? new Date(row.succeededAt).toISOString() : null,
    refundCardsLast4,
    cardChangeConsent,
  };
}

/**
 * "Pagar agora" (e "Confirmar com o mesmo cartão"): cria o PI do hóspede sem
 * confirmar; o browser confirma-o com o cartão guardado e só pede o 3DS se o
 * banco quiser. A linha não muda de estado: o webhook marca-a paga, e o sweep
 * lê este PI antes de qualquer cobrança automática.
 */
export async function prepareGuestPayment(intentId: string, token: string, now = new Date()): Promise<
  { ok: true; clientSecret: string; paymentMethodId: string; amountCents: number } |
  { ok: false; reason: "expired" | "not_payable" | "processing" | "paid" | "guesty" | "error" }
> {
  const r = await rowForLink(intentId, token, now);
  if (!r.ok) return { ok: false, reason: r.expired ? "expired" : "not_payable" };
  const row = r.row;
  if (row.status === "succeeded" || row.status === "paid_externally") return { ok: false, reason: "paid" };
  if (!OPEN_UNPAID.has(row.status) || now.getTime() >= new Date(row.hardStopAt).getTime() || !row.paymentMethodId) {
    return { ok: false, reason: "not_payable" };
  }
  return withCheckoutChargeLock(`balance:${row.intentId}`, async () => {
    const D = await db();
    const S = await stripe();
    try {
      // 1) PIs anteriores (do hóspede e do sweep), pelo estado real: um que já
      //    pagou (ou está a ser pago) decide tudo, com ou sem leitura do Guesty.
      const priors: any[] = [];
      for (const id of [row.guestPaymentIntentId, row.balancePaymentIntentId].filter(Boolean) as string[]) {
        const prev = await S.retrieveBalancePaymentIntent(id);
        if (prev.status === "succeeded") {
          await D.markScheduledPaymentSucceeded(row.id, prev.id, now);
          return { ok: false as const, reason: "paid" as const };
        }
        if (prev.status === "processing") return { ok: false as const, reason: "processing" as const };
        priors.push(prev);
      }
      // 2) As mesmas verificações da cobrança automática, também antes de
      //    reutilizar um PI já criado: reserva confirmada no Guesty, as mesmas
      //    datas e casa, nenhum pagamento por outra via (feito ou pendente).
      const G = await guesty();
      const snap = await G.readReservationSnapshot(row.reservationId);
      if (!snap || !/^confirmed$/i.test(snap.status)) return { ok: false as const, reason: "guesty" as const };
      if ((snap.checkIn && snap.checkIn !== row.checkIn) || (snap.checkOut && snap.checkOut !== row.checkOut) || (snap.listingId && snap.listingId !== row.listingId)) {
        return { ok: false as const, reason: "guesty" as const };
      }
      const foreign = G.foreignPayments(snap, [row.depositPaymentIntentId, row.balancePaymentIntentId, row.guestPaymentIntentId].filter(Boolean) as string[]);
      if (foreign.succeededCents > 0 || foreign.pendingCents > 0) return { ok: false as const, reason: "guesty" as const };
      // 3) O PI do hóspede ainda serve (o mesmo valor e cartão, por confirmar):
      //    devolve-o, depois de refrescar o escudo de 60 min (guest_active_at),
      //    porque o hóspede pode voltar horas depois e abrir o 3DS mesmo antes de H.
      const reusable = priors.find((p) =>
        p.id === row.guestPaymentIntentId && p.status !== "canceled" && p.amount === row.balanceCents && pmOf(p) === row.paymentMethodId && p.client_secret);
      // Os outros PIs abertos fecham antes: nunca dois PIs vivos para a mesma metade.
      for (const prev of priors) {
        if (prev === reusable || prev.status === "canceled") continue;
        const c = await S.cancelOpenPaymentIntent(prev.id);
        if (c === "succeeded") {
          await D.markScheduledPaymentSucceeded(row.id, prev.id, now);
          return { ok: false as const, reason: "paid" as const };
        }
      }
      if (reusable) {
        if (!(await D.setGuestPaymentIntent(row.id, reusable.id, now))) return { ok: false as const, reason: "not_payable" as const };
        return { ok: true as const, clientSecret: reusable.client_secret as string, paymentMethodId: row.paymentMethodId, amountCents: row.balanceCents };
      }
      const pi = await S.createBalancePaymentIntent({
        scheduledPaymentId: row.id,
        // Muda a cada minuto: um duplo clique devolve o mesmo PI, um regresso
        // mais tarde (com o anterior cancelado) cria outro.
        attempt: Math.floor(now.getTime() / 60_000),
        source: "guest",
        // A key leva também o PI anterior do hóspede: uma nova tentativa no
        // mesmo minuto, depois de um 3DS falhado (PI cancelado logo acima),
        // recebia da Stripe o PI cancelado em vez de um novo.
        keyNonce: row.guestPaymentIntentId ?? "first",
        amountCents: row.balanceCents,
        customer: row.stripeCustomerId,
        paymentMethod: row.paymentMethodId,
        description: `Estadia ${row.propertyName || row.listingId} ${row.checkIn}: 2.a parte`,
        metadata: { intentId: row.intentId, scheduledPaymentId: row.id, reservationId: row.reservationId, confirmationCode: row.confirmationCode ?? "" },
      });
      if (!(await D.setGuestPaymentIntent(row.id, pi.id, now)) || !pi.client_secret) {
        await S.cancelOpenPaymentIntent(pi.id).catch(() => {});
        return { ok: false as const, reason: "not_payable" as const };
      }
      return { ok: true as const, clientSecret: pi.client_secret, paymentMethodId: row.paymentMethodId, amountCents: row.balanceCents };
    } catch (err: any) {
      console.error(`[Balance] pagar agora falhou linha ${row.id}: ${err?.message}`);
      return { ok: false as const, reason: "error" as const };
    }
  });
}

/** "Usar outro cartão", passo 1: SetupIntent no Customer da plataforma. */
export async function startCardChange(intentId: string, token: string, now = new Date()): Promise<{ ok: true; clientSecret: string } | { ok: false; reason: string }> {
  const r = await rowForLink(intentId, token, now);
  if (!r.ok) return { ok: false, reason: r.expired ? "expired" : "not_found" };
  const row = r.row;
  if (!OPEN_UNPAID.has(row.status) || now.getTime() >= new Date(row.hardStopAt).getTime()) return { ok: false, reason: "not_changeable" };
  try {
    // O hóspede está a trocar de cartão para pagar: o escudo de 60 min vale
    // também aqui (a paragem dura não cancela debaixo do formulário dele).
    const D = await db();
    if (!(await D.markGuestActive(row.id, now))) return { ok: false, reason: "not_changeable" };
    const S = await stripe();
    const si = await S.createCardChangeSetupIntent({ scheduledPaymentId: row.id, intentId: row.intentId, customer: row.stripeCustomerId, now });
    if (!si.client_secret) return { ok: false, reason: "error" };
    return { ok: true, clientSecret: si.client_secret };
  } catch (err: any) {
    console.error(`[Balance] troca de cartao (inicio) falhou linha ${row.id}: ${err?.message}`);
    return { ok: false, reason: "error" };
  }
}

/**
 * "Usar outro cartão", passo 2: o SetupIntent confirmado no browser passa a
 * ser o cartão da linha, com nova autorização registada (spec 6.2: ao trocar
 * de cartão recolhe-se nova autorização) e a anterior marcada como substituída.
 */
/** Quanto tempo o texto da autorização mostrado na página pode ter: o hash
 *  gravado é o desse render, dentro desta janela. */
const CONSENT_RENDER_MAX_AGE_MS = 6 * HOUR;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** O instante em que a página renderizou o texto da autorização, se for um
 *  ISO válido nas últimas 6 h (nunca no futuro); senão `now`. */
function consentRenderInstant(renderedAt: string | null | undefined, now: Date): Date {
  if (typeof renderedAt !== "string" || !ISO_INSTANT.test(renderedAt)) return now;
  const t = Date.parse(renderedAt);
  if (!Number.isFinite(t) || t > now.getTime() || now.getTime() - t > CONSENT_RENDER_MAX_AGE_MS) return now;
  return new Date(t);
}

export async function finishCardChange(
  intentId: string,
  token: string,
  p: { setupIntentId: string; consent: boolean; ip: string | null; consentRenderedAt?: string | null },
  now = new Date(),
): Promise<{ ok: true; cardLast4: string; cardBrand: string } | { ok: false; reason: string }> {
  if (p.consent !== true) return { ok: false, reason: "consent" };
  const r = await rowForLink(intentId, token, now);
  if (!r.ok) return { ok: false, reason: r.expired ? "expired" : "not_found" };
  const row = r.row;
  // Depois de H nada se cobra: aceitar o cartão gravava uma autorização e um
  // E6 com uma data de cobrança que já não existe.
  if (!OPEN_UNPAID.has(row.status) || now.getTime() >= new Date(row.hardStopAt).getTime()) {
    return { ok: false, reason: "not_changeable" };
  }
  try {
    const S = await stripe();
    const si: any = await S.retrieveCardChangeSetupIntent(p.setupIntentId);
    const customer = typeof si.customer === "string" ? si.customer : si.customer?.id;
    if (si.status !== "succeeded" || customer !== row.stripeCustomerId || si.metadata?.scheduledPaymentId !== row.id) {
      return { ok: false, reason: "setup_mismatch" };
    }
    const pm = si.payment_method;
    const pmId = typeof pm === "string" ? pm : pm?.id;
    const card = typeof pm === "object" && pm ? pm.card : null;
    if (!pmId) return { ok: false, reason: "setup_mismatch" };
    const D = await db();
    if (!(await D.updateScheduledPaymentCard(row.id, {
      paymentMethodId: pmId,
      brand: card?.brand ?? null,
      last4: card?.last4 ?? null,
      expMonth: card?.exp_month ?? null,
      expYear: card?.exp_year ?? null,
    }))) {
      return { ok: false, reason: "not_changeable" };
    }
    // O texto depende da hora ("a 28 de junho" ou "hoje"): o hash gravado é
    // o do texto que a página mostrou (renderizado em consentRenderedAt), não
    // o de um render novo com a hora do envio.
    const { renderCardChangeMandate } = await import("./two-parts-mandate");
    const m = renderCardChangeMandate(row.locale, {
      amountLaterCents: row.balanceCents,
      chargeAt: new Date(row.chargeAt),
      freeCancelDeadlineAt: new Date(row.freeCancelDeadline),
      now: consentRenderInstant(p.consentRenderedAt, now),
    });
    const { randomUUID } = await import("crypto");
    await D.insertCardMandate({
      id: randomUUID(),
      intentId: row.intentId,
      paymentIntentId: null,
      setupIntentId: si.id,
      scheduledPaymentId: row.id,
      paymentMethodId: pmId,
      cardLast4: card?.last4 ?? null,
      mandateVersion: m.version,
      mandateLang: m.lang,
      mandateTextHash: m.hash,
      amountLaterCents: row.balanceCents,
      chargeAt: new Date(row.chargeAt),
      acceptedAt: now,
      acceptedIp: p.ip,
      source: "card_change",
    } as any);
    await D.supersedeCardMandates(row.id, pmId, now);
    await S.allowRedisplay(pmId).catch(() => {});
    // Uma linha que já falhou volta à cobrança automática dentro de minutos,
    // no cartão novo: é o que a autorização dele diz ("hoje, neste cartão").
    let chargeOn = new Date(Math.max(new Date(row.chargeAt).getTime(), now.getTime()));
    if (row.status === "retry" || row.status === "needs_action") {
      const soon = new Date(now.getTime() + 5 * MINUTE);
      if (await D.requeueAfterCardChange(row.id, soon)) chargeOn = soon;
    }
    if (row.email) {
      const { sendBalanceCardUpdated } = await mail();
      await sendBalanceCardUpdated({
        email: row.email,
        locale: row.locale,
        guestFirstName: await guestFirstName(row),
        propertyName: row.propertyName ?? "",
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        amountCents: row.balanceCents,
        chargeAt: chargeOn,
        cardBrand: card?.brand ?? null,
        cardLast4: card?.last4 ?? "",
        link: await balanceLink(row).catch(() => undefined),
      }).catch(() => false);
    }
    return { ok: true, cardLast4: card?.last4 ?? "", cardBrand: card?.brand ?? "" };
  } catch (err: any) {
    console.error(`[Balance] troca de cartao falhou linha ${row.id}: ${err?.message}`);
    return { ok: false, reason: "error" };
  }
}

/**
 * Cancelamento pelo hóspede dentro do cancelamento gratuito: cancela no
 * Guesty e devolve na hora (1.ª parte, menos o Flex depois de 14 dias, e a
 * 2.ª se já tiver sido cobrada). Depois do prazo não cancela nada: a página
 * mostra a política e manda uma mensagem ao CS (guestHelp).
 */
export async function guestCancel(intentId: string, token: string, now = new Date()): Promise<
  { ok: true; refundCents: number } | { ok: false; reason: "late" | "not_cancellable" | "expired" | "error" }
> {
  const r = await rowForLink(intentId, token, now);
  if (!r.ok) return { ok: false, reason: r.expired ? "expired" : "not_cancellable" };
  const row = r.row;
  if (!freeCancelOpen(row, now)) return { ok: false, reason: "late" };
  if (!(OPEN_UNPAID.has(row.status) || row.status === "succeeded")) return { ok: false, reason: "not_cancellable" };
  const D = await db();
  if (!(await D.claimScheduledPaymentForCancel(row.id, ["scheduled", "retry", "needs_action", "succeeded"], { reason: "cancel:guest" }))) {
    return { ok: false, reason: "not_cancellable" };
  }
  const fresh = (await D.getScheduledPaymentById(row.id)) ?? row;
  try {
    const result = await runCancellation(fresh, "guest", now);
    const after = await D.getScheduledPaymentById(row.id);
    if (result === "paid") return { ok: false, reason: "not_cancellable" };
    // "pending": o pedido ficou registado (linha em `cancelling`) e o sweep
    // acaba o que falta; o hóspede recebe o email quando o reembolso sair.
    return { ok: true, refundCents: Number(after?.refundCents ?? 0) };
  } catch (err: any) {
    console.error(`[Balance] cancelamento do hospede falhou linha ${row.id}: ${err?.message}`);
    return { ok: false, reason: "error" };
  }
}

/** "Preciso de ajuda" (e mensagens depois do prazo): pausa a automação e chama um humano. */
export async function guestHelp(intentId: string, token: string, p: { message: string }, now = new Date()): Promise<
  { ok: true; pausedUntil: string | null } | { ok: false; reason: string }
> {
  const r = await rowForLink(intentId, token, now);
  if (!r.ok) return { ok: false, reason: r.expired ? "expired" : "not_found" };
  const row = r.row;
  const message = String(p.message ?? "").replace(/\s+/g, " ").trim().slice(0, 1000);
  const D = await db();
  let pausedUntil: Date | null = null;
  if (OPEN_UNPAID.has(row.status)) {
    // A pausa nunca passa do fim do cancelamento gratuito: até lá um humano decide.
    const until = new Date(Math.min(now.getTime() + HELP_PAUSE_DAYS * DAY, new Date(row.freeCancelDeadline).getTime()));
    if (await D.pauseForHelp(row.id, until, `hospede pediu ajuda`)) pausedUntil = until;
  }
  // No máximo um alerta por linha a cada 15 min (booking@ e a gestão em
  // cópia): quem tem o link não pode inundar a caixa onde chegam os alertas
  // de dinheiro. A pausa acima aplica-se sempre.
  const alerted = await throttledAlert(row.id, "guest-help", `DUAS PARTES: o hóspede pede ajuda — ${rowLabel(row)}`, [
    `Mensagem: ${message || "(sem mensagem)"}`,
    pausedUntil
      ? `Cobranças automáticas pausadas até ${pausedUntil.toISOString()}. Responder e decidir no ecrã Saldos antes dessa data.`
      : `Linha em "${row.status}": nada foi pausado. Responder ao hóspede.`,
    `Hóspede: ${row.email ?? "?"} · ${row.phone ?? "?"}.`,
  ], HELP_ALERT_WINDOW_MS);
  // Sem o texto da mensagem (dados do hóspede fora dos logs).
  if (!alerted) console.info(`[Balance] pedido de ajuda repetido linha ${row.id}: alerta já enviado nos últimos 15 min`);
  return { ok: true, pausedUntil: pausedUntil ? pausedUntil.toISOString() : null };
}

const HELP_ALERT_WINDOW_MS = 15 * MINUTE;
const RESEND_WINDOW_MS = 10 * MINUTE;
/** Último envio aceite por reserva (só linhas que existem e com email). */
const resendAt = new Map<string, number>();
/** Envios em curso: um segundo pedido ao mesmo tempo não manda outro email. */
const resendInFlight = new Set<string>();

/**
 * "Enviar novo link": sempre para o email da reserva; no máximo 1 a cada
 * 10 min por reserva. O travão só se arma depois de um envio aceite, para uma
 * linha que existe e tem email (um intentId inventado nunca ocupa memória), e
 * as entradas com mais de 10 min saem. `force` (só o admin) ignora o travão.
 */
export async function resendBalanceLink(intentId: string, now = new Date(), opts: { force?: boolean } = {}): Promise<{ ok: true; sent?: boolean }> {
  for (const [k, at] of resendAt) if (now.getTime() - at >= RESEND_WINDOW_MS) resendAt.delete(k);
  if (!opts.force) {
    const last = resendAt.get(intentId);
    if (last != null && now.getTime() - last < RESEND_WINDOW_MS) return { ok: true, sent: false };
  }
  if (resendInFlight.has(intentId)) return { ok: true, sent: false };
  resendInFlight.add(intentId);
  try {
    const D = await db();
    const row = await D.getScheduledPaymentByIntent(intentId);
    if (!row || !row.email) return { ok: true };
    const scope = balanceScope();
    if (!!row.livemode !== scope.livemode || row.siteOrigin !== scope.siteOrigin) return { ok: true };
    const link = await balanceLink(row);
    const { sendBalanceLinkEmail } = await mail();
    const sent = await sendBalanceLinkEmail({ email: row.email, locale: row.locale, guestFirstName: await guestFirstName(row), propertyName: row.propertyName, link });
    if (sent) resendAt.set(intentId, now.getTime());
    return { ok: true, sent: !!sent };
  } catch (err: any) {
    console.error(`[Balance] reenvio do link falhou intent ${intentId}: ${err?.message}`);
  } finally {
    resendInFlight.delete(intentId);
  }
  return { ok: true };
}
