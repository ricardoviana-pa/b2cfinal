/**
 * Regras do passo do pagamento do checkout, fora dos componentes para se
 * poderem testar sem React (auditoria do funil, out/2026, n.º 1).
 *
 * - O bloco de pagamento aparece logo; nome, email e telefone validam-se no
 *   clique em Pagar (erro no campo, nada é cobrado).
 * - O botão final só fica ativo com os Termos e, em duas partes, com a
 *   autorização da 2.ª parte (spec 4.1, pontos 4 e 5, validada pelo André).
 * - Apple Pay / Google Pay abrem a folha no toque e não deixam validar
 *   depois: ficam escondidos até os dados e os Termos estarem certos.
 */
import { isValidEmail, isValidPhone } from "./validation";
import { WHATSAPP_NUMBER } from "./constants";

export type GuestField = "firstName" | "lastName" | "email" | "phone";

/** Pela ordem do ecrã: o primeiro da lista é o que recebe o foco. */
export function guestDetailsIssues(d: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): GuestField[] {
  const issues: GuestField[] = [];
  if (!d.firstName.trim()) issues.push("firstName");
  if (!d.lastName.trim()) issues.push("lastName");
  if (!isValidEmail(d.email)) issues.push("email");
  if (!isValidPhone(d.phone)) issues.push("phone");
  return issues;
}

/** O botão final (cartão, PayPal, Klarna): ativo só com as caixas marcadas. */
export function payButtonGate(p: {
  termsAccepted: boolean;
  plan?: "full" | "two_parts";
  mandateAccepted?: boolean;
}): { enabled: boolean; needsTerms: boolean; needsMandate: boolean } {
  const needsTerms = !p.termsAccepted;
  const needsMandate = p.plan === "two_parts" && p.mandateAccepted !== true;
  return { enabled: !needsTerms && !needsMandate, needsTerms, needsMandate };
}

/** As wallets só aparecem com os dados do hóspede certos e os Termos aceites. */
export function walletsUnlocked(p: { guestIssues: GuestField[]; termsAccepted: boolean }): boolean {
  return p.guestIssues.length === 0 && p.termsAccepted;
}

/** "Apple Pay", "Google Pay" ou os dois, pelo que o aparelho tem. */
export function walletNames(available: { applePay?: boolean; googlePay?: boolean } | null | undefined): string {
  const names: string[] = [];
  if (available?.applePay) names.push("Apple Pay");
  if (available?.googlePay) names.push("Google Pay");
  return names.join(" / ");
}

/** Link do concierge por WhatsApp com a mensagem já escrita (casa e datas;
 *  nunca dados do cartão). */
export function conciergeWhatsAppHref(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
