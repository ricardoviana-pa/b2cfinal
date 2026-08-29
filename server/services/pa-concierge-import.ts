/**
 * Envia as vendas do checkout para o PA Concierge (CRM do concierge).
 *
 * PORQUE EXISTE: os extras NÃO vivem no Guesty (regra 1 da spec do CRM — só a
 * estadia lá vive, para proteger o split com os owners). A única verdade dos
 * extras é `pa_core.reservation_addons`, e até hoje ninguém lha entregava: o
 * concierge não sabia o que o hóspede já tinha comprado no site, e ligava a
 * oferecer coisas que ele já pagou.
 *
 * O contrato do lado do CRM aceita EXATAMENTE a forma que este checkout já
 * usa — incluindo a receção como escolha (`{ type, late }`) e não como sku, e
 * o `fulfillment: "needs_confirmation"` como confirmação de 24h. Não foi
 * preciso mudar nada na modelação do site.
 *
 * Fire-and-forget, como o resto de `fireCheckoutPaidEmails`: uma falha aqui
 * NUNCA pode travar o funil de pagamento nem o email ao hóspede. Se falhar,
 * fica o log e o CRM reconcilia por upload manual.
 */

const ENDPOINT =
  process.env.PA_CONCIERGE_IMPORT_URL ??
  "https://pa-concierge.vercel.app/api/import/checkout-order";

/** Um extra tal como o checkout o guarda no intent. */
interface ExtraSelecionado {
  sku: string;
  qty?: number | null;
  days?: number | null;
  people?: number | null;
  amount?: number | null;
  fulfillment?: string | null;
}

interface IntentMeta {
  confirmationCode?: string | null;
  reservationId?: string | null;
  reception?: { type: "self" | "hosted"; late?: boolean | null } | null;
  extras?: ExtraSelecionado[] | null;
  flex?: boolean | null;
}

/**
 * A quantidade que faz sentido mostrar ao concierge, por modelo de preço.
 * O `amount` do site continua a ser a verdade do valor — isto é só para o
 * agente ler "2 pessoas" ou "3 dias" no card em vez de um 1 solitário.
 */
function quantidade(e: ExtraSelecionado): number {
  return e.qty ?? e.people ?? e.days ?? 1;
}

export async function enviarParaConcierge(
  m: IntentMeta,
  intentId: string,
  opcoes: { flexAmount?: number | null; receptionAmount?: number | null } = {},
): Promise<void> {
  const secret = process.env.PA_CONCIERGE_IMPORT_SECRET;
  if (!secret) {
    console.warn(
      "[PAConcierge] PA_CONCIERGE_IMPORT_SECRET não definido — venda não enviada ao CRM.",
    );
    return;
  }
  // Sem código GY não há reserva a que ligar a venda. O CRM guardaria a
  // encomenda numa fila de órfãs, mas é melhor não lha mandar às cegas.
  if (!m.confirmationCode) {
    console.warn(
      `[PAConcierge] intent ${intentId} sem confirmationCode — venda não enviada.`,
    );
    return;
  }

  const extras = Array.isArray(m.extras) ? m.extras : [];
  const lines = extras.map((e) => ({
    sku: e.sku,
    quantity: quantidade(e),
    unit_price: e.amount != null ? e.amount / Math.max(1, quantidade(e)) : 0,
    amount: e.amount ?? 0,
    currency: "EUR",
    // Idempotência do lado do CRM: reenviar a mesma encomenda não duplica.
    external_ref: `${intentId}:${e.sku}`,
    // "needs_confirmation" no site = confirmação de 24h no CRM, que entra na
    // fila própria com deadline de venda+24h.
    ...(e.fulfillment === "needs_confirmation"
      ? { confirmation_status: "pending" as const }
      : {}),
  }));

  // O Flex não é um serviço (regra 7 da spec do CRM): entra como linha
  // especial com o sku `flex` e aparece como badge no card, nunca como oferta.
  if (m.flex && opcoes.flexAmount) {
    lines.push({
      sku: "flex",
      quantity: 1,
      unit_price: opcoes.flexAmount,
      amount: opcoes.flexAmount,
      currency: "EUR",
      external_ref: `${intentId}:flex`,
    });
  }

  const payload = {
    gy_code: m.confirmationCode,
    order_id: intentId,
    sold_at: new Date().toISOString(),
    lines,
    // A receção vai na forma do site; o CRM traduz para os skus dele.
    reception: m.reception
      ? {
          type: m.reception.type,
          late: m.reception.late ?? false,
          ...(opcoes.receptionAmount != null
            ? { amount: opcoes.receptionAmount }
            : {}),
        }
      : null,
  };

  // Nada a enviar: self check-in, sem extras e sem flex.
  if (lines.length === 0 && payload.reception?.type !== "hosted") return;

  try {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 8000);
    const resposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: controlador.signal,
    });
    clearTimeout(timeout);

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      console.error(
        `[PAConcierge] intent ${intentId}: CRM devolveu ${resposta.status} ${corpo.slice(0, 200)}`,
      );
      return;
    }
    console.info(
      `[PAConcierge] intent ${intentId} → CRM ok (${lines.length} linha(s), GY ${m.confirmationCode})`,
    );
  } catch (err: any) {
    console.error(
      `[PAConcierge] intent ${intentId}: falha a contactar o CRM — ${err?.message}`,
    );
  }
}
