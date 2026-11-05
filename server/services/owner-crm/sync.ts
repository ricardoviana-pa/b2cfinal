import { createHash } from "node:crypto";
import { OWNER_INCOME_LABELS, OWNER_TIMELINE_LABELS } from "../../../shared/owner-intake";
import { CrmError, type CrmEnquiry, type CrmFile, type CrmGateway, type CrmLedger } from "./types";
import { desiredPropertyFields, emptyFieldState, PROPERTY_FIELDS_VERSION, syncPropertyFields } from "./fields";

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const enquiryMarker = (e: CrmEnquiry) => `PA-OWNER-${e.source}-${e.id}`;
export const operationPrefix = (e: CrmEnquiry) => `enquiry:${e.sourceKey}`;
export function automationEligible(e: Pick<CrmEnquiry, "id" | "name" | "email" | "capturedAt" | "hasReadyEmailEvidence">, env: NodeJS.ProcessEnv = process.env) {
  const from = new Date(env.OWNER_AUTOMATION_FROM || "2026-11-03T00:00:00Z");
  if (!Number.isFinite(+from) || (e.capturedAt < from && e.hasReadyEmailEvidence !== true)) return false;
  const tests = new Set((env.OWNER_AUTOMATION_TEST_IDS || "").split(",").map(v => v.trim()).filter(Boolean));
  if (tests.has(e.id)) return true;
  // Deliberate QA identities only; do not filter people merely named Testa, etc.
  return !/PA[- _]?QA|N[ÃA]O[- _]?CONTACTAR|E2E[- _]?TEST|\bsynthetic\b|\bsint[eé]tic[oa]\b/i.test(e.name)
    && !/@(?:example\.(?:com|org|net|invalid|test)|test\.invalid)$/i.test(e.email);
}
export function snapshotHash(e: CrmEnquiry) {
  return hash(JSON.stringify({ name: e.name, email: e.email, phone: e.phone, locality: e.locality, type: e.type,
    details: e.details, context: e.context, attribution: e.attribution, status: e.status, qualified: e.qualified,
    privacyNoticeVersion: e.privacyNoticeVersion, originalSourceKey: e.originalSourceKey, originalRequestedAt: e.originalRequestedAt?.toISOString(),
    files: e.files.map(({ digest, name, mimeType, origin }) => ({ digest, name, mimeType, origin })).sort((a, b) => a.digest.localeCompare(b.digest)) }));
}
const escape = (value: unknown) => String(value ?? "Por confirmar").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const labels: Record<string, string> = { yes: "Sim", no: "Não", maybe: "Talvez", pending: "Em processo", unknown: "Por confirmar", villa: "Moradia", apartment: "Apartamento", farmhouse: "Quinta", hostel: "Hostel", guesthouse: "Guesthouse", boutiqueHotel: "Hotel boutique", other: "Outro" };
const display = (v: unknown) => typeof v === "string" ? labels[v] || v || "Por confirmar" : v ?? "Por confirmar";
function photoLink(value: unknown): { href: string | null; text: string } {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { href: null, text: "Não fornecido" };
  try {
    const url = new URL(raw);
    // A private continuation link is an authentication capability, not a photo album.
    if ((url.hostname === "portugalactive.com" || url.hostname.endsWith(".portugalactive.com"))
      && /^\/management\/complete(?:\/|$)/i.test(url.pathname)) {
      return { href: null, text: "Link pessoal de acompanhamento omitido; solicitar um link de fotografias." };
    }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return { href: null, text: raw };
    return { href: url.href, text: url.href };
  } catch { return { href: null, text: raw }; }
}
export function noteContent(e: CrmEnquiry) {
  const d = e.details; const link = photoLink(d.photosLink); const photos = !!link.href || e.files.some(f => f.mimeType.startsWith("image/"));
  const emailPhotos = new Set(e.files.filter(f => f.origin === "email" && f.mimeType.startsWith("image/")).map(f => f.digest)).size;
  const historical = e.privacyNoticeVersion === "owner-crm-photo-followup";
  const status = e.qualified ? photos ? "Dados e fotografias recebidos — avaliar" : "A aguardar fotografias" : photos ? "Fotografias recebidas — completar qualificação no contacto" : "Contacto recebido — falta qualificação e fotografias";
  const fields: [string, unknown][] = [
    ["Estado do pedido", status], ["Nome", e.name], ["Email", e.email], ["Telefone", e.phone], ["Localidade", e.locality], ["Tipo de imóvel", display(e.type)],
    ["Morada", d.address], ["Código postal", d.postalCode], ["Quartos", d.bedrooms], ["Descrição", d.description || d.legacyNotes],
    ["Já operou para turismo", display(d.operatedBefore)], ["Licença de exploração", display(d.licenseStatus || d.legacyLicense)], ["Número de licença", d.licenseNumber],
    ["Vive alguém na casa", display(d.occupied)], ["Detalhes de ocupação", d.occupiedDetails], ["À venda", display(d.forSale)], ["Interesse em vender com a PA", display(d.saleInterest)],
    ["Entrada no mercado", OWNER_TIMELINE_LABELS[d.launchTimeline as keyof typeof OWNER_TIMELINE_LABELS] || "Por confirmar"],
    ["Expectativa líquida anual para o proprietário", OWNER_INCOME_LABELS[d.incomeExpectation as keyof typeof OWNER_INCOME_LABELS] || "Por confirmar"],
    ["Link de fotografias", link.text], ["Anexos atualmente enviados", e.files.map(f => f.name).join(", ") || "Sem anexos"],
    ...(emailPhotos ? [["Fotografias recebidas por resposta ao email", `${emailPhotos} · associadas a este pedido; confirmar suficiência antes de avaliar.`]] as [string, unknown][] : []),
    ...(historical && e.originalRequestedAt ? [["Pedido original recebido em", e.originalRequestedAt.toISOString()]] as [string, unknown][] : []),
    [historical ? "Seguimento criado em" : "Recebido em", e.capturedAt.toISOString()], ["Atualizado em", e.modifiedAt.toISOString()], ["Referência do pedido", e.id],
    ["Idioma", e.context.language], ["Página", e.context.page_path], ["Posição do formulário", e.context.placement], ["Região", e.context.region],
    ["UTM origem", e.attribution.source], ["UTM meio", e.attribution.medium], ["UTM campanha", e.attribution.campaign], ["UTM conteúdo", e.attribution.content], ["Página de entrada", e.attribution.landing_path],
  ];
  const original = historical && e.originalSourceKey && /^v3:[0-9a-f-]{36}$/i.test(e.originalSourceKey)
    ? `<p>Pedido original: <strong>${escape(`PA-OWNER-v3-${e.originalSourceKey.slice(3)}`)}</strong></p>` : "";
  const privacy = historical ? "Pedido existente no CRM; contacto para obter elementos necessários à avaliação. Sem subscrição de marketing."
    : e.source === "v3" && d.schemaVersion === "owner-intake-legacy" ? "Pedido recebido pelo formulário anterior; contacto para obter os elementos necessários à avaliação. Sem subscrição de marketing."
    : "Informação de privacidade aceite para tratar o pedido, sem subscrição de marketing.";
  return `<h2>Portugal Active · Pedido de gestão</h2><p><strong>${escape(enquiryMarker(e))}</strong></p>${original}`
    + fields.map(([label, value]) => `<p><strong>${escape(label)}:</strong> ${label === "Link de fotografias" && link.href
      ? `<a href="${escape(link.href)}" target="_blank" rel="noopener noreferrer">Ver fotografias</a><br>${escape(link.text)}<br>Por rever pela equipa.`
      : escape(value || "Por confirmar").replace(/\n/g, "<br>")}</p>`).join("")
    + `<p>Fotografias e links requerem revisão da equipa. Dados declarados pelo proprietário; o rendimento indicado é uma expectativa líquida anual, não uma previsão da Portugal Active. ${privacy} Esta nota é atualizada pelo site; registe as notas comerciais separadamente.</p>`;
}
export function remoteFilename(file: CrmFile) {
  // Same bytes uploaded under another local UUID still produce one CRM attachment.
  const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf" } as Record<string, string>)[file.mimeType] || "bin";
  return `PA-${file.digest}.${extension}`;
}

