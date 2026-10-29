/**
 * Enter num campo de texto nosso envia, como num <form> (a submissão
 * implícita do HTML), num bloco que já não é <form>.
 *
 * O funil de reserva não usa <form> (o GA4 conta form_start/form_submit e o
 * GTM-TRPCDT3 transforma-os em 'Start Activity Form' e 'Lead_Site'), mas quem
 * escreve o nome ou o email e carrega em Enter continua a enviar.
 *
 * Não envia: Enter numa área de texto (muda de linha), num botão (o botão
 * trata o seu próprio Enter), numa caixa, numa lista, a meio de uma
 * composição (teclados com IME) ou quando outro handler já tratou a tecla.
 */
const TEXT_INPUT_TYPES = new Set(["", "text", "email", "tel", "search", "url", "number", "password"]);

export interface ImplicitSubmitKey {
  key: string;
  /** KeyboardEvent.isComposing (no React: e.nativeEvent.isComposing). */
  isComposing?: boolean;
  /** Outro handler já chamou preventDefault (no React: e.isDefaultPrevented()). */
  defaultPrevented?: boolean;
  target: unknown;
}

export function isImplicitSubmitKey(e: ImplicitSubmitKey): boolean {
  if (e.key !== "Enter" || e.isComposing || e.defaultPrevented) return false;
  const el = e.target as { tagName?: unknown; type?: unknown } | null;
  if (!el || String(el.tagName ?? "").toUpperCase() !== "INPUT") return false;
  return TEXT_INPUT_TYPES.has(String(el.type ?? "").toLowerCase());
}
