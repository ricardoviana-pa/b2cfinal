import { OWNER_INCOME_LABELS, OWNER_SALES_EMAIL, OWNER_TIMELINE_LABELS, type OwnerStoredFields } from "../../../shared/owner-intake";
import type { OwnerMail } from "./store";
import { isPreviewDeployment } from "../../lib/preview-isolation";

export function isOwnerIntakeProduction(env: NodeJS.ProcessEnv = process.env) {
  return !isPreviewDeployment(env) && env.NODE_ENV === "production" && env.RENDER_SERVICE_ID === "srv-d700n5fgi27c73f9bse0";
}
export function ownerEmailConfigured() { return isOwnerIntakeProduction() && !!process.env.RESEND_API_KEY; }
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const yesNo = (value: string) => value === "yes" ? "Sim" : value === "no" ? "Não" : "Por confirmar";
const typeLabels: Record<string, string> = { villa: "Moradia", apartment: "Apartamento", farmhouse: "Quinta", hostel: "Hostel", guesthouse: "Guesthouse", boutiqueHotel: "Hotel boutique", other: "Outro" };
const licenseLabels = { yes: "Sim", pending: "Em processo", no: "Não", unknown: "Não sabe / por confirmar" };
const OWNER_LOGO_URL = "https://www.portugalactive.com/brand/pa-logo-dark.png";
const C = { ink: "#252D27", muted: "#676D62", green: "#304838", paper: "#FAFAF7", sand: "#E6E7DF", gold: "#8B7355" };
const photoMethods = { link: "Fotografias partilhadas por link", files: "Ficheiros anexados", both: "Link de fotografias e ficheiros anexados", later: "Sem fotografias ou documentos — envio opcional" };

