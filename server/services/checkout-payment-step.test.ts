import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  conciergeWhatsAppHref,
  guestDetailsIssues,
  payButtonGate,
  walletNames,
  walletsUnlocked,
} from "@/lib/checkoutPayment";
import { checkTaxId, isValidPortugueseNif, normalizeTaxId } from "@/lib/taxId";

/**
 * Passo do pagamento do checkout (auditoria do funil, out/2026, n.º 1, 9 e 11).
 * As regras vivem em módulos puros do cliente e testam-se aqui sem React.
 */

const read = (p: string) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const OK = { firstName: "Ana", lastName: "Silva", email: "ana@example.com", phone: "+351 912 345 678" };

describe("dados do hóspede: validados no clique em Pagar", () => {
  it("tudo certo: nada a assinalar", () => {
    expect(guestDetailsIssues(OK)).toEqual([]);
  });

  it("assinala pela ordem do ecrã (o primeiro recebe o foco)", () => {
    expect(guestDetailsIssues({ firstName: "", lastName: "", email: "", phone: "" })).toEqual(["firstName", "lastName", "email", "phone"]);
    expect(guestDetailsIssues({ ...OK, email: "ana@", phone: "+351" })).toEqual(["email", "phone"]);
    expect(guestDetailsIssues({ ...OK, lastName: "   " })).toEqual(["lastName"]);
  });
});

describe("botão final: só ativo com as caixas marcadas (spec 4.1, pontos 4 e 5)", () => {
  it("sem os Termos fica inativo, com a dica junto à caixa", () => {
    expect(payButtonGate({ termsAccepted: false })).toEqual({ enabled: false, needsTerms: true, needsMandate: false });
    expect(payButtonGate({ termsAccepted: false, plan: "full" }).enabled).toBe(false);
  });

  it("com os Termos e a pagar tudo: ativo", () => {
    expect(payButtonGate({ termsAccepted: true })).toEqual({ enabled: true, needsTerms: false, needsMandate: false });
    expect(payButtonGate({ termsAccepted: true, plan: "full", mandateAccepted: false }).enabled).toBe(true);
  });

  it("em duas partes precisa também da autorização da 2.ª parte", () => {
    expect(payButtonGate({ termsAccepted: true, plan: "two_parts", mandateAccepted: false })).toEqual({ enabled: false, needsTerms: false, needsMandate: true });
    expect(payButtonGate({ termsAccepted: true, plan: "two_parts" }).enabled).toBe(false);
    expect(payButtonGate({ termsAccepted: false, plan: "two_parts", mandateAccepted: false })).toEqual({ enabled: false, needsTerms: true, needsMandate: true });
    expect(payButtonGate({ termsAccepted: true, plan: "two_parts", mandateAccepted: true }).enabled).toBe(true);
  });
});

describe("Apple Pay / Google Pay: escondidos até os dados e os Termos estarem certos", () => {
  it("só com os dados certos e os Termos aceites", () => {
    expect(walletsUnlocked({ guestIssues: [], termsAccepted: true })).toBe(true);
    expect(walletsUnlocked({ guestIssues: [], termsAccepted: false })).toBe(false);
    expect(walletsUnlocked({ guestIssues: ["phone"], termsAccepted: true })).toBe(false);
  });

  it("a dica nomeia as wallets que o aparelho tem", () => {
    expect(walletNames({ applePay: true, googlePay: false })).toBe("Apple Pay");
    expect(walletNames({ applePay: false, googlePay: true })).toBe("Google Pay");
    expect(walletNames({ applePay: true, googlePay: true })).toBe("Apple Pay / Google Pay");
    expect(walletNames(null)).toBe("");
    expect(walletNames(undefined)).toBe("");
  });
});

describe("concierge por WhatsApp", () => {
  it("abre o número do concierge com a mensagem escrita", () => {
    const href = conciergeWhatsAppHref("Olá, preciso de ajuda: Casa & Mar, 10 jun → 15 jun");
    expect(href.startsWith("https://wa.me/351927161771?text=")).toBe(true);
    expect(decodeURIComponent(href.split("?text=")[1])).toBe("Olá, preciso de ajuda: Casa & Mar, 10 jun → 15 jun");
  });
});

