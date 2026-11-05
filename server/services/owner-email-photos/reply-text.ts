/** Defense in depth for a signed worker payload. Return plain text, never executable HTML or capabilities. */
export function sanitizeReplyText(input: string) {
  let text = input.slice(0, 16000).replace(/=\r?\n/g, "");
  for (let pass = 0; pass < 3; pass++) {
    text = text.replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, " ")
      .replace(/&#(x[0-9a-f]{1,6}|\d{1,7});/gi, (all, n) => { const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n); return code <= 0x10ffff ? String.fromCodePoint(code) : all; });
  }
  text = text.split(/<blockquote\b|<(?:div|section)\b[^>]*(?:gmail_quote|gmail_attr|yahoo_quoted|divRplyFwdMsg)/i)[0];
  text = text.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<a\b[^>]*href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<(?:br|\/p|\/div|\/li)\b[^>]*>/gi, "\n").replace(/<[^>]*>/g, "");
  text = text.split(/\n\s*(?:(?:On|Em|El|Le|Am)\b[^\n]{0,500}(?:wrote|escreveu|escribi[oó]|[eé]crit|schrieb)\s*:|[-_]{2,}\s*(?:Original Message|Mensagem original|Forwarded message)|From:\s*[^\n]+\n(?:Sent|Date):|De:\s*[^\n]+\n(?:Enviado|Data):|--\s*(?:\n|$))/i)[0];
  text = text.split(/\r?\n/).filter(line => !/^\s*>/.test(line)).join("\n");
  // Match encoded separators too; decode only each URL so ordinary text remains untouched.
  text = text.replace(/https?:\/\/[^\s<>"']+/gi, raw => {
    let decoded = raw; for (let pass = 0; pass < 3; pass++) { try { decoded = decodeURIComponent(decoded); } catch { break; } }
    try {
      const url = new URL(decoded);
      if ((url.hostname === "portugalactive.com" || url.hostname.endsWith(".portugalactive.com")) && /^\/management\/(?:complete|photos)(?:\/|$)/i.test(url.pathname)
        || /(?:[?#&]|^)token=/i.test(decoded) || url.username || url.password) return "[ligação privada removida]";
    } catch { return "[ligação inválida removida]"; }
    return raw;
  });
  return text.replace(/(?:#|%23)?token(?:=|%3d)[A-Za-z0-9_%=-]{20,}/gi, "[ligação privada removida]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, 16000);
}
