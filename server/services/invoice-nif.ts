/**
 * NIF ou número de IVA que o hóspede escreve no passo 3 do checkout, para a
 * equipa emitir a fatura com ele. Pedido o NIF, ele tem de constar na fatura
 * (CIVA art. 36.º n.º 16); corrigir depois obriga a anular e emitir outra.
 *
 * O campo é texto livre (até 20 caracteres, sem validação). Aqui só se limpa
 * para a nota da reserva no Guesty e para os emails internos: nunca se recusa
 * nem se corrige o que o hóspede escreveu, e nada disto trava um pagamento.
 *
 * O campo do Guesty que a Hostkit lê está por confirmar (spec 5.13). Até lá o
 * NIF chega à equipa pelo topo da nota da reserva e pela 1.ª ação do email
 * [CS]/[Venda direta], escritos em fireCheckoutPaidEmails, o ponto por onde
 * passam todos os métodos (cartão, Apple/Google Pay, PayPal e Klarna).
 */

/** Tamanho da coluna booking_intents.nif. */
const NIF_MAX = 20;

/**
 * O NIF limpo, ou "" quando não há pedido de fatura com NIF.
 *
 * Fica só com letras, algarismos, espaços, pontos, barras e hífenes (os IVA
 * da UE têm letras: DE…, ESB…, NL…B01), em maiúsculas e sem quebras de linha,
 * para não poder partir a nota nem o email. Sem nenhum algarismo fica vazio:
 * todos os NIF, números de IVA e códigos fiscais têm algarismos, e um "-",
 * "n/a" ou "não" no campo não é um pedido de fatura.
 */
export function invoiceNif(raw: unknown): string {
  if (raw == null) return "";
  const clean = String(raw)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ./-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, NIF_MAX)
    .trim();
  return /\p{N}/u.test(clean) ? clean : "";
}

/** Linha do topo da nota da reserva no Guesty; vazia sem NIF. */
export function invoiceNifNoteLine(raw: unknown): string {
  const nif = invoiceNif(raw);
  return nif ? `FATURA COM NIF ${nif} (pedido pelo hospede no checkout do site)` : "";
}