/** Frozen alongside the enquiry: provider retries must use identical text/from/to. */
export function ownerNotificationMail(p: OwnerStoredFields, attachmentNames: string[]): OwnerMail {
  const legacy = p.schemaVersion === "owner-intake-legacy";
  const propertyType = typeLabels[p.type] || p.type;
  const propertyMeta = `${propertyType} · ${p.bedrooms} ${p.bedrooms === "1" ? "quarto" : "quartos"}${legacy ? "" : ` · ${p.postalCode}`}`;
  const phoneHref = p.phone ? `tel:${p.phone.replace(/[^+0-9]/g, "")}` : "";
  const mailHref = `mailto:${p.email}`;
  const saleInterest = legacy ? "Por confirmar" : p.saleInterest === "maybe" ? "Talvez" : yesNo(p.saleInterest);
  const heading = legacy ? "Uma casa para conhecer." : "Nova propriedade para avaliar.";
  const summary: [string, string][] = legacy
    ? [["Licença declarada", p.legacyLicense || "Por confirmar"], ["Qualificação", "Completar no primeiro contacto"]]
    : [["Entrada no mercado", OWNER_TIMELINE_LABELS[p.launchTimeline]],
       ["Expectativa líquida / ano", OWNER_INCOME_LABELS[p.incomeExpectation]],
       ["Licença de exploração", licenseLabels[p.licenseStatus]],
       ["Já operou para turismo?", yesNo(p.operatedBefore)],
       ["Vive alguém na casa?", yesNo(p.occupied)],
       ["Imobiliária", `À venda: ${yesNo(p.forSale)}\nInteresse em vender com a PA: ${saleInterest}`]];
  const preheader = `${p.address} · ${propertyMeta}${legacy ? " · Qualificação por completar" : ` · ${OWNER_TIMELINE_LABELS[p.launchTimeline]} · ${OWNER_INCOME_LABELS[p.incomeExpectation]} líquidos/ano esperados`}`;
  const link = (href: string, label: string) => `<a href="${escape(href)}" style="color:${C.green};text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere;word-break:break-word">${escape(label)}</a>`;
  const button = (href: string, label: string, primary = false) => `<a href="${escape(href)}" style="display:inline-block;background:${primary ? C.green : "#FFFFFF"};border:1px solid ${primary ? C.green : C.sand};border-radius:5px;color:${primary ? "#FFFFFF" : C.green};font-family:Arial,sans-serif;font-size:13px;font-weight:bold;line-height:20px;padding:11px 18px;text-decoration:none;mso-padding-alt:0;text-align:center">${escape(label)}</a>`;
  const sectionTitle = (title: string) => `<h2 style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;color:${C.gold};margin:0 0 12px">${title}</h2>`;
  const summaryRows = [];
  for (let i = 0; i < summary.length; i += 2) {
    summaryRows.push(`<tr>${summary.slice(i, i + 2).map(([label, value], index) => `<td width="50%" valign="top" style="width:50%;padding:13px 16px;${i ? `border-top:1px solid ${C.sand};` : ""}${index ? `border-left:1px solid ${C.sand};` : ""}"><p style="font-family:Arial,sans-serif;font-size:10px;line-height:15px;color:${C.muted};margin:0 0 5px">${escape(label)}</p><p style="font-family:Arial,sans-serif;font-size:${label === "Imobiliária" ? "12" : "16"}px;line-height:22px;font-weight:${label === "Imobiliária" ? "normal" : "bold"};color:${C.ink};margin:0;white-space:pre-line;overflow-wrap:anywhere">${escape(value)}</p></td>`).join("")}</tr>`);
  }
  const extra = legacy ? "" : [
    p.licenseNumber ? `<p style="margin:10px 0 0;font-size:13px;line-height:20px;color:${C.muted}"><strong style="color:${C.ink};font-weight:normal">Número de licença:</strong> ${escape(p.licenseNumber)}</p>` : "",
    p.occupiedDetails ? `<p style="margin:10px 0 0;font-size:13px;line-height:20px;color:${C.muted};white-space:pre-wrap"><strong style="color:${C.ink};font-weight:normal">Ocupação — detalhes:</strong> ${escape(p.occupiedDetails)}</p>` : "",
  ].join("");
  const description = legacy
    ? `<p style="font-size:14px;line-height:23px;color:${C.ink};margin:0;white-space:pre-wrap;overflow-wrap:anywhere">${escape(p.legacyNotes || "Sem notas adicionais no formulário anterior.")}</p><p style="font-size:12px;line-height:20px;color:${C.muted};margin:12px 0 0">Código postal, descrição, operação turística anterior, ocupação, intenção de venda, prazo e expectativa de rendimento não foram recolhidos. Confirmar estes pontos no primeiro contacto.</p>`
    : `<p style="font-size:14px;line-height:23px;color:${C.ink};margin:0;white-space:pre-wrap;overflow-wrap:anywhere">${escape(p.description)}</p>${extra}`;
  const photoDescription = legacy ? p.photosLink ? "Fotografias partilhadas por link" : "Sem fotografias no formulário anterior" : photoMethods[p.photoMethod];
  const filesHtml = attachmentNames.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:collapse">${attachmentNames.map(name => `<tr><td style="padding:8px 12px;border:1px solid ${C.sand};background:${C.paper};font-size:12px;line-height:18px;color:${C.ink};overflow-wrap:anywhere;word-break:break-word">${escape(name)}</td></tr>`).join("")}</table><p style="font-size:11px;line-height:18px;color:${C.muted};margin:8px 0 0">${attachmentNames.length === 1 ? "O ficheiro segue como anexo deste email." : "Os ficheiros seguem como anexos deste email."}</p>`
    : `<p style="font-size:11px;color:${C.muted};margin:10px 0 0">${legacy ? "Anexos não disponíveis no formulário anterior." : "Sem ficheiros anexados."}</p>`;
  const origin = legacy ? "Recebido através do formulário anterior." : `Idioma: ${escape(p.context.language.toUpperCase())} &nbsp;·&nbsp; Página: ${escape(p.context.page_path)} &nbsp;·&nbsp; Botão: ${escape(p.context.placement)}<br>Informação de privacidade aceite para tratar este pedido. Sem subscrição de marketing.`;
  const html = `<!DOCTYPE html>
<html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>Portugal Active · Novo pedido de proprietário</title>
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0;mso-table-rspace:0}img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}@media only screen and (max-width:480px){.pa-outer{padding:12px 6px!important}.pa-content{padding-left:22px!important;padding-right:22px!important}.pa-title{font-size:26px!important}.pa-contact-action{display:block!important;width:100%!important;padding:0 0 8px!important}.pa-contact-action a{display:block!important}.pa-logo{width:150px!important;height:auto!important}}</style></head>
<body style="margin:0;padding:0;background:#F1F2EC;font-family:Arial,sans-serif;color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F2EC"><tr><td align="center" class="pa-outer" style="padding:26px 12px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#FFFFFF;border:1px solid ${C.sand};border-radius:8px;border-collapse:separate;overflow:hidden">
<tr><td align="center" style="padding:15px 24px 17px;background:${C.paper};border-bottom:1px solid ${C.sand}"><a href="https://www.portugalactive.com/management/" style="text-decoration:none"><img class="pa-logo" src="${OWNER_LOGO_URL}" width="166" height="104" alt="Portugal Active" style="display:block;width:166px;height:104px;margin:0 auto;color:${C.ink};font-family:Arial,sans-serif;font-size:18px"></a><p style="font-family:Arial,sans-serif;font-size:10px;line-height:16px;letter-spacing:1.4px;color:${C.muted};margin:0">PORTUGAL ACTIVE · EQUIPA COMERCIAL</p></td></tr>
<tr><td class="pa-content" style="padding:27px 34px 20px"><p style="font-size:10px;line-height:16px;letter-spacing:1.5px;font-weight:bold;color:${C.gold};margin:0 0 8px">${legacy ? "QUALIFICAÇÃO POR COMPLETAR" : "NOVO PEDIDO DE AVALIAÇÃO"}</p><h1 class="pa-title" style="font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:normal;line-height:1.2;color:${C.ink};margin:0 0 14px">${heading}</h1><p style="font-size:16px;line-height:24px;font-weight:bold;color:${C.ink};margin:0 0 4px;overflow-wrap:anywhere">${escape(p.address)}</p><p style="font-size:12px;line-height:20px;color:${C.muted};margin:0">${escape(propertyMeta)}</p></td></tr>
<tr><td class="pa-content" style="padding:0 34px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;background:${C.paper};border:1px solid ${C.sand};border-radius:6px">${summaryRows.join("")}</table>${legacy ? "" : `<p style="font-size:10px;line-height:17px;color:${C.muted};margin:8px 1px 0">Rendimento líquido anual esperado pelo proprietário, após custos. Expectativa declarada, sem previsão ou garantia da Portugal Active.</p>`}</td></tr>
<tr><td class="pa-content" style="padding:0 34px 24px">${sectionTitle("Contacto do proprietário")}<p style="font-size:18px;line-height:25px;font-weight:bold;color:${C.ink};margin:0 0 7px;overflow-wrap:anywhere">${escape(p.name)}</p><p style="font-size:13px;line-height:23px;margin:0 0 15px">${link(mailHref, p.email)}<br>${phoneHref ? link(phoneHref, p.phone) : `<span style="color:${C.muted}">Telefone não fornecido no formulário anterior.</span>`}</p><table role="presentation" cellpadding="0" cellspacing="0"><tr><td class="pa-contact-action" style="padding-right:9px">${button(mailHref, "Responder ao proprietário", true)}</td>${phoneHref ? `<td class="pa-contact-action">${button(phoneHref, "Ligar")}</td>` : ""}</tr></table><p style="font-size:11px;line-height:18px;color:${C.muted};margin:10px 0 0">A função Responder deste email também contacta diretamente o proprietário.</p></td></tr>
<tr><td class="pa-content" style="padding:23px 34px;border-top:1px solid ${C.sand}">${sectionTitle(legacy ? "Notas e informação em falta" : "Sobre a casa")}${description}</td></tr>
<tr><td class="pa-content" style="padding:23px 34px;border-top:1px solid ${C.sand}">${sectionTitle("Fotografias e documentos")}<p style="font-size:13px;line-height:21px;color:${C.muted};margin:0 0 10px">${escape(photoDescription)}</p>${p.photosLink ? `${button(p.photosLink, "Ver fotografias")}<p style="font-size:10px;line-height:17px;margin:9px 0 0;overflow-wrap:anywhere;word-break:break-word">${link(p.photosLink, p.photosLink)}</p>` : ""}${filesHtml}</td></tr>
<tr><td class="pa-content" style="padding:18px 34px;background:${C.paper};border-top:1px solid ${C.sand};font-size:10px;line-height:18px;color:${C.muted};overflow-wrap:anywhere"><p style="margin:0 0 5px">${origin}</p><p style="margin:0">Referência: ${escape(p.requestId)}</p></td></tr>
</table><p style="font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:20px;color:${C.muted};margin:18px 0 0;text-align:center">Portugal Active<br><span style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:.6px">A privacidade de uma casa. O serviço de um hotel.</span></p>
</td></tr></table></body></html>`;
  const details: string[] = legacy
    ? [`Licença declarada: ${p.legacyLicense || "Por confirmar"}`, `Notas recebidas: ${p.legacyNotes || "Sem notas"}`, "Qualificação em falta: código postal, descrição, operação turística anterior, ocupação, intenção de venda, prazo e expectativa de rendimento não foram recolhidos."]
    : [`Descrição: ${p.description}`, ...(p.licenseNumber ? [`Número de licença: ${p.licenseNumber}`] : []), ...(p.occupiedDetails ? [`Ocupação — detalhes: ${p.occupiedDetails}`] : []), `Propriedade à venda?: ${yesNo(p.forSale)}`, `Interesse em vender com a Portugal Active: ${saleInterest}`, `Idioma: ${p.context.language}`, `Página: ${p.context.page_path}`, `Botão: ${p.context.placement}`, "Informação de privacidade aceite para tratar este pedido; sem subscrição de marketing."];
  const text = ["PORTUGAL ACTIVE · EQUIPA COMERCIAL", heading, `Localização / morada: ${p.address}`, propertyMeta, ...summary.map(([label, value]) => `${label}: ${value}`),
    "\nCONTACTO DO PROPRIETÁRIO", `Nome: ${p.name}`, `Email: ${p.email}`, `Telefone: ${p.phone || "Não fornecido no formulário anterior"}`, "Responder a este email contacta diretamente o proprietário.",
    "\nSOBRE A CASA", ...details, "\nFOTOGRAFIAS E DOCUMENTOS", photoDescription, `Link de fotografias: ${p.photosLink || "Não fornecido"}`, `Anexos: ${attachmentNames.length ? attachmentNames.join(", ") : "Sem ficheiros anexados"}`,
    `\nReferência: ${p.requestId}`, "Rendimento líquido anual esperado pelo proprietário, após custos. Dados declarados; não são uma previsão nem garantia da Portugal Active."].join("\n");
  return { from: process.env.EMAIL_FROM || "Portugal Active <booking@portugalactive.com>", to: OWNER_SALES_EMAIL,
    replyTo: p.email, subject: `[PA Proprietários] ${legacy ? "Qualificação pendente" : "Novo pedido"} · ${p.address.replace(/[\r\n]/g, " ").slice(0, 100)}`, html, text };
}

export async function sendOwnerNotification(id: string, mail: OwnerMail, files: { name: string; mimeType: string; content: Buffer }[]) {
  if (!ownerEmailConfigured()) throw new Error("OWNER_EMAIL_UNAVAILABLE");
  // No fallback sender, CC or BCC. This is the sole notification circuit.
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `owner-enquiry-${id}-team-v1` },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ from: mail.from, to: mail.to, reply_to: mail.replyTo, subject: mail.subject, html: mail.html, text: mail.text,
      attachments: files.map(file => ({ filename: file.name, content: file.content.toString("base64"), content_type: file.mimeType })),
    }),
  });
  if (!response.ok) throw new Error("OWNER_EMAIL_UNCONFIRMED");
  const data = await response.json() as { id?: string };
  if (!data?.id || typeof data.id !== "string") throw new Error("OWNER_EMAIL_UNCONFIRMED");
  return data.id;
}