describe("NIF ou nº de IVA (opcional, para a fatura)", () => {
  it("limpa espaços, pontos e hífenes e passa a maiúsculas", () => {
    expect(normalizeTaxId(" pt 123.456-789 ")).toBe("PT123456789");
    expect(normalizeTaxId("esb/12345678")).toBe("ESB12345678");
    expect(normalizeTaxId(undefined)).toBe("");
  });

  it("dígito de controlo do NIF português (módulo 11)", () => {
    for (const nif of ["123456789", "999999990", "500000000", "501964843"]) expect(isValidPortugueseNif(nif), nif).toBe(true);
    for (const nif of ["123456788", "999999999", "500000001", "12345678", "1234567890", "12345678A"]) expect(isValidPortugueseNif(nif), nif).toBe(false);
  });

  it("só 9 dígitos (ou PT + 9 dígitos) se verificam; o resto aceita-se sem bloquear", () => {
    expect(checkTaxId("")).toBe("empty");
    expect(checkTaxId("   ")).toBe("empty");
    expect(checkTaxId("123456789")).toBe("pt_valid");
    expect(checkTaxId("PT 123 456 789")).toBe("pt_valid");
    expect(checkTaxId("123 456 788")).toBe("pt_invalid");
    expect(checkTaxId("pt123456788")).toBe("pt_invalid");
    // nº de IVA de outros países: com letras, aceites tal como vêm
    for (const vat of ["DE123456789", "ESB12345678", "NL123456789B01", "FR12345678901", "ATU12345678", "IE1234567FA"]) {
      expect(checkTaxId(vat), vat).toBe("foreign_vat");
    }
    // outros formatos (fora da UE, incompletos): aceites, sem aviso
    for (const other of ["12345", "1234567890", "PT12345678", "CHE-123.456.789 MWST", "12-3456789X"]) {
      expect(["other", "foreign_vat"], other).toContain(checkTaxId(other));
      expect(checkTaxId(other), other).not.toBe("pt_invalid");
    }
  });
});

describe("passo do pagamento: guardas no código (regras do André e da auditoria)", () => {
  const page = read("client/src/pages/checkout/CheckoutPage.tsx");
  const form = read("client/src/components/booking/CheckoutPaymentForm.tsx");
  const selector = read("client/src/pages/checkout/PaymentPlanSelector.tsx");

  it("os Termos e a autorização nunca vêm pré-marcados", () => {
    expect(page).toMatch(/\[termsAccepted, setTermsAccepted\] = useState\(false\)/);
    expect(page).toMatch(/\[mandateAccepted, setMandateAccepted\] = useState\(false\)/);
    expect(page).not.toMatch(/setTermsAccepted\(true\)/);
    expect(page).not.toMatch(/setMandateAccepted\(true\)/);
  });

  it("o bloco de pagamento monta com preço válido, não atrás dos dados do hóspede", () => {
    expect(page).toMatch(/quoteId && effective && !quoteStale \? \(\s*<CheckoutPaymentForm/);
    expect(page).not.toMatch(/checkout\.missing\.prefix/);
    expect(page).toMatch(/termsAccepted=\{termsAccepted\}/);
    expect(page).toMatch(/validateGuest=\{validateGuestForPay\}/);
  });

  it("cada botão final (cartão, PayPal, Klarna) só fica ativo com as caixas", () => {
    expect(form).toMatch(/disabled=\{!stripe \|\| loading \|\| !gate\.enabled\}/);
    expect(form).toMatch(/disabled: !gate\.enabled/);
    expect(form).toMatch(/if \(!gate\.enabled\) return;/);
  });

  it("PayPal e Klarna mostram o valor exato (ao cêntimo), não arredondado ao euro", () => {
    expect(read("client/src/components/booking/PayPalCheckoutButton.tsx")).toMatch(/payWithPaypal", \{ amount: formatQuotedEur\(/);
    expect(read("client/src/components/booking/KlarnaCheckoutButton.tsx")).toMatch(/payWithKlarna", \{ amount: formatQuotedEur\(/);
  });

  it("o cartão tem uma só instância do Elements (o que foi escrito não se apaga)", () => {
    expect(form).not.toMatch(/key=\{props\.plan === "two_parts"/);
    expect(form).not.toMatch(/<Elements key=/);
  });

  it("no checkout 2.0 não há 'Cancelar' debaixo de Pagar", () => {
    expect(page).not.toMatch(/onCancel=/);
  });

  it("a autorização fica junto ao botão, não no seletor do plano", () => {
    expect(selector).toMatch(/export function MandateConsent/);
    expect(selector).not.toMatch(/onMandateChange/);
    expect(page).toMatch(/<MandateConsent offer=\{offer\} accepted=\{mandateAccepted\}/);
  });

  it("o campo do NIF abre o teclado de texto", () => {
    expect(page).toMatch(/id="checkout-nif"[\s\S]{0,80}inputMode="text"/);
    expect(page).not.toMatch(/inputMode="numeric"/);
  });
});
