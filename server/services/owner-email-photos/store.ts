import { createHash, randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db";
import { isOwnerIntakeProduction } from "../owner-intake/email";
import { ownerCrmConfig } from "../owner-crm/service";
import { metadataSchema, type InboundPhotoMetadata } from "./protocol";
import { extractReplySignals, normalizeMessageId, resolveReplyTarget, type ReplyCandidate } from "./matching";
import { classifyAttachment, classifyInboundMessage } from "./attachments";
import { OWNER_EMAIL_SCHEMA } from "./schema";

export class OwnerEmailError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
type Executor = { execute(query: SQL): Promise<unknown> };
const rows = <T = any>(value: unknown) => (value as [T[], unknown])[0];
const obj = (value: any): any => typeof value === "string" ? JSON.parse(value) : value || {};
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const escape = (value: string) => value.replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x]!);
const norm = (value: string) => value.trim().toLowerCase();
const safeSubject = (value: string) => value.replace(/https?:\/\/[^\s<>"']*#token=[^\s<>"']+/gi, "[ligação privada removida]")
  .replace(/(?:#|&#(?:35|x23);|%23)?token=[A-Za-z0-9_-]{43}/gi, "[ligação privada removida]").slice(0, 500);
const inList = (values: string[]) => sql.join(values.map(value => sql`${value}`), sql`, `);
export function emailPhotosEnabled() { return isOwnerIntakeProduction() && process.env.OWNER_EMAIL_PHOTOS_ENABLED === "true"; }
async function database() {
  if (!isOwnerIntakeProduction()) throw new OwnerEmailError("PRODUCTION_REQUIRED");
  const db = await getDb(); if (!db) throw new OwnerEmailError("EMAIL_IMPORT_STORAGE_UNAVAILABLE"); return db;
}
export async function initialiseOwnerEmailSchema() {
  const db = await database(); for (const query of OWNER_EMAIL_SCHEMA) await db.execute(sql.raw(query));
}
function preservedReferences(value: any) {
  return { id: String(value.id), email: norm(String(value.email || "")), requestIds: [String(value.id)], tokenHashes: value.tokenHash ? [String(value.tokenHash)] : [] };
}
async function candidates(db: Executor, message: InboundPhotoMetadata): Promise<ReplyCandidate[]> {
  const senders = [...new Set([message.from, message.originalSender].filter(Boolean).map(x => norm(x!)))];
  const emails = inList(senders), signals = extractReplySignals(message);
  // Fetch evidence across owners too: otherwise A's email + B's quoted request can silently choose A.
  const uuidV4 = signals.requestIds.length ? sql`e.id IN (${inList(signals.requestIds)}) OR h.originalSourceKey IN (${inList(signals.requestIds.map(id => `v3:${id}`))})` : sql`FALSE`;
  const uuidV3 = signals.requestIds.length ? sql`e.id IN (${inList(signals.requestIds)})` : sql`FALSE`;
  const tokens = signals.tokenHashes.length ? sql`e.tokenHash IN (${inList(signals.tokenHashes)})` : sql`FALSE`;
  const rfc = signals.rfcMessageIds.length ? sql`EXISTS (SELECT 1 FROM owner_v4_outbox o INNER JOIN owner_email_outbound_ids r ON r.providerId=o.providerId
    WHERE o.enquiryId=e.id AND o.kind IN ('welcome','photo_reminder','historical_photos') AND r.messageIdHash IN (${inList(signals.rfcMessageIds.flatMap(id => [hash(id), hash(`<${id}>`)]))}))` : sql`FALSE`;
  const v4 = rows(await db.execute(sql`SELECT e.id,e.tokenHash,e.contact,l.sourceKey,l.personId,l.dealId,h.originalSourceKey
    FROM owner_v4_enquiries e JOIN owner_crm_links l ON l.sourceKey=CONCAT('v4:',e.id)
    LEFT JOIN owner_crm_photo_requests h ON h.enquiryId=e.id
    WHERE (LOWER(JSON_UNQUOTE(JSON_EXTRACT(e.contact,'$.email'))) IN (${emails}) OR ${uuidV4} OR ${tokens} OR ${rfc})
      AND l.personId IS NOT NULL AND l.dealId IS NOT NULL ORDER BY e.id LIMIT 101`));
  const v3 = rows(await db.execute(sql`SELECT e.id,e.payload,l.sourceKey,l.personId,l.dealId FROM owner_enquiries e
    JOIN owner_crm_links l ON l.sourceKey=CONCAT('v3:',e.id)
    WHERE (LOWER(JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.email'))) IN (${emails}) OR ${uuidV3}) AND l.personId IS NOT NULL AND l.dealId IS NOT NULL
    AND NOT EXISTS (SELECT h.dealId FROM owner_crm_photo_requests h INNER JOIN owner_v4_enquiries c ON c.id=h.enquiryId
      INNER JOIN owner_crm_links b ON b.sourceKey=CONCAT('v4:',c.id) AND b.dealId>0 AND b.personId>0 WHERE h.originalSourceKey=l.sourceKey)
    ORDER BY e.id LIMIT 101`));
  if (v4.length + v3.length > 100) throw new OwnerEmailError("TOO_MANY_OWNER_REQUESTS", 409);
  const found: ReplyCandidate[] = [];
  for (const row of [...v4, ...v3]) {
    const contact = obj(row.contact || row.payload), ref = preservedReferences({ ...row, email: contact.email });
    if (row.originalSourceKey) ref.requestIds.push(row.originalSourceKey.slice(3));
    const outbound = row.sourceKey.startsWith("v4:") ? rows<{ messageId: string }>(await db.execute(sql`SELECT h.messageId FROM owner_email_outbound_ids h
      JOIN owner_v4_outbox o ON o.providerId=h.providerId WHERE o.enquiryId=${row.id} AND o.kind IN ('welcome','photo_reminder','historical_photos') LIMIT 30`)) : [];
    found.push({ sourceKey: row.sourceKey, enquiryId: row.id, email: ref.email, personId: Number(row.personId), dealId: Number(row.dealId),
      requestIds: ref.requestIds, tokenHashes: ref.tokenHashes, outboundMessageIds: outbound.map(x => x.messageId), status: "open", archived: false,
      synthetic: /PA[-_ ]?QA|N[ÃA]O[-_ ]?CONTACTAR|E2E[-_ ]?TEST|\bsynthetic\b|\bsint[eé]tic[oa]\b/i.test(contact.name || "") });
  }
  return found;
}
/** Recheck current CRM ownership, without creating or editing anything remotely. */
async function verifyRemoteTarget(candidate: ReplyCandidate) {
  const config = ownerCrmConfig(); if (!config) throw new OwnerEmailError("CRM_NOT_CONFIGURED");
  const get = async (path: string) => {
    const response = await fetch(`https://portugalactive.pipedrive.com/api/${path}`, { headers: { "x-api-token": config.token }, redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new OwnerEmailError("CRM_READ_UNAVAILABLE");
    const result = await response.json(); if (!result.success) throw new OwnerEmailError("CRM_READ_UNAVAILABLE"); return result.data;
  };
  const [deal, person] = await Promise.all([get(`v2/deals/${candidate.dealId}`), get(`v1/persons/${candidate.personId}`)]);
  if (!deal || !person || deal.is_deleted || person.is_deleted || deal.is_archived || deal.status !== "open") return "CRM_OPPORTUNITY_NOT_OPEN";
  if (Number(deal.person_id?.value || deal.person_id) !== candidate.personId) return "CRM_OWNER_CHANGED";
  if (!(person.email || []).some((value: any) => norm(typeof value === "string" ? value : value.value || "") === candidate.email)) return "CRM_CONTACT_CHANGED";
  return null;
}
type Descriptor = InboundPhotoMetadata["attachments"][number];
const fileTypes = new Set(["image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence", "application/pdf", "application/octet-stream", "binary/octet-stream", ""]);
/** Metadata filter only; the actual content is independently validated on upload. */
function selectDescriptors(input: InboundPhotoMetadata) {
  const eligible = input.attachments.filter(x => !x.quoted
    && !(/(?:^|[\s_.-])(?:logo|signature|assinatura|facebook|instagram|linkedin|twitter|whatsapp|icon)(?:[\s_.-]|$)/i.test(x.name) && (x.disposition === "inline" || x.size < 100 * 1024))
    && !(x.disposition === "inline" && x.size < 20 * 1024) && fileTypes.has(x.mimeType.toLowerCase()))
    .map(({ contentId: _contentId, ...file }) => ({ ...file, name: safeSubject(file.name).slice(0, 180) }));
  return { eligible, policy: classifyInboundMessage({ attachments: eligible }), mayHavePhotos: eligible.some(x => x.mimeType !== "application/pdf") };
}
async function queueReview(tx: Executor, messageKey: string, message: Pick<InboundPhotoMetadata, "from" | "subject" | "receivedAt">, reason: string, now: Date) {
  const id = `${messageKey}:email-review`, enquiryId = randomUUID();
  const reasons: Record<string, string> = {
    SENDER_REQUEST_MISMATCH: "O endereço de quem respondeu é diferente do contacto associado ao pedido.",
    SENDER_NOT_VERIFIED: "Não foi possível confirmar a identidade do remetente desta resposta.",
    ORIGINAL_SENDER_NOT_VERIFIED: "A resposta foi encaminhada e falta confirmar o remetente original.",
    CONFLICTING_REQUEST_REFERENCES: "A resposta contém referências a mais de uma propriedade.",
    REQUEST_REFERENCE_MISSING: "A resposta não inclui uma referência que permita identificar a propriedade com segurança.",
    CRM_OPPORTUNITY_NOT_OPEN: "O negócio associado já não está aberto no Pipedrive.",
    CRM_OWNER_CHANGED: "O contacto associado ao negócio foi alterado no Pipedrive.",
    CRM_CONTACT_CHANGED: "O email do proprietário foi alterado no Pipedrive.",
    SOURCE_OWNER_CHANGED: "O contacto do pedido foi alterado depois de esta resposta ter sido recebida.",
    CRM_BINDING_CHANGED: "A associação entre o pedido e o negócio foi alterada. É necessário confirmar o destino das fotografias.",
    SOURCE_CANONICAL_CHANGED: "Este pedido passou a ser acompanhado através de outro registo. É necessário confirmar o destino das fotografias.",
    UNSUPPORTED_OR_INVALID_FILE: "Um dos anexos tem um formato não reconhecido ou está incompleto.",
    MIME_CONTENT_MISMATCH: "O conteúdo de um anexo não corresponde ao formato indicado pelo email.",
    ATTACHMENT_SIZE_MISMATCH: "Um dos anexos chegou incompleto ou com um tamanho diferente do indicado pelo email.",
    INVALID_IMAGE_DIMENSIONS: "Um dos anexos não tem dimensões de imagem válidas.",
    FILE_TOO_LARGE: "Um dos anexos ultrapassa o limite de 15 MB por ficheiro.",
    MESSAGE_TOO_LARGE: "Os anexos ultrapassam o limite de 75 MB por resposta.",
    TOO_MANY_ATTACHMENTS: "A resposta contém mais de 30 anexos.",
  };
  const explanation = reasons[reason] || "A associação automática ficou em pausa e precisa de confirmação pela equipa.";
  const text = `PORTUGAL ACTIVE · MANAGEMENT\nFotografias por associar\n\nRecebemos uma resposta com anexos que precisa da sua atenção.\n\nRemetente: ${message.from}\nAssunto original: ${message.subject}\nRecebida em: ${message.receivedAt}\n\nO que precisa de confirmação\n${explanation}\n\nPróximo passo\nAbra a resposta original na caixa management@, confirme a propriedade e coloque as fotografias no negócio correto do Pipedrive.\n\nReferência para apoio: ${messageKey.slice(0, 12)}`;
  const mail = { from: "Portugal Active · Management <management@portugalactive.com>", to: "management@portugalactive.com", replyTo: "management@portugalactive.com",
    subject: `[PA Gestão] Fotografias por associar · ${messageKey.slice(0, 8).toUpperCase()}`, text,
    html: `<html lang="pt"><body style="font:15px Arial;color:#252d27"><img src="https://www.portugalactive.com/brand/pa-logo-dark.png" width="150" alt="Portugal Active"><h1>Fotografias por associar</h1><p style="white-space:pre-wrap">${escape(text)}</p></body></html>` };
  await tx.execute(sql`INSERT IGNORE INTO owner_v4_outbox (id,enquiryId,kind,payload,attachmentBytes,createdAt)
    VALUES (${id},${enquiryId},'email_review',${JSON.stringify({ mail, fileIds: [] })},0,${now})`);
}
async function responseFor(db: Executor, message: any) {
  const descriptors = obj(message.descriptors) as Descriptor[];
  const present = rows<{ attachmentId: string }>(await db.execute(sql`SELECT attachmentId FROM owner_email_files WHERE messageKey=${message.messageKey}`));
  return { state: message.status === "ready" ? "complete" : message.status === "receiving" ? "accepted" : message.status,
    messageKey: message.messageKey, missingAttachmentIds: message.status === "receiving" ? descriptors.filter(x => !present.some(f => f.attachmentId === x.id)).map(x => x.id) : [] };
}
export async function acceptOwnerEmail(raw: unknown, now = new Date()) {
  const parsed = metadataSchema.safeParse(raw); if (!parsed.success) throw new OwnerEmailError("INVALID_MESSAGE_METADATA", 400);
  if (+new Date(parsed.data.receivedAt) > +now + 5 * 60_000) throw new OwnerEmailError("INVALID_MESSAGE_TIME", 400);
  const message = parsed.data; const db = await database();
  const messageKey = hash(`${message.mailbox}\n${message.providerId}`), fingerprint = hash(JSON.stringify(message));
  const existing = rows(await db.execute(sql`SELECT * FROM owner_email_messages WHERE messageKey=${messageKey} LIMIT 1`))[0];
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new OwnerEmailError("MESSAGE_CONTENT_CONFLICT", 409);
    return responseFor(db, existing);
  }
  const selected = selectDescriptors(message);
  let state = "ignored", reason: string | null = "NO_ELIGIBLE_ATTACHMENTS", target: ReplyCandidate | undefined;
  if (selected.policy.decision !== "ignored") {
    let found: ReplyCandidate[] = [];
    try { found = await candidates(db, message); }
    catch (error) {
      if (!(error instanceof OwnerEmailError) || error.code !== "TOO_MANY_OWNER_REQUESTS") throw error;
      state = "review"; reason = error.code;
    }
    if (state !== "review") {
      const match = resolveReplyTarget(message, found, { allowedTestEnquiryIds: (process.env.OWNER_AUTOMATION_TEST_IDS || "").split(",").map(x => x.trim()).filter(Boolean) });
      state = match.decision === "matched" ? "receiving" : match.decision;
      reason = match.decision === "matched" ? null : match.code;
      // The welcome can arrive before its CRM binding or RFC webhook. Core durably retries this short race.
      if (reason === "REQUEST_REFERENCE_MISSING" && +now - +new Date(message.receivedAt) < 15 * 60_000)
        throw new OwnerEmailError("CORRELATION_PENDING", 503);
      if (match.decision === "matched") target = found.find(c => c.sourceKey === match.sourceKey);
      if (state === "receiving" && selected.policy.decision === "review") { state = "review"; reason = selected.policy.code; }
      if (state === "receiving" && target) {
        const changed = await verifyRemoteTarget(target);
        if (changed) { state = "review"; reason = changed; }
      }
    }
    // Ordinary replies/documents without photographs must not flood Management with review notices.
    if (state === "review" && !selected.mayHavePhotos) { state = "ignored"; reason = "NO_PHOTOGRAPHIC_ATTACHMENTS"; }
  }
  const subject = safeSubject(message.subject);
  await db.transaction(async tx => {
    await tx.execute(sql`INSERT IGNORE INTO owner_email_messages
      (messageKey,mailbox,providerId,threadId,messageId,fingerprint,sourceKey,dealId,personId,senderEmail,subject,descriptors,status,reason,receivedAt,createdAt,updatedAt)
      VALUES (${messageKey},${message.mailbox},${message.providerId},${message.threadId},${message.messageId ? normalizeMessageId(message.messageId) : null},${fingerprint},
      ${target?.sourceKey || null},${target?.dealId || null},${target?.personId || null},${target?.email || message.from},${subject},
      ${JSON.stringify(selected.eligible)},${state},${reason},${new Date(message.receivedAt)},${now},${now})`);
    const saved = rows(await tx.execute(sql`SELECT * FROM owner_email_messages WHERE messageKey=${messageKey} FOR UPDATE`))[0];
    if (saved.fingerprint !== fingerprint) throw new OwnerEmailError("MESSAGE_CONTENT_CONFLICT", 409);
    if (saved.status === "review" && selected.mayHavePhotos) await queueReview(tx, messageKey, { ...message, subject }, saved.reason || "ASSOCIATION_REVIEW", now);
  });
  return responseFor(db, rows(await db.execute(sql`SELECT * FROM owner_email_messages WHERE messageKey=${messageKey} LIMIT 1`))[0]);
}
function reviewMetadata(message: any) {
  return { from: String(message.senderEmail), subject: safeSubject(String(message.subject)), receivedAt: new Date(message.receivedAt).toISOString() };
}
async function holdMessage(tx: Executor, message: any, reason: string, now: Date, notify: boolean) {
  await tx.execute(sql`UPDATE owner_email_messages SET status='review',reason=${reason},updatedAt=${now} WHERE messageKey=${message.messageKey}`);
  // Original attachments stay in Gmail; uncertain associations retain no temporary copies.
  await tx.execute(sql`UPDATE owner_email_files SET active=0,content=NULL WHERE messageKey=${message.messageKey}`);
  if (notify) await queueReview(tx, message.messageKey, reviewMetadata(message), reason, now);
}
export async function putOwnerEmailFile(messageKey: string, attachmentId: string, content: Buffer, now = new Date()) {
  const db = await database(), digest = hash(content);
  return db.transaction(async tx => {
    // PUT never locks an enquiry; finalisation takes enquiry -> CRM binding -> message.
    const message = rows(await tx.execute(sql`SELECT * FROM owner_email_messages WHERE messageKey=${messageKey} FOR UPDATE`))[0];
    if (!message) throw new OwnerEmailError("MESSAGE_NOT_FOUND", 404);
    const descriptor = (obj(message.descriptors) as Descriptor[]).find(x => x.id === attachmentId);
    if (!descriptor) throw new OwnerEmailError("ATTACHMENT_NOT_REQUESTED", 409);
    const prior = rows(await tx.execute(sql`SELECT digest,outcome FROM owner_email_files WHERE messageKey=${messageKey} AND attachmentId=${attachmentId} LIMIT 1`))[0];
    if (prior && prior.digest !== digest) throw new OwnerEmailError("ATTACHMENT_CONTENT_CONFLICT", 409);
    if (message.status !== "receiving") return { success: true, duplicate: !!prior, state: message.status === "ready" ? "complete" : message.status };
    if (prior) return { success: true, duplicate: true, state: prior.outcome === "ignored" ? "ignored" : "accepted" };
    const classification = classifyAttachment(descriptor, content), accepted = classification.kind === "photo" || classification.kind === "document";
    const outcome = accepted ? "accepted" : classification.kind;
    const name = accepted ? classification.name : "anexo-nao-importado", mimeType = accepted ? classification.mimeType : "application/octet-stream";
    const reason = "code" in classification ? classification.code : null;
    await tx.execute(sql`INSERT INTO owner_email_files (id,messageKey,attachmentId,name,mimeType,size,digest,content,active,outcome,reason,createdAt)
      VALUES (${randomUUID()},${messageKey},${attachmentId},${name},${mimeType},${content.length},${digest},${accepted ? content : null},${accepted ? 1 : 0},${outcome},${reason},${now})`);
    if (classification.kind === "review") await holdMessage(tx, message, classification.code, now, descriptor.mimeType !== "application/pdf");
    else await tx.execute(sql`UPDATE owner_email_messages SET updatedAt=${now} WHERE messageKey=${messageKey}`);
    return { success: true, duplicate: false, state: outcome };
  });
}
export async function completeOwnerEmail(messageKey: string, now = new Date()) {
  const db = await database(), original = rows(await db.execute(sql`SELECT * FROM owner_email_messages WHERE messageKey=${messageKey} LIMIT 1`))[0];
  if (!original) throw new OwnerEmailError("MESSAGE_NOT_FOUND", 404);
  if (original.status !== "receiving") return responseFor(db, original);
  return db.transaction(async tx => {
    // This order matches form mutations and reminder preparation; files become visible atomically.
    const sourceKey = String(original.sourceKey), id = sourceKey.slice(3);
    const request = rows(await tx.execute(sourceKey.startsWith("v4:") ? sql`SELECT * FROM owner_v4_enquiries WHERE id=${id} FOR UPDATE`
      : sql`SELECT * FROM owner_enquiries WHERE id=${id} FOR UPDATE`))[0];
    const binding = rows(await tx.execute(sql`SELECT personId,dealId FROM owner_crm_links WHERE sourceKey=${sourceKey} FOR UPDATE`))[0];
    const message = rows(await tx.execute(sql`SELECT * FROM owner_email_messages WHERE messageKey=${messageKey} FOR UPDATE`))[0];
    if (message.status !== "receiving") return responseFor(tx, message);
    const files = rows(await tx.execute(sql`SELECT attachmentId,mimeType,active,outcome FROM owner_email_files WHERE messageKey=${messageKey}`));
    if (!(obj(message.descriptors) as Descriptor[]).every(x => files.some(f => f.attachmentId === x.id))) throw new OwnerEmailError("ATTACHMENTS_PENDING", 409);
    const imported = files.filter(f => f.active && f.outcome === "accepted"), hasPhotos = imported.some(f => f.mimeType.startsWith("image/"));
    if (!imported.length) {
      await tx.execute(sql`UPDATE owner_email_messages SET status='ignored',reason='NO_ELIGIBLE_ATTACHMENTS',updatedAt=${now} WHERE messageKey=${messageKey}`);
      return { state: "ignored", messageKey, missingAttachmentIds: [] };
    }
    let changed: string | null = null;
    const email = request ? norm(String(obj(request.contact || request.payload).email || "")) : "";
    if (!request) changed = "SOURCE_REQUEST_MISSING";
    else if (!binding || Number(binding.personId) !== Number(message.personId) || Number(binding.dealId) !== Number(message.dealId)) changed = "CRM_BINDING_CHANGED";
    else if (email !== norm(message.senderEmail)) changed = "SOURCE_OWNER_CHANGED";
    if (!changed && sourceKey.startsWith("v3:")) {
      const redirected = rows(await tx.execute(sql`SELECT h.enquiryId FROM owner_crm_photo_requests h INNER JOIN owner_crm_links l
        ON l.sourceKey=CONCAT('v4:',h.enquiryId) AND l.personId>0 AND l.dealId>0 WHERE h.originalSourceKey=${sourceKey} LIMIT 1`));
      if (redirected.length) changed = "SOURCE_CANONICAL_CHANGED";
    }
    if (!changed) changed = await verifyRemoteTarget({ sourceKey, enquiryId: id, email, personId: Number(message.personId), dealId: Number(message.dealId),
      requestIds: [id], tokenHashes: [], outboundMessageIds: [], status: "open", archived: false });
    if (changed) {
      await holdMessage(tx, message, changed, now, hasPhotos);
      return { state: "review", messageKey, missingAttachmentIds: [] };
    }
    await tx.execute(sql`UPDATE owner_email_messages SET status='ready',updatedAt=${now} WHERE messageKey=${messageKey}`);
    if (sourceKey.startsWith("v4:")) {
      const status = request.qualificationCompletedAt && hasPhotos ? "complete" : request.status;
      await tx.execute(sql`UPDATE owner_v4_enquiries SET updatedAt=${now},revision=revision+1,status=${status},
        mediaReceivedAt=CASE WHEN ${hasPhotos} THEN COALESCE(mediaReceivedAt,${now}) ELSE mediaReceivedAt END WHERE id=${id}`);
      if (hasPhotos) await tx.execute(sql`UPDATE owner_v4_outbox SET status='cancelled',lastError='REMINDER_NO_LONGER_NEEDED',leaseAt=NULL,nextAttemptAt=NULL
        WHERE enquiryId=${id} AND kind IN ('photo_reminder','historical_photos') AND status IN ('pending','failed')`);
    } else await tx.execute(sql`UPDATE owner_enquiries SET updatedAt=${now} WHERE id=${id}`);
    return { state: "complete", messageKey, missingAttachmentIds: [] };
  });
}
export async function recordOwnerEmailPoll(now = new Date()) {
  const db = await database(); await db.execute(sql`INSERT INTO owner_email_state (id,lastPollAt,updatedAt) VALUES ('gmail',${now},${now})
    ON DUPLICATE KEY UPDATE lastPollAt=VALUES(lastPollAt),updatedAt=VALUES(updatedAt)`);
}
export async function ownerEmailHealth(now = new Date()) {
  const enabled = emailPhotosEnabled(); if (!enabled) return { enabled, configured: false, attentionRequired: false };
  try {
    const db = await database();
    const configured = /^[a-f0-9]{64}$/i.test(process.env.OWNER_EMAIL_INGEST_SECRET || "");
    const last = rows(await db.execute(sql`SELECT lastPollAt FROM owner_email_state WHERE id='gmail' LIMIT 1`))[0];
    const outstanding = rows(await db.execute(sql`SELECT messageKey FROM owner_email_messages WHERE status='review'
      OR (status='receiving' AND updatedAt < ${new Date(+now - 20 * 60_000)}) LIMIT 1`)).length > 0;
    const stale = !last?.lastPollAt || +new Date(last.lastPollAt) < +now - 15 * 60_000;
    return { enabled, configured, attentionRequired: !configured || outstanding || stale, pollCurrent: !stale };
  } catch { return { enabled, configured: false, attentionRequired: true, pollCurrent: false }; }
}
