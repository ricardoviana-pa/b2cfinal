import { OWNER_INCOME_LABELS, OWNER_SALES_EMAIL, OWNER_TIMELINE_LABELS } from "../../../shared/owner-intake";
import { ownerEmailConfigured } from "../owner-intake/email";
import type { OwnerMail } from "../owner-intake/store";
import type { V4Record } from "./types";
const e = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const OWNER_V4_FROM = "Portugal Active · Management <management@portugalactive.com>";
const labels: Record<string, string> = { villa: "Moradia", apartment: "Apartamento", farmhouse: "Quinta", hostel: "Hostel", guesthouse: "Guesthouse", boutiqueHotel: "Hotel boutique", other: "Outro" };
const welcomeCopy: Record<string, [string, string, string, string, string, string]> = {
  pt: ["Recebemos o seu pedido", "Obrigado por nos apresentar a sua casa.", "O seu contacto e os dados que já enviou estão guardados. Para conhecer a casa e preparar a avaliação, precisamos de fotografias ou de um link para um álbum ou anúncio.", "Enviar fotografias", "Este botão abre apenas o envio de fotografias, sem repetir o formulário. Mostre o exterior e as principais divisões. Se já enviou imagens, não precisa repetir: a nossa equipa irá revê-las e contactá-lo para os próximos passos.", "O link é pessoal e válido por 30 dias. Não o partilhe. Se precisar de ajuda, responda a este email."],
  en: ["We have received your enquiry", "Thank you for introducing your home.", "Your contact details and the information you have already sent are saved. To understand your home and prepare the assessment, we need photographs or a link to an album or listing.", "Send photographs", "This button opens the photo upload only; you do not need to repeat the form. Show the exterior and main rooms. If you have already sent images, there is nothing to repeat: our team will review them and contact you about the next steps.", "This personal link is valid for 30 days. Please do not share it. If you need help, reply to this email."],
  fr: ["Nous avons reçu votre demande", "Merci de nous présenter votre maison.", "Vos coordonnées et les informations déjà envoyées sont enregistrées. Pour connaître votre maison et préparer son évaluation, nous avons besoin de photos ou d’un lien vers un album ou une annonce.", "Envoyer des photos", "Ce bouton ouvre uniquement l’envoi de photos, sans remplir à nouveau le formulaire. Montrez l’extérieur et les principales pièces. Si vous avez déjà envoyé des images, inutile de recommencer : notre équipe les examinera et vous contactera pour la suite.", "Ce lien personnel est valable 30 jours. Ne le partagez pas. Pour obtenir de l’aide, répondez à cet email."],
  de: ["Wir haben Ihre Anfrage erhalten", "Vielen Dank, dass Sie uns Ihr Haus vorstellen.", "Ihre Kontaktdaten und die bereits gesendeten Angaben sind gespeichert. Um Ihr Haus kennenzulernen und die Bewertung vorzubereiten, benötigen wir Fotos oder einen Link zu einem Album oder Inserat.", "Fotos senden", "Dieser Button öffnet nur den Foto-Upload; Sie müssen das Formular nicht erneut ausfüllen. Zeigen Sie die Außenansicht und die wichtigsten Räume. Wenn Sie bereits Bilder gesendet haben, ist nichts weiter nötig: Unser Team prüft sie und meldet sich zu den nächsten Schritten.", "Dieser persönliche Link ist 30 Tage gültig. Bitte teilen Sie ihn nicht. Wenn Sie Hilfe benötigen, antworten Sie auf diese E-Mail."],
  nl: ["We hebben uw aanvraag ontvangen", "Bedankt dat u uw woning aan ons voorstelt.", "Uw contactgegevens en de informatie die u al heeft gestuurd zijn opgeslagen. Om uw woning te leren kennen en de beoordeling voor te bereiden, hebben we foto’s nodig of een link naar een album of advertentie.", "Foto’s sturen", "Deze knop opent alleen het uploaden van foto’s; u hoeft het formulier niet opnieuw in te vullen. Laat de buitenkant en de belangrijkste kamers zien. Heeft u al beelden gestuurd? Dan hoeft u niets te herhalen: ons team bekijkt ze en neemt contact op over de volgende stappen.", "Deze persoonlijke link is 30 dagen geldig. Deel hem niet. Heeft u hulp nodig? Antwoord op deze e-mail."],
  es: ["Hemos recibido su solicitud", "Gracias por presentarnos su casa.", "Sus datos de contacto y la información que ya ha enviado están guardados. Para conocer su casa y preparar la evaluación, necesitamos fotografías o un enlace a un álbum o anuncio.", "Enviar fotografías", "Este botón abre solo el envío de fotografías, sin repetir el formulario. Muestre el exterior y las principales estancias. Si ya ha enviado imágenes, no necesita repetirlo: nuestro equipo las revisará y le contactará para los siguientes pasos.", "El enlace es personal y válido durante 30 días. No lo comparta. Si necesita ayuda, responda a este correo."],
  it: ["Abbiamo ricevuto la sua richiesta", "Grazie per averci presentato la sua casa.", "I suoi recapiti e le informazioni già inviate sono salvati. Per conoscere la casa e preparare la valutazione, abbiamo bisogno di fotografie o di un link a un album o annuncio.", "Invia fotografie", "Questo pulsante apre solo l’invio delle fotografie, senza ripetere il modulo. Mostri gli esterni e gli ambienti principali. Se ha già inviato immagini, non deve ripetere l’operazione: il nostro team le esaminerà e la contatterà per i prossimi passi.", "Il link è personale e valido per 30 giorni. Non lo condivida. Se ha bisogno di aiuto, risponda a questa email."],
  he: ["קיבלנו את פנייתך", "תודה שהצגת לנו את הבית שלך.", "פרטי הקשר והמידע שכבר שלחת נשמרו. כדי להכיר את הבית ולהכין את ההערכה, אנו זקוקים לתמונות או לקישור לאלבום או למודעה.", "שליחת תמונות", "הכפתור פותח רק את שליחת התמונות, ללא מילוי חוזר של הטופס. כדאי להציג את החלק החיצוני ואת החדרים המרכזיים. אם כבר שלחת תמונות, אין צורך לחזור על הפעולה: הצוות שלנו יעבור עליהן וייצור איתך קשר לגבי הצעדים הבאים.", "הקישור אישי ותקף ל־30 יום. אין לשתף אותו. אם דרושה עזרה, אפשר להשיב לאימייל הזה."],
  ar: ["تلقّينا طلبك", "شكرًا لتعريفنا بمنزلك.", "تم حفظ بيانات الاتصال والمعلومات التي أرسلتها بالفعل. للتعرّف على المنزل والتحضير للتقييم، نحتاج إلى صور أو رابط لألبوم أو إعلان.", "إرسال الصور", "يفتح هذا الزر إرسال الصور فقط، دون إعادة ملء النموذج. أظهر الواجهة والغرف الرئيسية. إذا كنت قد أرسلت الصور بالفعل، فلا حاجة لتكرار ذلك: سيراجعها فريقنا ويتواصل معك بشأن الخطوات التالية.", "الرابط شخصي وصالح لمدة 30 يومًا. لا تشاركه مع الآخرين. إذا احتجت إلى مساعدة، يمكنك الرد على هذا البريد الإلكتروني."],
  zh: ["我们已收到您的申请", "感谢您向我们介绍您的房屋。", "您的联系方式和已提交的信息均已保存。为了了解房屋并准备评估，我们需要照片，或相册、房源页面的链接。", "发送照片", "此按钮仅打开照片上传页面，无需重复填写表格。请展示房屋外观及主要房间。如果您已经发送图片，无需重复操作：我们的团队会查看图片，并联系您说明后续步骤。", "此链接仅供您本人使用，有效期为30天，请勿分享。如需帮助，请回复此邮件。"],
};
const reminderCopy: Record<string, [string, string, string, string, string]> = {
  pt: ["Faltam as fotografias para conhecer a sua casa", "Podemos dar o próximo passo?", "Recebemos o seu pedido. Para conhecermos a casa e prepararmos a avaliação, falta receber fotografias do exterior e das principais divisões, ou um link para um álbum ou anúncio.", "Enviar fotografias", "Os dados que já enviou continuam guardados. Este botão abre apenas o envio das fotografias, sem repetir o formulário. Pode enviar imagens do telemóvel. Se precisar de ajuda ou preferir deixar o pedido para mais tarde, responda a este email."],
  en: ["Photographs will help us understand your home", "Shall we take the next step?", "We have received your enquiry. To understand your home and prepare the assessment, we still need photographs of the exterior and main rooms, or a link to an album or listing.", "Send photographs", "The details you have already sent are saved. This button opens only the photo upload, without repeating the form. Photos from your phone are welcome. If you need help or would prefer to return to this later, reply to this email."],
  fr: ["Des photos pour mieux connaître votre maison", "Passons à la prochaine étape ?", "Nous avons reçu votre demande. Pour connaître votre maison et préparer son évaluation, il nous manque des photos de l’extérieur et des principales pièces, ou un lien vers un album ou une annonce.", "Envoyer des photos", "Les informations déjà envoyées sont enregistrées. Ce bouton ouvre uniquement l’envoi des photos, sans remplir à nouveau le formulaire. Les photos prises avec votre téléphone conviennent. Pour obtenir de l’aide ou reprendre votre demande plus tard, répondez à cet email."],
  de: ["Fotos helfen uns, Ihr Haus kennenzulernen", "Gehen wir den nächsten Schritt?", "Wir haben Ihre Anfrage erhalten. Um Ihr Haus kennenzulernen und die Bewertung vorzubereiten, fehlen uns noch Fotos der Außenansicht und der wichtigsten Räume oder ein Link zu einem Album oder Inserat.", "Fotos senden", "Ihre bisherigen Angaben sind gespeichert. Dieser Button öffnet nur den Foto-Upload, ohne das Formular erneut auszufüllen. Handyfotos sind willkommen. Wenn Sie Hilfe benötigen oder später fortfahren möchten, antworten Sie auf diese E-Mail."],
  nl: ["Foto’s helpen ons uw woning te leren kennen", "Zullen we de volgende stap zetten?", "We hebben uw aanvraag ontvangen. Om uw woning te leren kennen en de beoordeling voor te bereiden, hebben we nog foto’s van de buitenkant en de belangrijkste kamers nodig, of een link naar een album of advertentie.", "Foto’s sturen", "Uw eerder verstuurde gegevens zijn opgeslagen. Deze knop opent alleen het uploaden van foto’s, zonder het formulier te herhalen. Foto’s van uw telefoon zijn welkom. Heeft u hulp nodig of wilt u later verdergaan? Antwoord dan op deze e-mail."],
  es: ["Nos faltan fotografías para conocer su casa", "¿Damos el siguiente paso?", "Hemos recibido su solicitud. Para conocer su casa y preparar la evaluación, necesitamos fotografías del exterior y de las principales estancias, o un enlace a un álbum o anuncio.", "Enviar fotografías", "Los datos que ya ha enviado están guardados. Este botón abre solo el envío de fotografías, sin repetir el formulario. Puede enviar fotos del móvil. Si necesita ayuda o prefiere continuar más adelante, responda a este correo."],
  it: ["Ci mancano le fotografie per conoscere la sua casa", "Facciamo il prossimo passo?", "Abbiamo ricevuto la sua richiesta. Per conoscere la casa e preparare la valutazione, ci servono fotografie degli esterni e degli ambienti principali, oppure un link a un album o annuncio.", "Invia fotografie", "Le informazioni già inviate sono salvate. Questo pulsante apre solo l’invio delle fotografie, senza ripetere il modulo. Vanno bene anche le foto del telefono. Se ha bisogno di aiuto o preferisce proseguire più avanti, risponda a questa email."],
  he: ["נשמח לקבל תמונות כדי להכיר את הבית", "אפשר להתקדם לשלב הבא?", "קיבלנו את פנייתך. כדי להכיר את הבית ולהכין את ההערכה, עדיין דרושות לנו תמונות של החלק החיצוני והחדרים המרכזיים, או קישור לאלבום או למודעה.", "שליחת תמונות", "המידע שכבר שלחת נשמר. הכפתור פותח רק את שליחת התמונות, ללא מילוי חוזר של הטופס. אפשר לשלוח תמונות מהטלפון. אם דרושה עזרה או אם עדיף להמשיך מאוחר יותר, אפשר להשיב לאימייל הזה."],
  ar: ["نحتاج إلى صور للتعرّف على منزلك", "هل ننتقل إلى الخطوة التالية؟", "تلقّينا طلبك. للتعرّف على المنزل والتحضير للتقييم، ما زلنا بحاجة إلى صور للواجهة والغرف الرئيسية، أو رابط لألبوم أو إعلان.", "إرسال الصور", "المعلومات التي أرسلتها محفوظة. يفتح هذا الزر إرسال الصور فقط، دون إعادة ملء النموذج. يمكنك إرسال صور من هاتفك. إذا احتجت إلى مساعدة أو فضّلت المتابعة لاحقًا، يمكنك الرد على هذا البريد الإلكتروني."],
  zh: ["请发送照片，帮助我们了解您的房屋", "我们一起进行下一步吧", "我们已收到您的申请。为了了解房屋并准备评估，我们还需要房屋外观及主要房间的照片，或相册、房源页面的链接。", "发送照片", "您已提交的信息均已保存。此按钮仅打开照片上传页面，无需重复填写表格。您可以发送手机拍摄的照片。如果需要帮助，或希望稍后继续，请回复此邮件。"],
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
export function photoReminderMail(record: V4Record, completionUrl: string): OwnerMail {
  const lang = reminderCopy[record.context.language] ? record.context.language : "en";
  const c = reminderCopy[lang];
  const text = `${record.contact.name},\n\n${c[1]}\n${c[2]}\n\n${c[3]}: ${completionUrl}\n\n${c[4]}\n\nPortugal Active\n${record.id}`;
  return { from: OWNER_V4_FROM, to: record.contact.email, replyTo: OWNER_SALES_EMAIL,
    subject: `Portugal Active · ${c[0]}`, text,
    html: shell(c[0], `<p style="margin-top:0">${e(record.contact.name)},</p><h1 style="font-size:27px;line-height:1.25">${e(c[1])}</h1><p>${e(c[2])}</p><p style="margin:26px 0"><a href="${e(completionUrl)}" style="display:inline-block;padding:13px 20px;background:#304838;color:#fff;text-decoration:none;border-radius:5px;font-weight:bold">${e(c[3])}</a></p><p>${e(c[4])}</p><p style="font-size:11px;color:#676d62">${e(record.id)}</p>`, lang) };
}
type MailFile = { name: string; mimeType: string };
export type ManagementNotice = "captured" | "qualification" | "updated" | "photos" | "documents" | "removed";
const noticeTitles: Record<ManagementNotice, string> = {
  captured: "Novo contacto de proprietário", qualification: "Informação da casa recebida", updated: "Informação atualizada",
  photos: "Fotografias recebidas", documents: "Documentos recebidos", removed: "Material retirado pelo proprietário",
};
const present = (value: string | undefined) => value?.trim() || "Por preencher";
const yesNo = (value: string | undefined) => value === "yes" ? "Sim" : value === "no" ? "Não" : "Por preencher";
function managementMail(record: V4Record, files: MailFile[], reason: ManagementNotice): OwnerMail {
  const p = record.contact, d = record.details || {}, source = attribution(record);
  const hasImages = !!d.photosLink || files.some(f => f.mimeType.startsWith("image/"));
  const partial = record.status === "awaiting_details";
  const state = partial ? hasImages ? "Imagens recebidas · informação da casa por completar" : "Contacto recebido · informação da casa por completar"
    : hasImages ? "Dados e imagens recebidos · confirmar suficiência antes de avaliar" : "Aguarda fotografias · avaliação por iniciar";
  const next = reason === "captured"
    ? "O proprietário pode ainda estar a preencher a informação da casa. Consultar a mensagem mais recente com esta referência e contactar se o pedido continuar incompleto."
    : partial
    ? `${hasImages ? "Rever as imagens e contactar" : "Contactar"} o proprietário para completar a informação em falta.${hasImages ? " Confirmar também se as imagens são suficientes." : " Pedir fotografias se ainda não tiverem sido enviadas."}`
    : hasImages ? "Abrir o link e os anexos, confirmar se mostram a casa suficientemente e contactar o proprietário para preparar a avaliação."
    : "Contactar o proprietário para pedir fotografias úteis ou um link acessível. A avaliação depende dessas imagens.";
  const title = noticeTitles[reason];
  const savedAt = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "short", timeStyle: "short" }).format(record.updatedAt);
  const versionNote = `Versão do pedido ${record.revision} · Dados guardados em ${savedAt} (Lisboa). Em caso de avisos fora de ordem, use a versão mais alta.`;
  const threadNote = reason === "captured" ? "Novo pedido. As atualizações seguintes mantêm esta referência."
    : "Este email atualiza o mesmo pedido. Verifique se existe uma mensagem mais recente com esta referência antes de contactar.";
  const propertyRows: [string, string][] = [["Tipo de imóvel", labels[p.type] || p.type], ["Localidade", p.locality], ["Morada", present(d.address)],
    ["Código postal", present(d.postalCode)], ["Quartos", present(d.bedrooms)], ["Descrição", present(d.description)]];
  const goalRows: [string, string][] = [["Já operou para turismo?", yesNo(d.operatedBefore)],
    ["Licença de exploração", d.licenseStatus ? ({ yes: "Sim", pending: "Em processo", no: "Não", unknown: "Não sabe / por confirmar" })[d.licenseStatus] : "Por preencher"],
    ...(d.licenseNumber ? [["Número de licença", d.licenseNumber] as [string, string]] : []), ["Vive alguém na casa?", yesNo(d.occupied)],
    ...(d.occupiedDetails ? [["Ocupação — detalhes", d.occupiedDetails] as [string, string]] : []), ["À venda?", yesNo(d.forSale)],
    ["Interesse em vender com a PA", d.saleInterest === "maybe" ? "Talvez" : yesNo(d.saleInterest)],
    ["Entrada no mercado", d.launchTimeline ? OWNER_TIMELINE_LABELS[d.launchTimeline] : "Por preencher"],
    ["Expectativa líquida anual do proprietário", d.incomeExpectation ? OWNER_INCOME_LABELS[d.incomeExpectation] : "Por preencher"]];
  const missing = partial ? [...propertyRows, ...goalRows].filter(([, value]) => value === "Por preencher").map(([label]) => label) : [];
  const shownProperty = partial ? propertyRows.filter(([, value]) => value !== "Por preencher") : propertyRows;
  const shownGoals = partial ? goalRows.filter(([, value]) => value !== "Por preencher") : goalRows;
  const incomeNote = d.incomeExpectation ? "Rendimento líquido anual esperado pelo proprietário, após custos. Expectativa declarada, sem previsão ou garantia da Portugal Active." : "";
  const section = (heading: string, values: [string, string][]) => !values.length ? "" : `<h2 style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#8b7355;margin:26px 0 10px">${e(heading)}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${values.map(([label, value]) => `<tr><td style="padding:9px 0;border-bottom:1px solid #e6e7df;vertical-align:top;width:42%;font-size:12px;color:#676d62">${e(label)}</td><td style="padding:9px 0 9px 12px;border-bottom:1px solid #e6e7df;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere">${e(value)}</td></tr>`).join("")}</table>`;
  const fileNames = files.map(f => f.name);
  const fileText = fileNames.length ? fileNames.join(", ") : "Sem ficheiros anexados";
  const phoneHref = p.phone.replace(/[^+0-9]/g, "");
  const reference = record.id.slice(0, 8).toUpperCase();
  const text = [`PORTUGAL ACTIVE · EQUIPA COMERCIAL`, title, `Pedido PA-${reference} · Referência completa: ${record.id}`, `Estado: ${state}`, `Próxima ação: ${next}`,
    threadNote, versionNote,
    `Nome: ${p.name}`, `Email: ${p.email}`, `Telefone: ${p.phone}`, "Responder a este email contacta diretamente o proprietário.",
    ...shownProperty.map(([label, value]) => `${label}: ${value}`), ...shownGoals.map(([label, value]) => `${label}: ${value}`),
    ...(missing.length ? [`Informação em falta: ${missing.join(" · ")}`] : []), ...(incomeNote ? [incomeNote] : []),
    `Link de fotografias: ${d.photosLink || "Não fornecido"}`, `Anexos: ${fileText}`,
    !hasImages ? "Fotografias em falta. Um PDF ou documento, por si só, não confirma imagens úteis da casa." : "As imagens e os links ainda precisam de revisão pela equipa; a receção não confirma qualidade ou suficiência.",
    `Idioma: ${record.context.language}`, `Página: ${record.context.page_path}`, `Botão: ${record.context.placement}`,
    ...(source ? [`Campanha: ${source}`] : []), "Privacidade aceite para tratar este pedido. Sem subscrição de marketing."].join("\n");
  const html = shell(title, `<p style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8b7355;margin:0">Pedido PA-${e(reference)}</p><h1 style="font-size:27px;line-height:1.25;margin:10px 0 20px">${e(title)}</h1>
    <div style="background:#e9efe7;border-left:4px solid #304838;padding:16px"><p style="margin:0 0 10px"><strong>Estado</strong><br>${e(state)}</p><p style="margin:0"><strong>Próxima ação</strong><br>${e(next)}</p></div>
    <p style="font-size:12px;color:#676d62">${e(threadNote)}<br>${e(versionNote)}</p>
    <h2 style="font-size:20px;margin:24px 0 6px">${e(p.name)}</h2><p style="margin:0 0 12px"><a href="mailto:${e(p.email)}" style="color:#304838">${e(p.email)}</a><br><a href="tel:${e(phoneHref)}" style="color:#304838">${e(p.phone)}</a></p>
    <p style="font-size:12px;color:#676d62">Responder a este email contacta diretamente o proprietário.</p>${section("A propriedade", shownProperty)}${section("Situação e objetivos", shownGoals)}
    ${missing.length ? `<p style="font-size:12px;color:#676d62"><strong>Informação em falta</strong><br>${e(missing.join(" · "))}</p>` : ""}
    ${incomeNote ? `<p style="font-size:11px;color:#676d62">${e(incomeNote)}</p>` : ""}
    <h2 style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#8b7355;margin:26px 0 10px">Fotografias e documentos</h2>
    ${d.photosLink ? `<p><a href="${e(d.photosLink)}" style="display:inline-block;padding:11px 18px;background:#304838;color:#fff;text-decoration:none;border-radius:5px;font-weight:bold">Abrir fotografias</a></p><p style="font-size:12px;overflow-wrap:anywhere">${e(d.photosLink)}</p>` : '<p style="font-size:13px">Sem link de fotografias.</p>'}
    ${fileNames.length ? `<ul style="padding-left:20px;font-size:13px;overflow-wrap:anywhere">${fileNames.map(name => `<li>${e(name)}</li>`).join("")}</ul><p style="font-size:12px;color:#676d62">Os ficheiros seguem como anexos deste email.</p>` : '<p style="font-size:12px;color:#676d62">Sem ficheiros anexados.</p>'}
    <p style="font-size:12px;color:#676d62">${hasImages ? "As imagens e os links ainda precisam de revisão pela equipa; a receção não confirma qualidade ou suficiência." : "Fotografias em falta. Um PDF ou documento, por si só, não confirma imagens úteis da casa."}</p>
    <div style="border-top:1px solid #e6e7df;margin-top:24px;padding-top:16px;font-size:11px;color:#676d62;overflow-wrap:anywhere">Idioma: ${e(record.context.language)} · Página: ${e(record.context.page_path)} · Botão: ${e(record.context.placement)}${source ? `<br>Campanha: ${e(source)}` : ""}<br>Privacidade aceite para tratar este pedido. Sem subscrição de marketing.<br>Referência completa: ${e(record.id)}</div>`);
  return { from: OWNER_V4_FROM, to: OWNER_SALES_EMAIL, replyTo: p.email,
    subject: `[PA Gestão ${reference}] ${p.locality.slice(0, 60)} · ${p.name.slice(0, 70)}`, text, html };
}
export function managementStartMail(record: V4Record): OwnerMail { return managementMail(record, [], "captured"); }
export function managementCompletedMail(record: V4Record, files: MailFile[]): OwnerMail {
  return managementMail(record, files, record.completionCount <= 1 ? "qualification" : "updated");
}
export function managementMediaMail(record: V4Record, files: MailFile[], reason: "photos" | "documents" | "updated" | "removed"): OwnerMail {
  return managementMail(record, files, reason);
}

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
