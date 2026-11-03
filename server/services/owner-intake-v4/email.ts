import { OWNER_SALES_EMAIL, type OwnerIntakeInput } from "../../../shared/owner-intake";
import { ownerEmailConfigured, ownerNotificationMail } from "../owner-intake/email";
import type { OwnerMail } from "../owner-intake/store";
import type { V4Record } from "./types";
const e = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const OWNER_V4_FROM = "Portugal Active · Management <management@portugalactive.com>";
const labels: Record<string, string> = { villa: "Moradia", apartment: "Apartamento", farmhouse: "Quinta", hostel: "Hostel", guesthouse: "Guesthouse", boutiqueHotel: "Hotel boutique", other: "Outro" };
const welcomeCopy: Record<string, [string, string, string, string, string, string]> = {
  pt: ["Recebemos o seu pedido", "Vamos conhecer melhor a sua propriedade.", "O seu contacto ficou guardado. Este link permite consultar, completar ou atualizar os dados da propriedade, agora ou mais tarde.", "Completar ou consultar pedido", "Pode enviar fotografias agora ou mais tarde. Precisamos de imagens da propriedade para avançar com a avaliação. Se já completou os dados e enviou imagens, não precisa repetir.", "Este link é pessoal e válido por 30 dias. Não o partilhe. Para falar connosco, responda a este email."],
  en: ["We have received your enquiry", "Let’s get to know your property.", "Your contact details have been saved. Use this link to review, complete or update your property details, now or later.", "Complete or view my enquiry", "You can send photos now or later. We need images of the property before we can proceed with the assessment. If you have already completed the details and sent images, you do not need to repeat this.", "This personal link is valid for 30 days. Please do not share it. To contact us, reply to this email."],
  fr: ["Nous avons reçu votre demande", "Faisons connaissance avec votre propriété.", "Vos coordonnées sont enregistrées. Ce lien vous permet de consulter, compléter ou mettre à jour les informations sur votre propriété, maintenant ou plus tard.", "Compléter ou consulter ma demande", "Vous pouvez envoyer les photos maintenant ou plus tard. Nous avons besoin d’images de la propriété pour procéder à son évaluation. Si vous avez déjà complété les informations et envoyé des images, vous n’avez pas à le refaire.", "Ce lien personnel est valable 30 jours. Ne le partagez pas. Pour nous contacter, répondez à cet email."],
  de: ["Wir haben Ihre Anfrage erhalten", "Lernen wir Ihre Immobilie kennen.", "Ihre Kontaktdaten wurden gespeichert. Über diesen Link können Sie Ihre Angaben jetzt oder später ansehen, vervollständigen oder aktualisieren.", "Anfrage ergänzen oder ansehen", "Sie können Fotos jetzt oder später senden. Wir benötigen Bilder der Immobilie, bevor wir mit der Bewertung fortfahren können. Wenn Sie die Angaben bereits ergänzt und Bilder gesendet haben, müssen Sie dies nicht wiederholen.", "Dieser persönliche Link ist 30 Tage gültig. Bitte teilen Sie ihn nicht. Um uns zu kontaktieren, antworten Sie auf diese E-Mail."],
  nl: ["We hebben uw aanvraag ontvangen", "Laten we uw woning beter leren kennen.", "Uw contactgegevens zijn opgeslagen. Via deze link kunt u uw gegevens nu of later bekijken, aanvullen of bijwerken.", "Mijn aanvraag aanvullen of bekijken", "U kunt foto’s nu of later sturen. We hebben beelden van de woning nodig om met de beoordeling verder te gaan. Als u de gegevens al heeft ingevuld en beelden heeft gestuurd, hoeft u dit niet te herhalen.", "Deze persoonlijke link is 30 dagen geldig. Deel hem niet. U kunt ons bereiken door op deze e-mail te antwoorden."],
  es: ["Hemos recibido su solicitud", "Conozcamos mejor su propiedad.", "Sus datos de contacto se han guardado. Este enlace le permite consultar, completar o actualizar los datos de su propiedad, ahora o más adelante.", "Completar o consultar mi solicitud", "Puede enviar fotografías ahora o más adelante. Necesitamos imágenes de la propiedad para avanzar con la evaluación. Si ya ha completado los datos y enviado imágenes, no necesita repetirlo.", "Este enlace personal es válido durante 30 días. No lo comparta. Para contactar con nosotros, responda a este correo."],
  it: ["Abbiamo ricevuto la sua richiesta", "Conosciamo meglio la sua proprietà.", "I suoi recapiti sono stati salvati. Questo link permette di consultare, completare o aggiornare i dettagli della proprietà, ora o più tardi.", "Completa o consulta la richiesta", "Può inviare le fotografie ora o più tardi. Abbiamo bisogno di immagini della proprietà per procedere con la valutazione. Se ha già completato i dati e inviato le immagini, non deve ripetere l’operazione.", "Questo link personale è valido per 30 giorni. Non lo condivida. Per contattarci, risponda a questa email."],
  he: ["קיבלנו את פנייתך", "נשמח להכיר את הנכס שלך.", "פרטי הקשר שלך נשמרו. הקישור מאפשר לצפות בפרטי הנכס, להשלים או לעדכן אותם עכשיו או מאוחר יותר.", "השלמה או צפייה בפנייה שלי", "אפשר לשלוח תמונות עכשיו או מאוחר יותר. אנו זקוקים לתמונות של הנכס כדי להתקדם בהערכה. אם כבר השלמת את הפרטים ושלחת תמונות, אין צורך לחזור על הפעולה.", "הקישור האישי תקף ל־30 יום. אין לשתף אותו. ליצירת קשר, אפשר להשיב לאימייל הזה."],
  ar: ["تلقّينا طلبك", "لنتعرّف على عقارك بشكل أفضل.", "تم حفظ بيانات الاتصال الخاصة بك. يتيح لك هذا الرابط مراجعة تفاصيل العقار أو إكمالها أو تحديثها الآن أو لاحقًا.", "إكمال طلبي أو الاطلاع عليه", "يمكنك إرسال الصور الآن أو لاحقًا. نحتاج إلى صور للعقار للمضي قدمًا في التقييم. إذا كنت قد أكملت البيانات وأرسلت الصور بالفعل، فلا داعي لتكرار ذلك.", "هذا الرابط شخصي وصالح لمدة 30 يومًا. لا تشاركه مع الآخرين. للتواصل معنا، يمكنك الرد على هذا البريد الإلكتروني."],
  zh: ["我们已收到您的申请", "让我们进一步了解您的房产。", "您的联系方式已保存。您可以现在或稍后通过此链接查看、完善或更新房产资料。", "完善或查看我的申请", "您可以现在或稍后发送照片。我们需要房产图片才能继续进行评估。如果您已填写资料并发送图片，则无需重复操作。", "此个人链接的有效期为30天，请勿分享。如需联系我们，请回复此邮件。"],
};
function shell(title: string, content: string, language = "pt") {
  const rtl = ["he", "ar"].includes(language);
  return `<!doctype html><html lang="${language}"${rtl ? ' dir="rtl"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title></head><body style="margin:0;background:#f1f2ec;color:#252d27;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 10px"><table role="presentation" width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#fff;border:1px solid #e6e7df;border-radius:8px"><tr><td align="center" style="padding:18px;background:#fafaf7"><img src="https://www.portugalactive.com/brand/pa-logo-dark.png" width="150" height="94" alt="Portugal Active" style="display:block;border:0;width:150px;height:94px"><p style="font-size:11px;letter-spacing:1.5px;color:#304838">PORTUGAL ACTIVE · PROPERTY MANAGEMENT</p></td></tr><tr><td style="padding:26px;font-size:15px;line-height:1.6">${content}</td></tr></table></td></tr></table></body></html>`;
}
function attribution(record: V4Record) {
  return record.attribution ? Object.entries(record.attribution).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") : "";
}
export function welcomeMail(record: V4Record, completionUrl: string): OwnerMail {
  const lang = welcomeCopy[record.context.language] ? record.context.language : "en";
  const c = welcomeCopy[lang];
  const text = `${record.contact.name},\n\n${c[1]}\n${c[2]}\n\n${c[3]}: ${completionUrl}\n\n${c[4]}\n\n${c[5]}\n\nPortugal Active\n${record.id}`;
  return { from: OWNER_V4_FROM, to: record.contact.email, replyTo: OWNER_SALES_EMAIL, subject: `Portugal Active · ${c[0]}`,
    text, html: shell(c[0], `<p style="margin-top:0">${e(record.contact.name)},</p><h1 style="font-size:27px;line-height:1.25">${e(c[1])}</h1><p>${e(c[2])}</p><p style="margin:26px 0"><a href="${e(completionUrl)}" style="display:inline-block;padding:13px 20px;background:#304838;color:#fff;text-decoration:none;border-radius:5px;font-weight:bold">${e(c[3])}</a></p><p>${e(c[4])}</p><p style="font-size:12px;color:#676d62">${e(c[5])}</p><p style="font-size:11px;color:#676d62">${e(record.id)}</p>`, lang) };
}
export function managementStartMail(record: V4Record): OwnerMail {
  const p = record.contact;
  const source = attribution(record);
  const lines = [`Novo contacto — qualificação por completar`, `Referência: ${record.id}`, `Nome: ${p.name}`, `Email: ${p.email}`, `Telefone: ${p.phone}`, `Tipo: ${labels[p.type] || p.type}`, `Localidade: ${p.locality}`, `Idioma: ${record.context.language}`, `Origem: ${record.context.page_path} · ${record.context.placement}`, "Privacidade aceite para tratar este pedido. Sem subscrição de marketing.", ...(source ? [`Campanha: ${source}`] : [])];
  return { from: OWNER_V4_FROM, to: OWNER_SALES_EMAIL, replyTo: p.email, subject: `[Por completar] ${p.locality} · ${p.name} · Portugal Active`, text: lines.join("\n"),
    html: shell("Novo contacto de proprietário", `<p style="font-size:12px;color:#8b7355;text-transform:uppercase">Contacto recebido · Qualificação por completar</p><h1 style="font-size:27px;line-height:1.25">Uma nova propriedade para conhecer.</h1><p><strong>${e(p.locality)}</strong><br>${e(labels[p.type] || p.type)}</p><p><strong>${e(p.name)}</strong><br><a href="mailto:${e(p.email)}" style="color:#304838">${e(p.email)}</a><br><a href="tel:${e(p.phone.replace(/[^+0-9]/g, ""))}" style="color:#304838">${e(p.phone)}</a></p><p>O contacto ficou guardado. O proprietário pode completar a qualificação através do link pessoal de continuação. Este pedido mantém a mesma referência quando for atualizado.</p><p style="font-size:12px;color:#676d62">Idioma: ${e(record.context.language)} · ${e(record.context.page_path)} · ${e(record.context.placement)}<br>Privacidade aceite para tratar este pedido. Sem subscrição de marketing.${source ? `<br>Campanha: ${e(source)}` : ""}<br>Referência: ${e(record.id)}</p>`) };
}
export function managementCompletedMail(record: V4Record, files: { name: string; mimeType: string }[]): OwnerMail {
  const p = record.contact;
  const d = record.details as OwnerV4RecordDetails;
  const hasLink = !!d.photosLink;
  const fields = { ...p, ...d, schemaVersion: "owner-intake-v3" as const, requestId: record.id,
    photoMethod: hasLink ? files.length ? "both" as const : "link" as const : files.length ? "files" as const : "later" as const,
    privacyAcknowledged: true as const, context: record.context };
  const base = ownerNotificationMail(fields, files.map(f => f.name));
  const state = record.status === "awaiting_photos" ? "Aguarda fotografias — avaliação por iniciar" : "Dados e imagens recebidos — confirmar suficiência antes de avaliar";
  const source = attribution(record);
  const banner = `<div style="padding:12px 18px;background:#e9efe7;color:#304838;font-family:Arial,sans-serif;font-size:13px"><strong>${state}</strong><br>Localidade: ${e(p.locality)}${source ? `<br>Campanha: ${e(source)}` : ""}</div>`;
  return { ...base, from: OWNER_V4_FROM, subject: `[${record.status === "awaiting_photos" ? "Aguarda fotos" : "Dados e imagens"}] ${p.locality} · ${p.name} · Portugal Active`,
    html: base.html.replace(/(<body[^>]*>)/, `$1${banner}`).replaceAll("Sem fotografias ou documentos — envio opcional", "Fotografias em falta — necessárias para avançar com a avaliação"), text: `${state}\nLocalidade: ${p.locality}${source ? `\nCampanha: ${source}` : ""}\n\n${base.text.replaceAll("Sem fotografias ou documentos — envio opcional", "Fotografias em falta — necessárias para avançar com a avaliação")}` };
}
type OwnerV4RecordDetails = Omit<OwnerIntakeInput, "name" | "email" | "phone" | "type">;

