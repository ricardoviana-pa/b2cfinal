import { CrmError, type CrmEnquiry, type CrmFile, type CrmFields, type CrmGateway } from "./types";
import { desiredPropertyFields } from "./fields";
import { CRM_PHOTOS_ADEQUATE_FIELD, crmFileHasPhotos, crmNoteHasPhotoLink } from "./photo-evidence";

export interface PipedriveConfig { token: string; ownerId: number; stageId: number }
const API = "https://portugalactive.pipedrive.com/api";
const id = (payload: any) => {
  const value = Number(payload?.data?.id);
  if (!Number.isSafeInteger(value) || value < 1) throw new CrmError("CREATE_UNCONFIRMED", true);
  return value;
};
export class PipedriveGateway implements CrmGateway {
  constructor(private config: PipedriveConfig, private fetcher: typeof fetch = fetch) {}
  private async request(path: string, method = "GET", data?: Record<string, unknown> | FormData) {
    let response: Response;
    try {
      response = await this.fetcher(`${API}${path}`, { method, redirect: "error", signal: AbortSignal.timeout(25_000),
        headers: { "x-api-token": this.config.token, ...(data && !(data instanceof FormData) ? { "Content-Type": "application/json" } : {}) },
        ...(data ? { body: data instanceof FormData ? data : JSON.stringify(data) } : {}) });
    } catch { throw new CrmError(method === "POST" ? "CREATE_UNCONFIRMED" : "PIPEDRIVE_UNAVAILABLE", method === "POST"); }
    if (!response.ok) {
      const rejected = [400, 401, 403, 404, 409, 413, 422, 429].includes(response.status);
      throw new CrmError(`PIPEDRIVE_HTTP_${response.status}`, ![429, 500, 502, 503, 504].includes(response.status), rejected);
    }
    let result: any;
    try { result = await response.json(); } catch { throw new CrmError(method === "POST" ? "CREATE_UNCONFIRMED" : "PIPEDRIVE_INVALID_RESPONSE", method === "POST"); }
    if (result?.success !== true) throw new CrmError(method === "POST" ? "CREATE_UNCONFIRMED" : "PIPEDRIVE_INVALID_RESPONSE", method === "POST");
    return result;
  }
  private async list(path: string, params: Record<string, string | number> = {}, search = false) {
    const all: any[] = []; let cursor: string | undefined; let start = 0; const seen = new Set<string>();
    for (let page = 0; page < 25; page++) {
      const query = new URLSearchParams(Object.entries({ ...params, limit: 100, ...(cursor ? { cursor } : path.startsWith("/v1/") ? { start } : {}) }).map(([k, v]) => [k, String(v)]));
      const result = await this.request(`${path}?${query}`);
      const values = search ? result.data?.items?.map((x: any) => x.item) : result.data;
      if (values !== null && !Array.isArray(values)) throw new CrmError("PIPEDRIVE_INVALID_RESPONSE");
      all.push(...(values || []));
      const next = result.additional_data?.next_cursor;
      const pagination = result.additional_data?.pagination;
      if (next) cursor = String(next);
      else if (pagination?.more_items_in_collection) start = Number(pagination.next_start);
      else return all;
      const marker = cursor || String(start);
      if (seen.has(marker)) throw new CrmError("PIPEDRIVE_PAGINATION_REVIEW", true);
      seen.add(marker);
    }
    throw new CrmError("PIPEDRIVE_PAGINATION_REVIEW", true);
  }
  async findPersons(email: string) {
    const found = await this.list("/v2/persons/search", { term: email.trim(), fields: "email", exact_match: "true" }, true);
    if (found.some(p => !Array.isArray(p.emails))) throw new CrmError("PERSON_MATCH_REVIEW", true);
    return found.filter(p => Array.isArray(p.emails) && p.emails.some((value: any) => String(typeof value === "string" ? value : value.value).trim().toLowerCase() === email.trim().toLowerCase())).map(p => Number(p.id));
  }
  async createPerson(e: CrmEnquiry) {
    return id(await this.request("/v2/persons", "POST", { name: e.name, owner_id: this.config.ownerId,
      emails: [{ value: e.email, primary: true, label: "work" }], phones: e.phone ? [{ value: e.phone, primary: true, label: "mobile" }] : [] }));
  }
  async findDeals(marker: string, personId: number) {
    const found = await this.list("/v2/deals/search", { term: marker, fields: "title,notes", person_id: personId }, true);
    return found.filter(d => String(d.title || "").includes(marker)).map(d => Number(d.id));
  }
  async otherOpenDeals(personId: number, marker: string) {
    const found = await this.list("/v2/deals", { person_id: personId, status: "open" });
    const leads = await this.list("/v1/leads", { person_id: personId });
    return [...found.filter(d => !String(d.title || "").includes(marker)).map(d => Number(d.id)), ...leads.filter(l => !l.is_archived).map(l => `lead:${l.id}`)];
  }
  async createDeal(e: CrmEnquiry, personId: number, marker: string) {
    const suffix = ` [${marker}]`; const title = `${e.name} · ${e.locality || "Gestão de propriedade"}`.slice(0, 240 - suffix.length) + suffix;
    return id(await this.request("/v2/deals", "POST", { title,
      person_id: personId, owner_id: this.config.ownerId, pipeline_id: 1, stage_id: this.config.stageId, status: "open", currency: "EUR",
      custom_fields: { "3a4458a2c4f594775453a118d0573b7279866105": 37, "687102d74877dfa1e2d679cd1c671cabcecf7edd": "Portugal Active · Management",
        "6c2d373ce54c79d3b0cda47281273511c38d8fee": String(e.attribution.campaign || "Website Management"),
        ...desiredPropertyFields(e) } }));
  }
  async readDealFields(dealId: number) {
    const response = await this.request(`/v2/deals/${dealId}`);
    if (!response.data || typeof response.data.custom_fields !== "object" || response.data.custom_fields === null) throw new CrmError("CRM_FIELDS_UNAVAILABLE");
    return response.data.custom_fields as Record<string, unknown>;
  }
  async updateDealFields(dealId: number, fields: CrmFields) {
    if (Object.keys(fields).length) await this.request(`/v2/deals/${dealId}`, "PATCH", { custom_fields: fields });
  }
  async findNotes(dealId: number, marker: string) {
    return (await this.list("/v1/notes", { deal_id: dealId })).filter(n => String(n.content || "").includes(marker)).map(n => Number(n.id));
  }
  async verifyReplyOwner(dealId: number, personId: number, email: string) {
    const [dealResult, personResult] = await Promise.all([this.request(`/v2/deals/${dealId}`), this.request(`/v1/persons/${personId}`)]);
    const deal = dealResult.data, person = personResult.data;
    if (!deal || !person || deal.status !== "open" || deal.is_archived || deal.is_deleted || person.is_deleted)
      throw new CrmError("REPLY_DEAL_NOT_OPEN", true);
    if (Number(deal.person_id?.value || deal.person_id) !== personId
      || !(person.email || []).some((entry: any) => String(typeof entry === "string" ? entry : entry.value || "").trim().toLowerCase() === email.trim().toLowerCase()))
      throw new CrmError("REPLY_OWNER_CHANGED", true);
  }
  async createNote(dealId: number, content: string) { return id(await this.request("/v1/notes", "POST", { deal_id: dealId, content, pinned_to_deal_flag: 1 })); }
  async createReplyNote(dealId: number, content: string) { return id(await this.request("/v1/notes", "POST", { deal_id: dealId, content, pinned_to_deal_flag: 0 })); }
  async updateNote(noteId: number, content: string) { await this.request(`/v1/notes/${noteId}`, "PUT", { content }); }
  async findFiles(dealId: number, filename: string) {
    return (await this.list(`/v1/deals/${dealId}/files`)).filter(f => f.name === filename || f.file_name === filename).map(f => Number(f.id));
  }
  async dealAllowsReminder(dealId: number) {
    try {
      const result = await this.request(`/v2/deals/${dealId}`); const deal = result.data;
      if (!deal || !["open", "won", "lost", "deleted"].includes(deal.status)) throw new CrmError("CRM_REMINDER_STATUS_UNKNOWN");
      if (deal.status !== "open" || deal.is_archived || deal.is_deleted) return false;
      const adequate = deal.custom_fields?.[CRM_PHOTOS_ADEQUATE_FIELD];
      if (Number(typeof adequate === "object" && adequate ? adequate.id : adequate) === 51) return false;
      if ((await this.list(`/v1/deals/${dealId}/files`)).some(crmFileHasPhotos)) return false;
      if ((await this.list("/v1/notes", { deal_id: dealId })).some(note => crmNoteHasPhotoLink(note.content))) return false;
      return true;
    } catch (error) {
      if (error instanceof CrmError && error.code === "PIPEDRIVE_HTTP_404") return false;
      throw new CrmError("CRM_REMINDER_STATUS_UNAVAILABLE");
    }
  }
  async createFile(dealId: number, file: CrmFile, filename: string, bytes: Buffer) {
    const data = new FormData(); data.set("deal_id", String(dealId)); data.set("file", new Blob([new Uint8Array(bytes)], { type: file.mimeType }), filename);
    return id(await this.request("/v1/files", "POST", data));
  }
}
