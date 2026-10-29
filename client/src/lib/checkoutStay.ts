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

/** A caixa de marketing do passo 1. */
export interface MarketingConsentState {
  /** O que o hóspede marcou nesta sessão, ou o valor reposto do servidor. */
  checked: boolean;
  /** O hóspede mexeu na caixa nesta sessão. */
  touched: boolean;
  /** O email para o qual o servidor repôs a caixa (getIntent.newsletterOptIn), ou null. */
  restoredFor: string | null;
  /** O email que está no campo agora. */
  email: string;
}

/** O mesmo endereço, sem diferenças de espaços nem de maiúsculas (como a BD compara). */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** O valor reposto só vale para o email a que pertence. */
function restoredApplies(p: MarketingConsentState): boolean {
  return p.restoredFor != null && sameEmail(p.email, p.restoredFor);
}

/**
 * A caixa como se mostra. Reposta do servidor, só para o email para o qual
 * foi lida: com outro email no campo aparece desmarcada (uma caixa marcada
 * pelo consentimento de outra pessoa seria uma caixa pré-marcada; RGPD,
 * art. 7.º e considerando 32 — revisão do PR #176).
 */
export function consentChecked(p: MarketingConsentState): boolean {
  if (p.touched) return p.checked;
  return restoredApplies(p) ? p.checked : false;
}

/**
 * O consentimento de marketing a enviar no captureLead.
 *
 * Bug corrigido: a caixa começava sempre desmarcada e nunca era reposta, por
 * isso quem voltava ao passo 1 (outro dispositivo, refresh, link do lembrete)
 * e carregava outra vez em Continuar mandava consent:false e o servidor
 * retirava-o da lista sem o hóspede ter mexido em nada.
 *
 * Só se envia o estado da caixa quando ele é conhecido: o hóspede mexeu na
 * caixa, ou ela veio reposta do servidor PARA ESTE EMAIL. Sem isso vai
 * `undefined` e o servidor deixa o consentimento como estava; um email novo
 * fica então um lead "checkout", nunca marketing. Antes, um consentimento
 * reposto passava para um email trocado no passo 1 (um link de recuperação
 * reencaminhado, um aparelho partilhado) e o servidor punha esse email novo
 * no segmento de marketing sem ninguém ter marcado a caixa por ele.
 */
export function consentToSend(p: MarketingConsentState): boolean | undefined {
  if (p.touched) return p.checked;
  return restoredApplies(p) ? p.checked : undefined;
}
