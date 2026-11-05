import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { OWNER_SALES_EMAIL } from "../../../shared/owner-intake";
import { isOwnerIntakeProduction } from "../owner-intake/email";
import type { OwnerMail } from "../owner-intake/store";
import { automationEligible } from "./sync";
import { CrmError, type CrmEnquiry } from "./types";

const FROM = "Portugal Active · Management <management@portugalactive.com>";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
// Only contact summaries are included. Private continuation capabilities never belong in CRM alerts.
const safeText = (value: string, limit: number) => String(value || "")
  .replace(/https?:\/\/[^\s<>"']*\/management\/complete[^\s<>"']*/gi, "[ligação privada omitida]")
  .replace(/(?:#|&#(?:35|x23);|%23)?token(?:=|%3d|&#61;)[A-Za-z0-9_-]{32,256}/gi, "[ligação privada omitida]")
  .replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
const validEmail = (value: string) => value.length <= 254
  && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value);

export function ownerCrmReviewId(sourceKey: string) {
  return `crm-review:${createHash("sha256").update(sourceKey).digest("hex")}`;
}

function reviewMail(enquiry: CrmEnquiry, personId: number | null): OwnerMail {
  const email = enquiry.email.trim();
  const contact: [string, string][] = [
    ["Proprietário", safeText(enquiry.name, 180) || "Por confirmar"],
    ["Email", validEmail(email) ? email : "Por confirmar"],
    ["Localidade", safeText(enquiry.locality, 160) || "Por confirmar"],
    ["Referência do pedido", enquiry.sourceKey],
  ];
  const title = "Pedido por associar no Pipedrive";
  const explanation = "Recebemos um pedido de avaliação de um contacto que já tem um negócio aberto. O pedido ficou a aguardar confirmação da propriedade; não foi criado um negócio duplicado.";
  const next = "Confirme se o pedido corresponde à mesma casa e indique à equipa responsável pela integração o negócio correto, usando a referência abaixo. Os dados e anexos recebidos continuam guardados. Não é necessário pedir ao proprietário para preencher novamente o formulário.";
  const contactUrl = personId ? `https://portugalactive.pipedrive.com/person/${personId}` : null;
  const reply = "Responder a este aviso mantém o assunto na equipa de gestão.";
  const text = ["PORTUGAL ACTIVE · MANAGEMENT", title, explanation, "Próximo passo", next,
    ...contact.map(([label, value]) => `${label}: ${value}`), ...(contactUrl ? [`Abrir contacto no Pipedrive: ${contactUrl}`] : []),
    reply, "Este aviso é enviado uma única vez por pedido."].join("\n\n");
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f2f3ed;font:15px/1.6 Arial,sans-serif;color:#252d27"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid #e1e4da;border-radius:12px"><tr><td style="padding:26px 30px;border-bottom:1px solid #e1e4da"><img src="https://www.portugalactive.com/brand/pa-logo-dark.png" width="140" alt="Portugal Active" style="display:block;border:0;height:auto"></td></tr><tr><td style="padding:28px 30px"><p style="font-size:11px;letter-spacing:1px;color:#8b7355;text-transform:uppercase;margin:0">Atenção da equipa comercial</p><h1 style="font-size:26px;line-height:1.25;margin:10px 0 20px">${title}</h1><p>${explanation}</p><div style="padding:16px;background:#f4eee2;border-left:4px solid #8b7355"><strong>Próximo passo</strong><p style="margin:6px 0 0">${next}</p></div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-collapse:collapse">${contact.map(([label, value]) => `<tr><td style="padding:9px 0;vertical-align:top;border-bottom:1px solid #e1e4da;font-size:12px;color:#676d62;width:35%">${escape(label)}</td><td style="padding:9px 0 9px 12px;border-bottom:1px solid #e1e4da;font-size:13px;overflow-wrap:anywhere">${escape(value)}</td></tr>`).join("")}</table>${contactUrl ? `<p style="margin:26px 0"><a href="${contactUrl}" style="display:inline-block;padding:12px 18px;background:#304838;color:#fff;text-decoration:none;border-radius:5px;font-weight:bold">Abrir contacto no Pipedrive</a></p>` : ""}<p style="font-size:12px;color:#676d62">${reply}</p><p style="font-size:11px;color:#676d62">Este aviso é enviado uma única vez por pedido.</p></td></tr></table></td></tr></table></body></html>`;
  return { from: FROM, to: OWNER_SALES_EMAIL, replyTo: OWNER_SALES_EMAIL,
    subject: `[PA Gestão] Pedido por associar · ${enquiry.id.slice(0, 8).toUpperCase()}`, text, html };
}

/** Caller persists the CRM review result first and catches notification failures separately. */
export async function queueOwnerCrmReview(enquiry: CrmEnquiry, error: unknown): Promise<boolean> {
  if (!isOwnerIntakeProduction() || !(error instanceof CrmError) || error.code !== "EXISTING_OPPORTUNITY_REVIEW") return false;
  if (!["v3", "v4"].includes(enquiry.source) || !UUID.test(enquiry.id) || enquiry.sourceKey !== `${enquiry.source}:${enquiry.id}`
    || !automationEligible(enquiry)) return false;
  const db = await getDb(); if (!db) throw new CrmError("CRM_REVIEW_STORAGE_UNAVAILABLE");
  const result = await db.execute(sql`SELECT remoteId FROM owner_crm_operations
    WHERE operationKey=${`enquiry:${enquiry.sourceKey}:person`} AND status='done' LIMIT 1`);
  const rawId = (result as unknown as [{ remoteId: unknown }[], unknown])[0][0]?.remoteId;
  const id = Number(rawId), personId = Number.isSafeInteger(id) && id > 0 ? id : null;
  const payload = { mail: reviewMail(enquiry, personId), fileIds: [] };
  // The primary key, rather than a preflight SELECT, makes retries and concurrent sweeps idempotent.
  const inserted = await db.execute(sql`INSERT IGNORE INTO owner_v4_outbox (id,enquiryId,kind,payload,attachmentBytes,createdAt)
    VALUES (${ownerCrmReviewId(enquiry.sourceKey)},${enquiry.id},'crm_review',${JSON.stringify(payload)},0,${new Date()})`);
  return Number((inserted as unknown as [{ affectedRows: number }, unknown])[0].affectedRows) === 1;
}