/** A persisted intent precedes every create. Uncertain results can only reconcile,
 * never recreate. This favours a visible review item over duplicate CRM records. */
export async function ensureRemote(ledger: CrmLedger, key: string, find: () => Promise<number[]>, create: () => Promise<number>, prepare?: () => Promise<void>) {
  await ledger.checkpoint();
  const op = await ledger.operation(key);
  if (op.remoteId) return op.remoteId;
  const matches = [...new Set(await find())];
  await ledger.checkpoint();
  if (matches.some(value => !Number.isSafeInteger(value) || value < 1)) throw new CrmError("REMOTE_ID_INVALID", true);
  if (matches.length > 1) throw new CrmError("MULTIPLE_REMOTE_MATCHES", true);
  if (matches.length === 1) { await ledger.confirmed(key, matches[0]); return matches[0]; }
  if (op.status === "attempting") throw new CrmError("CREATE_UNCONFIRMED", true);
  // Reads/local validation cannot create a remote object. Keep transient failures
  // here retryable; only the actual non-idempotent request needs an uncertain hold.
  if (prepare) await prepare();
  await ledger.checkpoint();
  if (!await ledger.attempting(key)) throw new CrmError("OPERATION_BUSY");
  try {
    const id = await create();
    if (!Number.isSafeInteger(id) || id < 1) throw new CrmError("CREATE_UNCONFIRMED", true);
    await ledger.confirmed(key, id); return id;
  } catch (error) {
    if (error instanceof CrmError && error.confirmedRejected) await ledger.rejected(key);
    throw error instanceof CrmError ? error : new CrmError("CREATE_UNCONFIRMED", true);
  }
}

