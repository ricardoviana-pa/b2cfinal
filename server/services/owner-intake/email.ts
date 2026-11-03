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
type Section = { title: string; rows: [string, string][] };

/** Frozen alongside the enquiry: provider retries must use identical text/from/to. */
export function ownerNotificationMail(p: OwnerStoredFields, attachmentNames: string[]): OwnerMail {
  const legacy = p.schemaVersion === "owner-intake-legacy";
  const propertyRows: [string, string][] = [
    ["Localização / morada", p.address], ["Tipo de propriedade", typeLabels[p.type] || p.type], ["Quartos", p.bedrooms],
  ];
  if (!legacy) propertyRows.push(["Código postal", p.postalCode], ["Descrição", p.description]);
  const sections: Section[] = [
    { title: "Contacto do proprietário", rows: [["Nome", p.name], ["Email", p.email], ["Telefone", p.phone || "Não fornecido no formulário anterior"]] },
    { title: "Propriedade", rows: propertyRows },
  ];
  if (legacy) {
    sections.push({ title: "Informação do formulário anterior", rows: [["Licença declarada", p.legacyLicense || "Por confirmar"], ["Notas recebidas", p.legacyNotes || "Sem notas"],
      ["Qualificação em falta", "Código postal, descrição, operação turística anterior, situação de ocupação, intenção de venda, prazo e expectativa de rendimento líquido anual não foram recolhidos pelo formulário anterior."]] });
  } else {
    sections.push(
      { title: "Situação atual", rows: [["Já operou para turismo?", yesNo(p.operatedBefore)], ["Tem licença de exploração?", licenseLabels[p.licenseStatus]],
        ["Número de licença", p.licenseNumber || "Não indicado"], ["Vive alguém na propriedade?", yesNo(p.occupied)], ["Ocupação — detalhes", p.occupiedDetails || "Não indicados"]] },
      { title: "Objetivos do proprietário", rows: [["Quando pretende colocar no mercado?", OWNER_TIMELINE_LABELS[p.launchTimeline]],
        ["Rendimento líquido anual esperado pelo proprietário", OWNER_INCOME_LABELS[p.incomeExpectation]],
        ["Propriedade à venda?", yesNo(p.forSale)], ["Interesse em vender com a Portugal Active", p.saleInterest === "maybe" ? "Talvez / gostaria de saber mais" : yesNo(p.saleInterest)]] },
    );
  }
  sections.push({ title: "Fotografias e documentos", rows: [["Link de fotografias", p.photosLink || "Não fornecido"],
    ["Anexos", attachmentNames.length ? attachmentNames.join("\n") : legacy ? "Não disponíveis no formulário anterior" : "Sem ficheiros anexados"]] });
  if (!legacy) sections[sections.length - 1].rows.unshift(["Opção escolhida", {
    link: "Link de fotografias", files: "Ficheiros anexados", both: "Link e ficheiros anexados", later: "O proprietário pretende enviar mais tarde",
  }[p.photoMethod]]);
  if (!legacy) sections.push({ title: "Origem do pedido", rows: [["Idioma", p.context.language], ["Página", p.context.page_path], ["Botão", p.context.placement], ["Privacidade", "Informação de privacidade aceite para tratar este pedido; sem subscrição de marketing"]] });
  const heading = legacy ? "Novo pedido · formulário anterior" : "Nova propriedade para avaliação";
  const banner = legacy ? "Pedido recebido através de uma versão anterior do formulário. Os campos não recolhidos estão identificados para a equipa completar no contacto." : "Ficha completa do proprietário. Responda a este email para contactar diretamente o proprietário.";
  const row = ([label, value]: [string, string]) => {
    const href = label === "Link de fotografias" && p.photosLink ? p.photosLink
      : label === "Email" ? `mailto:${p.email}`
      : label === "Telefone" && p.phone ? `tel:${p.phone.replace(/[^+0-9]/g, "")}` : "";
    const content = href ? `<a href="${escape(href)}" style="color:#285844;text-decoration:underline">${escape(value)}</a>` : escape(value);
    return `<tr><th scope="row" style="width:42%;text-align:left;vertical-align:top;padding:10px 14px;border-bottom:1px solid #eee9e1;font-size:13px;font-weight:500;color:#666157">${escape(label)}</th><td style="padding:10px 14px;border-bottom:1px solid #eee9e1;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.5;color:#242822">${content}</td></tr>`;
  };
  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f5f3ee;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;padding:24px 12px"><tr><td align="center"><table role="presentation" style="width:100%;max-width:680px;border-collapse:collapse;background:#fff"><tr><td style="padding:28px;background:#23362e;color:#fff"><p style="font-size:12px;letter-spacing:2px;margin:0 0 20px">PORTUGAL ACTIVE · PROPRIETÁRIOS</p><h1 style="font-family:Georgia,serif;font-size:28px;font-weight:400;margin:0">${heading}</h1></td></tr><tr><td style="padding:22px 28px;background:#eee9dd;font-size:14px;line-height:1.6;color:#3b433b">${banner}</td></tr>${sections.map(section => `<tr><td style="padding:24px 20px 0"><h2 style="font-family:Georgia,serif;font-size:20px;font-weight:400;color:#23362e;margin:0 0 12px">${section.title}</h2><table style="width:100%;border-collapse:collapse">${section.rows.map(row).join("")}</table></td></tr>`).join("")}<tr><td style="padding:28px 34px;color:#6b7169;font-size:12px;line-height:1.6">Referência: ${escape(p.requestId)}<br>Dados declarados pelo proprietário. A expectativa de rendimento não é uma previsão nem uma garantia da Portugal Active. ${attachmentNames.length ? "Os ficheiros fornecidos seguem como anexos deste email." : "Este pedido não inclui ficheiros anexados."}</td></tr></table></td></tr></table></body></html>`;
  const text = [`PORTUGAL ACTIVE · ${heading}`, banner, ...sections.map(section => `\n${section.title}\n${section.rows.map(([label, value]) => `${label}: ${value}`).join("\n")}`),
    `\nReferência: ${p.requestId}`, "Dados declarados pelo proprietário. A expectativa de rendimento não é uma previsão nem uma garantia da Portugal Active."].join("\n");
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
