/**
 * Regras do passo 1 do checkout ("A sua estadia"), fora do componente para se
 * testarem sem React (auditoria do funil, 29 out 2026, n.º 2).
 */

export type StayContinueAction =
  /** Grava o email (captureLead) e segue para o passo 2. */
  | "submit"
  /** Sem email válido: leva ao campo, foca-o e mostra a dica. */
  | "focus_email"
  /** O preço expirou: leva ao aviso com "Atualizar preço". */
  | "refresh_price"
  /** As datas deixaram de estar livres: leva ao aviso com "Mudar datas". */
  | "dates_unavailable"
  /** A gravação anterior ainda não respondeu. */
  | "busy";

/**
 * O "Continuar" do passo 1 nunca fica parado: no telemóvel é o único botão do
 * passo (barra fixa) e, desativado, um toque não fazia nada (80 dos 135
 * checkouts saíram sem email). Diz sempre o que fazer a seguir.
 */
export function stayContinueAction(s: {
  emailValid: boolean;
  quoteStale: boolean;
  datesUnavailable: boolean;
  saving: boolean;
}): StayContinueAction {
  if (s.saving) return "busy";
  if (s.datesUnavailable) return "dates_unavailable";
  if (s.quoteStale) return "refresh_price";
  if (!s.emailValid) return "focus_email";
  return "submit";
}

/**
 * O consentimento de marketing a enviar no captureLead.
 *
 * Bug corrigido: a caixa começava sempre desmarcada e nunca era reposta, por
 * isso quem voltava ao passo 1 (outro dispositivo, refresh, link do lembrete)
 * e carregava outra vez em Continuar mandava consent:false e o servidor
 * retirava-o da lista sem o hóspede ter mexido em nada.
 *
 * Agora só se envia o estado da caixa quando ele é conhecido: o hóspede mexeu
 * na caixa, ou ela veio reposta do servidor (getIntent.newsletterOptIn). Sem
 * isso vai `undefined` e o servidor deixa o consentimento como estava.
 */
export function consentToSend(p: { checked: boolean; touched: boolean; restored: boolean }): boolean | undefined {
  return p.touched || p.restored ? p.checked : undefined;
}
