/**
 * Regras do passo do pagamento do checkout, fora dos componentes para se
 * poderem testar sem React (auditoria do funil, out/2026, n.º 1).
 *
 * - O bloco de pagamento aparece logo; nome, email e telefone validam-se no
 *   clique em Pagar (erro no campo, nada é cobrado).
 * - O botão final só fica ativo com os Termos e, em duas partes, com a
 *   autorização da 2.ª parte (spec 4.1, pontos 4 e 5, validada pelo André).
 * - Apple Pay / Google Pay ficam à cabeça do bloco de pagamento, visíveis
 *   logo que a Stripe os reporta (decisão do Ricardo, 29 out 2026). A folha
 *   da wallet pede email e telefone (e traz o nome do pagador): o que a
 *   página já tem de válido mantém-se, o resto vem da folha
 *   (walletGuestDetails). Só saem enquanto o plano "duas partes" estiver
 *   escolhido: as wallets pagam tudo hoje.
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

/** Apple Pay / Google Pay à cabeça: só saem enquanto "duas partes" estiver escolhido
 *  (a folha da wallet e o PaymentIntent têm de ter o mesmo valor, e as wallets pagam tudo hoje). */
export function walletsVisible(p: { plan?: "full" | "two_parts" | null }): boolean {
  return p.plan !== "two_parts";
}

/** Os dados do hóspede que a reserva precisa, já divididos como o intent os guarda. */
export interface WalletGuest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/** O que a folha da wallet devolve no confirm (Stripe billingDetails; campos vazios quando não pedidos). */
export interface WalletBillingDetails {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** "Ana Maria Silva" → Ana / Maria Silva; um só nome repete-se no apelido (o Guesty exige os dois). */
export function splitFullName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ") || firstName;
  return { firstName, lastName };
}

/**
 * Nome, email e telefone para a reserva paga com Apple Pay / Google Pay: o
 * que a página já tem de válido mantém-se (o hóspede escreveu-o), o que falta
 * vem da folha da wallet. Devolve `missing` quando nem assim há tudo: aí a
 * folha fecha com falha e os campos da página ficam assinalados.
 */
export function walletGuestDetails(p: {
  page: { firstName: string; lastName: string; email: string; phone: string };
  sheet?: WalletBillingDetails | null;
}): { guest: WalletGuest; missing: GuestField[] } {
  const sheetName = splitFullName(String(p.sheet?.name ?? ""));
  const pageNamesOk = p.page.firstName.trim().length > 0 && p.page.lastName.trim().length > 0;
  const firstName = pageNamesOk ? p.page.firstName.trim() : sheetName.firstName;
  const lastName = pageNamesOk ? p.page.lastName.trim() : sheetName.lastName;
  const sheetEmail = String(p.sheet?.email ?? "").trim();
  const email = isValidEmail(p.page.email) ? p.page.email.trim() : sheetEmail;
  // O telefone da folha já foi verificado pela wallet (Apple Pay e Google Pay
  // devolvem-no com indicativo, mas não sempre no formato do nosso campo):
  // aceita-se tal como vem; só a página passa pela nossa validação.
  const sheetPhone = String(p.sheet?.phone ?? "").trim();
  const pagePhoneOk = isValidPhone(p.page.phone);
  const phone = pagePhoneOk ? p.page.phone : sheetPhone;
  const guest = { firstName, lastName, email, phone };
  const missing: GuestField[] = guestDetailsIssues(guest).filter((f) => f !== "phone");
  if (!pagePhoneOk && !sheetPhone) missing.push("phone");
  return { guest, missing };
}

/** Link do concierge por WhatsApp com a mensagem já escrita (casa e datas;
 *  nunca dados do cartão). */
export function conciergeWhatsAppHref(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
