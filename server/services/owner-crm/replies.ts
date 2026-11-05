import { CrmError, type CrmLedger, type CrmGateway } from "./types";
import { ensureRemote } from "./sync";
import { sanitizeReplyText } from "../owner-email-photos/reply-text";

export interface CrmEmailReply {
  messageKey: string; sourceKey: string; dealId: number; personId: number;
  senderEmail: string; subject: string; receivedAt: Date; bodyText: string;
}
export type ReplyGateway = Pick<CrmGateway, "findNotes"> & {
  createReplyNote(dealId: number, content: string): Promise<number>;
  verifyReplyOwner(dealId: number, personId: number, email: string): Promise<void>;
};
export const replyMarker = (reply: CrmEmailReply) => `PA-OWNER-REPLY-${reply.messageKey}`;
export const replyOperation = (reply: CrmEmailReply) => `owner-reply:${reply.messageKey}:note`;
const escape = (text: string) => text.replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x]!);
function renderText(text: string) {
  const chunks: string[] = []; let cursor = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const start = match.index!, raw = match[0].replace(/[).,;!?]+$/, "");
    chunks.push(escape(text.slice(cursor, start)));
    try {
      const url = new URL(raw);
      if (url.username || url.password) throw new Error("private_url");
      chunks.push(`<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${escape(raw)}</a>`);
    } catch { chunks.push(escape(raw)); }
    cursor = start + raw.length;
  }
  chunks.push(escape(text.slice(cursor))); return chunks.join("").replace(/\n/g, "<br>");
}
export function replyNoteContent(reply: CrmEmailReply) {
  let body = sanitizeReplyText(reply.bodyText), rendered = renderText(body);
  let shortened = false;
  while (Buffer.byteLength(rendered, "utf8") > 90000) { body = body.slice(0, Math.floor(body.length * .8)); rendered = renderText(body); shortened = true; }
  return `<h2>Resposta do proprietário por email</h2><p><strong>De:</strong> ${escape(reply.senderEmail)}<br><strong>Recebida em:</strong> ${reply.receivedAt.toISOString()}<br><strong>Assunto:</strong> ${escape(sanitizeReplyText(reply.subject))}</p>`
    + `<p>${rendered || "Resposta recebida sem texto novo identificável. Consultar o email original."}${shortened ? "<br>[Texto abreviado; consultar a resposta original no email.]" : ""}</p>`
    + `<p>Resposta recebida: o pedido automático de fotografias ficou em pausa. A equipa deve rever o conteúdo e confirmar os próximos passos. Os links são fornecidos pelo proprietário e não foram abertos automaticamente.</p>`
    + `<p>${replyMarker(reply)}</p>`;
}
/** This path can create a note only; it has no person/deal creation capability. */
export async function syncEmailReply(reply: CrmEmailReply, ledger: CrmLedger, gateway: ReplyGateway, verifyLocal: () => Promise<void>) {
  if (!/^[a-f0-9]{64}$/.test(reply.messageKey) || !/^v[34]:[0-9a-f-]{36}$/i.test(reply.sourceKey)
    || !Number.isSafeInteger(reply.dealId) || reply.dealId < 1 || !Number.isSafeInteger(reply.personId) || reply.personId < 1)
    throw new CrmError("REPLY_BINDING_INVALID", true);
  const verify = async () => {
    await ledger.checkpoint(); await verifyLocal();
    await gateway.verifyReplyOwner(reply.dealId, reply.personId, reply.senderEmail);
  };
  await verify();
  return ensureRemote(ledger, replyOperation(reply), () => gateway.findNotes(reply.dealId, replyMarker(reply)),
    () => gateway.createReplyNote(reply.dealId, replyNoteContent(reply)), verify);
}
