/**
 * NIF ou nº de IVA do passo do pagamento (auditoria do funil, out/2026, n.º 9).
 *
 * O campo é opcional e serve a fatura. Só um NIF português (9 dígitos, com ou
 * sem "PT") tem dígito de controlo para verificar; um nº de IVA de outro país
 * (DE…, ESB…, NL…B01) ou outro identificador fiscal aceita-se tal como vem.
 * Nada aqui bloqueia o pagamento: o ecrã mostra um aviso suave e mais nada.
 */

/** Maiúsculas, sem espaços, pontos, hífenes nem barras ("pt 123.456.789" → "PT123456789"). */
export function normalizeTaxId(raw: string | null | undefined): string {
  return String(raw ?? "").toUpperCase().replace(/[\s.\-/]/g, "");
}

/** NIF português: 9 dígitos, o último é o dígito de controlo (módulo 11). */
export function isValidPortugueseNif(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(digits[i]) * (9 - i);
  const rest = sum % 11;
  const check = rest < 2 ? 0 : 11 - rest;
  return check === Number(digits[8]);
}

/**
 * - "empty": nada escrito;
 * - "pt_valid" / "pt_invalid": 9 dígitos (ou PT + 9 dígitos), com o dígito de controlo certo ou errado;
 * - "foreign_vat": prefixo de 2 letras + 2 a 13 letras ou dígitos (nº de IVA de outro país);
 * - "other": outro formato (identificador fiscal fora da UE, por exemplo). Aceita-se.
 */
export type TaxIdCheck = "empty" | "pt_valid" | "pt_invalid" | "foreign_vat" | "other";

export function checkTaxId(raw: string | null | undefined): TaxIdCheck {
  const v = normalizeTaxId(raw);
  if (!v) return "empty";
  const pt = /^(?:PT)?(\d{9})$/.exec(v);
  if (pt) return isValidPortugueseNif(pt[1]) ? "pt_valid" : "pt_invalid";
  if (/^(?!PT)[A-Z]{2}[A-Z0-9]{2,13}$/.test(v)) return "foreign_vat";
  return "other";
}