export async function syncEnquiry(e: CrmEnquiry, ledger: CrmLedger, gateway: CrmGateway, bytes: (file: CrmFile) => Promise<Buffer>) {
  const marker = enquiryMarker(e); const prefix = operationPrefix(e);
  await ledger.checkpoint();
  const binding = await ledger.operation(`${prefix}:person`);
  const personId = binding.remoteId || await ensureRemote(ledger, `person:${hash(e.email.trim().toLowerCase())}`, () => gateway.findPersons(e.email), () => gateway.createPerson(e));
  if (!binding.remoteId) { await ledger.checkpoint(); await ledger.confirmed(`${prefix}:person`, personId); }
  const dealId = await ensureRemote(ledger, `${prefix}:deal`, () => gateway.findDeals(marker, personId), async () => {
    try { return await gateway.createDeal(e, personId, marker); }
    catch (error) {
      if (error instanceof CrmError && error.confirmedRejected) await ledger.saveFieldState(`${prefix}:property-values`, emptyFieldState());
      throw error;
    }
  }, async () => {
    // Historical Make/manual opportunities have no request marker. Never guess
    // whether a repeated email represents the same house or another property.
    if ((await gateway.otherOpenDeals(personId, marker)).length) throw new CrmError("EXISTING_OPPORTUNITY_REVIEW", true, true);
    await ledger.saveFieldState(`${prefix}:property-values`, { ...emptyFieldState(), pending: { before: {}, desired: desiredPropertyFields(e) } });
  });
  await syncPropertyFields(e, dealId, ledger, gateway);
  const fieldOperation = `${prefix}:${PROPERTY_FIELDS_VERSION}`;
  await ledger.operation(fieldOperation); await ledger.confirmed(fieldOperation, dealId);
  const content = noteContent(e);
  const noteId = await ensureRemote(ledger, `${prefix}:note`, () => gateway.findNotes(dealId, marker), () => gateway.createNote(dealId, content));
  await ledger.checkpoint(); await gateway.updateNote(noteId, content);
  for (const file of [...new Map(e.files.map(f => [f.digest, f])).values()]) {
    const filename = remoteFilename(file); let content: Buffer;
    await ensureRemote(ledger, `${prefix}:file:${file.digest}`, () => gateway.findFiles(dealId, filename),
      () => gateway.createFile(dealId, file, filename, content), async () => {
      content = await bytes(file);
      if (content.length !== file.size || createHash("sha256").update(content).digest("hex") !== file.digest) throw new CrmError("FILE_INTEGRITY", true, true);
    });
  }
  return { personId, dealId, noteId };
}
