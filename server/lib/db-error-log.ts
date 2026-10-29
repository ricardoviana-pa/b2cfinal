/**
 * Erro da base de dados para os logs, sem dados pessoais (revisão do PR #176).
 *
 * O DrizzleQueryError traz na mensagem os parâmetros da query ("Failed query:
 * …\nparams: ana@example.com,newsletter-checkout,1") e guarda-os em `params`;
 * um console.error do objeto inteiro levava o email do hóspede para os logs
 * do Render. Fica só o código do erro do MySQL e a primeira linha da
 * mensagem (a query com "?"), com qualquer email que lá apareça trocado por
 * "[email]" (há erros do MySQL que citam o valor, como "Duplicate entry").
 */
const EMAIL = /[^\s@'"`,;:()<>]+@[^\s@'"`,;:()<>]+/g;

export function dbErrorSummary(error: unknown): string {
  const err = (error ?? {}) as { message?: unknown; code?: unknown; cause?: unknown };
  const cause = (err.cause ?? {}) as { code?: unknown };
  const code = [cause.code, err.code].find((c): c is string => typeof c === "string" && c.length > 0);
  const raw = typeof error === "string" ? error : String(err.message ?? "unknown error");
  const firstLine = raw.split("\n")[0].replace(EMAIL, "[email]").slice(0, 200);
  return code ? `${code}: ${firstLine}` : firstLine;
}
