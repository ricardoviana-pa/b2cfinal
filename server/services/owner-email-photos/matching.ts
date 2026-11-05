import { createHash } from "node:crypto";
import type { InboundPhotoMetadata } from "./protocol";

export interface ReplyCandidate {
  sourceKey: string; enquiryId: string; email: string; personId: number; dealId: number;
  requestIds: string[]; tokenHashes: string[]; outboundMessageIds: string[];
  status: "open" | "won" | "lost" | "deleted" | "unknown"; archived: boolean; synthetic?: boolean;
}
export type ReplyEvidence = "rfc_reply" | "request_reference" | "private_link";
export type ReplyMatch = { decision: "matched"; sourceKey: string; enquiryId: string; personId: number; dealId: number; matchedBy: ReplyEvidence[]; sender: "from" | "original_sender" }
  | { decision: "review" | "ignored"; code: string };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
export function normalizeMessageId(value: string) {
  const text = value.trim();
  const bare = text.startsWith("<") && text.endsWith(">") ? text.slice(1, -1) : text;
  const match = bare.match(/^([^<>\s@]+@[^<>\s@]+)$/);
  return match?.[1] || null;
}
function decodeQuotedText(value: string) {
  return value.replace(/=\r?\n/g, "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]{1,6});/gi, (all, hex) => { const n = parseInt(hex, 16); return n <= 0x10ffff ? String.fromCodePoint(n) : all; })
    .replace(/&#(\d{1,7});/g, (all, dec) => { const n = Number(dec); return n <= 0x10ffff ? String.fromCodePoint(n) : all; });
}
function privateLinkHashes(text: string) {
  const found = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    try {
      const url = new URL(match[0]);
      if (!['portugalactive.com', 'www.portugalactive.com'].includes(url.hostname) || url.username || url.password
        || !/^\/management\/complete\/?$/.test(url.pathname)) continue;
      const token = url.hash.match(/^#token=([A-Za-z0-9_-]{43})(?:[).,;]*)$/)?.[1];
      if (token) found.add(hash(token));
    } catch { /* A malformed URL is never an identity signal. */ }
  }
  return found;
}
export function extractReplySignals(message: Pick<InboundPhotoMetadata, "subject" | "text" | "inReplyTo" | "references">) {
  const text = decodeQuotedText(`${message.subject}\n${message.text}`);
  return {
    requestIds: [...new Set((text.match(uuidPattern) || []).map(id => id.toLowerCase()))],
    tokenHashes: [...privateLinkHashes(text)],
    rfcMessageIds: [...new Set([...message.inReplyTo, ...message.references].map(normalizeMessageId).filter((id): id is string => !!id))],
  };
}
/** Matching outputs identifiers only. Quoted content and private links never leave this function. */
export function resolveReplyTarget(message: InboundPhotoMetadata, candidates: ReplyCandidate[], options: { allowedTestEnquiryIds?: string[] } = {}): ReplyMatch {
  if (message.automatic) return { decision: "ignored", code: "AUTOMATIC_MESSAGE" };
  const auth = message.authentication;
  const managementDestination = [...message.to, ...message.cc].some(email => normalizeEmail(email) === "management@portugalactive.com")
    || auth.groupVerified && /(?:^|<)management\.portugalactive\.com>?$/i.test(message.listId || "");
  if (!managementDestination) return { decision: "ignored", code: "NOT_MANAGEMENT_REPLY" };
  const allowedTests = new Set(options.allowedTestEnquiryIds || []);
  const signals = extractReplySignals(message);
  let sender: "from" | "original_sender" = "from";
  let email = normalizeEmail(message.from);
  const effectiveEmail = auth.googleAuthserv && auth.groupVerified && auth.originalSenderVerified && message.originalSender ? normalizeEmail(message.originalSender) : email;
  if ((!message.originalSender || auth.originalSenderVerified) && /@portugalactive\.com$/i.test(effectiveEmail) && !candidates.some(candidate => allowedTests.has(candidate.enquiryId) && normalizeEmail(candidate.email) === effectiveEmail
    && ([candidate.enquiryId,...candidate.requestIds].some(id => signals.requestIds.includes(id.toLowerCase()))
      || candidate.tokenHashes.some(digest => signals.tokenHashes.includes(digest))
      || candidate.outboundMessageIds.some(id => { const normalized = normalizeMessageId(id); return !!normalized && signals.rfcMessageIds.includes(normalized); }))))
    return { decision: "ignored", code: "INTERNAL_MESSAGE" };
  if (auth.googleAuthserv && auth.groupVerified && message.originalSender && !auth.originalSenderVerified)
    return { decision: "review", code: "ORIGINAL_SENDER_NOT_VERIFIED" };
  if (auth.googleAuthserv && auth.groupVerified && auth.originalSenderVerified && message.originalSender) {
    email = normalizeEmail(message.originalSender); sender = "original_sender";
  } else if (!auth.googleAuthserv || !auth.fromVerified) return { decision: "review", code: "SENDER_NOT_VERIFIED" };
  if (/@portugalactive\.com$/i.test(email) && !candidates.some(candidate => allowedTests.has(candidate.enquiryId) && normalizeEmail(candidate.email) === email))
    return { decision: "ignored", code: "INTERNAL_MESSAGE" };
  const subject = message.subject.trim();
  if (/^(?:Auto(?:matic)?[ -]?reply|Automatic response|Resposta autom[aá]tica|Out of office|Undeliverable|Delivery Status Notification)\b/i.test(subject))
    return { decision: "ignored", code: "AUTOMATIC_MESSAGE" };
  const requests = new Set(signals.requestIds), tokenHashes = new Set(signals.tokenHashes), refs = new Set(signals.rfcMessageIds);
  const signalled = candidates.map(candidate => {
    const evidence: ReplyEvidence[] = [];
    if (candidate.outboundMessageIds.some(id => { const normalized = normalizeMessageId(id); return normalized && refs.has(normalized); })) evidence.push("rfc_reply");
    if ([candidate.enquiryId, ...candidate.requestIds].some(id => requests.has(id.toLowerCase()))) evidence.push("request_reference");
    if (candidate.tokenHashes.some(digest => tokenHashes.has(digest))) evidence.push("private_link");
    return { candidate, evidence };
  }).filter(item => item.evidence.length > 0);
  if (!signalled.length) return /@portugalactive\.com$/i.test(email)
    ? { decision: "ignored", code: "INTERNAL_MESSAGE" } : { decision: "review", code: "REQUEST_REFERENCE_MISSING" };
  const canonical = new Map<string, { candidate: ReplyCandidate; evidence: Set<ReplyEvidence> }>();
  for (const item of signalled) {
    const key = item.candidate.sourceKey;
    const previous = canonical.get(key);
    if (previous && (previous.candidate.dealId !== item.candidate.dealId || previous.candidate.personId !== item.candidate.personId || previous.candidate.enquiryId !== item.candidate.enquiryId))
      return { decision: "review", code: "CANONICAL_MAPPING_CONFLICT" };
    if (previous) item.evidence.forEach(value => previous.evidence.add(value));
    else canonical.set(key, { candidate: item.candidate, evidence: new Set(item.evidence) });
  }
  if (canonical.size !== 1) return { decision: "review", code: "CONFLICTING_REQUEST_REFERENCES" };
  const { candidate, evidence } = [...canonical.values()][0];
  if (normalizeEmail(candidate.email) !== email) return { decision: "review", code: "SENDER_REQUEST_MISMATCH" };
  if (/@portugalactive\.com$/i.test(email) && !allowedTests.has(candidate.enquiryId)) return { decision: "ignored", code: "INTERNAL_MESSAGE" };
  if (!Number.isSafeInteger(candidate.personId) || candidate.personId <= 0 || !Number.isSafeInteger(candidate.dealId) || candidate.dealId <= 0)
    return { decision: "review", code: "CRM_BINDING_MISSING" };
  if ((candidate.synthetic || /@(?:example\.(?:com|org|net|test|invalid)|test\.invalid)$/i.test(candidate.email)) && !allowedTests.has(candidate.enquiryId))
    return { decision: "ignored", code: "SYNTHETIC_REQUEST" };
  if (candidate.archived || !["open", "won"].includes(candidate.status)) return { decision: "review", code: "CRM_DEAL_NOT_ACTIVE" };
  return { decision: "matched", sourceKey: candidate.sourceKey, enquiryId: candidate.enquiryId, personId: candidate.personId, dealId: candidate.dealId, matchedBy: [...evidence], sender };
}
