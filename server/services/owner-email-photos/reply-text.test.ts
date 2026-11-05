import { describe, expect, it } from "vitest";
import { sanitizeReplyText } from "./reply-text";
describe("new reply text for CRM", () => {
  it("keeps an owner's public property link and decision, removing the quoted request", () => {
    expect(sanitizeReplyText('Já não pretendo vender.\nhttps://www.airbnb.pt/rooms/123\n\nEm 4 nov, PA escreveu:\nPedido antigo')).toBe('Já não pretendo vender.\nhttps://www.airbnb.pt/rooms/123');
  });
  it("removes HTML, signature/history and encoded private capabilities", () => {
    const token = 'a'.repeat(43);
    const text = sanitizeReplyText(`<p>Veja <a href="https://example.org/album">álbum</a>.</p><script>alert(1)</script><p>https://www.portugalactive.com/management/complete/%23token%3D${token}</p><blockquote>Histórico privado</blockquote>`);
    expect(text).toContain('https://example.org/album'); expect(text).toContain('[ligação privada removida]');
    expect(text).not.toMatch(/alert|<|Histórico/); expect(text).not.toContain(token);
    expect(sanitizeReplyText(`Olá\n--\nAssinatura\nhttps://site.test/#token=${token}`)).toBe('Olá');
  });
  it("bounds plain text and never leaks a bare token or encoded token separator", () => {
    expect(sanitizeReplyText(`token=${'z'.repeat(43)} token%3D${'x'.repeat(43)}`)).not.toMatch(/[zx]{43}/);
    expect(sanitizeReplyText('a'.repeat(20000))).toHaveLength(16000);
  });
});