export class V4DeliveryError extends Error {
  constructor(public readonly code: string, public readonly retryAfterSeconds = 120, public readonly permanent = false,
    public readonly confirmedRejected = false) { super(code); }
}
export async function sendV4Mail(id: string, mail: OwnerMail, files: { name: string; mimeType: string; content: Buffer }[]) {
  if (!ownerEmailConfigured()) throw new V4DeliveryError("EMAIL_UNAVAILABLE");
  const response = await fetch("https://api.resend.com/emails", { method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `owner-v4-${id}` },
    signal: AbortSignal.timeout(30_000), body: JSON.stringify({ from: mail.from, to: mail.to, reply_to: mail.replyTo,
      subject: mail.subject, html: mail.html, text: mail.text,
      attachments: files.map(file => ({ filename: file.name, content: file.content.toString("base64"), content_type: file.mimeType })) }) });
  if (!response.ok) {
    const rawWait = response.headers.get("retry-after");
    const numeric = Number(rawWait);
    const wait = rawWait && !Number.isFinite(numeric) ? (Date.parse(rawWait) - Date.now()) / 1000 : numeric;
    const body = await response.json().catch(() => null) as { name?: unknown } | null;
    const daily = response.status === 429 && body?.name === "daily_quota_exceeded";
    const monthly = response.status === 429 && body?.name === "monthly_quota_exceeded";
    const now = new Date();
    const nextUtcDay = Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000) + 60;
    const seconds = Math.max(Number.isFinite(wait) && wait > 0 ? Math.min(24 * 3600, Math.ceil(wait)) : 120, daily ? nextUtcDay : monthly ? 3600 : 0);
    throw new V4DeliveryError(daily ? "PROVIDER_DAILY_QUOTA" : monthly ? "PROVIDER_MONTHLY_QUOTA" : response.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_UNCONFIRMED",
      seconds, response.status >= 400 && response.status < 500 && ![408, 409, 425, 429].includes(response.status), response.status === 429);
  }
  const value = await response.json() as { id?: unknown };
  if (typeof value.id !== "string" || !value.id) throw new V4DeliveryError("PROVIDER_UNCONFIRMED");
  return value.id;
}
