import { describe, expect, it, vi } from "vitest";
import { PipedriveGateway } from "./pipedrive";
import type { CrmEnquiry } from "./types";
const config = { token: "synthetic-token", stageId: 1, ownerId: 22976488 };
const result = (data: unknown, additional_data: unknown = {}) => new Response(JSON.stringify({ success: true, data, additional_data }), { status: 200 });
const e = { name: "Synthetic owner", email: "owner@example.com", phone: "+351900000000", locality: "Synthetic town", details: {}, attribution: { campaign: "synthetic" } } as CrmEnquiry;
describe("Pipedrive HTTP contract", () => {
  it("uses fixed PA host and header authentication, no key in URL or body", async () => {
    const fetcher = vi.fn(async () => result({ items: [{ item: { id: 7, emails: ["OWNER@example.com"] } }] }));
    expect(await new PipedriveGateway(config, fetcher).findPersons("owner@example.com")).toEqual([7]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("https://portugalactive.pipedrive.com/api/v2/persons/search"); expect(url).toContain("exact_match=true"); expect(url).not.toContain(config.token);
    expect(init.headers).toMatchObject({ "x-api-token": config.token }); expect(init.redirect).toBe("error");
  });
  it("fails closed on a contact search without verifiable email fields", async () => {
    const fetcher = vi.fn(async () => result({ items: [{ item: { id: 7 } }] }));
    await expect(new PipedriveGateway(config, fetcher).findPersons(e.email)).rejects.toThrow("PERSON_MATCH_REVIEW");
  });
  it("paginates exact email searches before declaring uniqueness", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(result({ items: [{ item: { id: 7, emails: [e.email] } }] }, { next_cursor: "page2" }))
      .mockResolvedValueOnce(result({ items: [{ item: { id: 8, emails: [e.email] } }] }));
    expect(await new PipedriveGateway(config, fetcher).findPersons(e.email)).toEqual([7, 8]); expect(fetcher.mock.calls[1][0]).toContain("cursor=page2");
  });
  it("sends documented v2 contact arrays, no marketing subscription", async () => {
    const fetcher = vi.fn(async () => result({ id: 7 })); await new PipedriveGateway(config, fetcher).createPerson(e);
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ owner_id: 22976488, emails: [{ value: e.email, primary: true }], phones: [{ value: e.phone }] }); expect(body).not.toHaveProperty("marketing_status");
  });
  it("creates only the Inbound opportunity with zero promised revenue", async () => {
    const fetcher = vi.fn(async () => result({ id: 9 })); await new PipedriveGateway(config, fetcher).createDeal(e, 7, "PA-OWNER-v4-synthetic");
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ person_id: 7, owner_id: 22976488, pipeline_id: 1, stage_id: 1, status: "open" }); expect(body).not.toHaveProperty("value");
    expect(body.custom_fields["3a4458a2c4f594775453a118d0573b7279866105"]).toBe(37);
  });
  it.each([["villa", 151], ["apartment", 152], ["farmhouse", 153], ["hostel", 154], ["guesthouse", 155], ["boutiqueHotel", 156], ["other", 157]])("maps declared property type %s only on creation", async (type, option) => {
    const fetcher = vi.fn(async () => result({ id: 9 }));
    await new PipedriveGateway(config, fetcher).createDeal({ ...e, source: "v4", type: String(type) }, 7, "PA-OWNER-v4-synthetic");
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.custom_fields["bbcf4de8b2feb36dc3041087ae7e114918450d4e"]).toBe(option);
    expect(body.custom_fields["2c10ff14f44288ca9f891a7abb4e52a0efe667a7"]).toBe(e.locality);
  });
  it("does not mislabel a legacy street address as municipality or guess an unknown enum", async () => {
    const fetcher = vi.fn(async () => result({ id: 9 }));
    await new PipedriveGateway(config, fetcher).createDeal({ ...e, source: "v3", type: "unknown-legacy-type" }, 7, "PA-OWNER-v3-synthetic");
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.custom_fields).not.toHaveProperty("bbcf4de8b2feb36dc3041087ae7e114918450d4e"); expect(body.custom_fields).not.toHaveProperty("2c10ff14f44288ca9f891a7abb4e52a0efe667a7");
  });
  it("checks existing inbox leads and open opportunities across all pipelines", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(result([{ id: 9, pipeline_id: 12, title: "Earlier property opportunity" }]))
      .mockResolvedValueOnce(result([{ id: "synthetic-lead-uuid", title: "Existing inbox lead", is_archived: false }]));
    expect(await new PipedriveGateway(config, fetcher).otherOpenDeals(7, "PA-OWNER-v4-synthetic")).toEqual([9, "lead:synthetic-lead-uuid"]);
    expect(fetcher.mock.calls[1][0]).toContain("/v1/leads?person_id=7");
  });
  it("bounds long deal titles while retaining the entire enquiry marker", async () => {
    const fetcher = vi.fn(async () => result({ id: 9 })); const marker = "PA-OWNER-v4-00000000-0000-4000-8000-000000000001";
    await new PipedriveGateway(config, fetcher).createDeal({ ...e, name: "N".repeat(120), locality: "A".repeat(300) }, 7, marker);
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.title.length).toBeLessThanOrEqual(240); expect(body.title).toContain(marker);
  });
  it("updates only integration note content without touching deal lifecycle", async () => {
    const fetcher = vi.fn(async () => result({ id: 9 })); await new PipedriveGateway(config, fetcher).updateNote(9, "synthetic note");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]; expect(url).toContain("/v1/notes/9"); expect(init.method).toBe("PUT"); expect(JSON.parse(init.body as string)).toEqual({ content: "synthetic note" });
  });
  it("distinguishes explicit quota rejection from uncertain create response", async () => {
    const quota = new PipedriveGateway(config, vi.fn(async () => new Response("private provider body", { status: 429 })));
    await expect(quota.createPerson(e)).rejects.toMatchObject({ code: "PIPEDRIVE_HTTP_429", confirmedRejected: true });
    const timeout = new PipedriveGateway(config, vi.fn(async () => { throw new Error("private token/PII"); }));
    await expect(timeout.createPerson(e)).rejects.toMatchObject({ code: "CREATE_UNCONFIRMED", confirmedRejected: false });
  });
  it("rejects malformed success and never logs provider response bodies", async () => {
    const api = new PipedriveGateway(config, vi.fn(async () => new Response("not-json-private", { status: 200 })));
    await expect(api.createPerson(e)).rejects.toThrow("CREATE_UNCONFIRMED");
  });
  it("uploads actual bytes as multipart, with deal and deterministic filename", async () => {
    const fetcher = vi.fn(async () => result({ id: 9 })); const file = { id: "synthetic", name: "a.png", mimeType: "image/png", digest: "a".repeat(64), size: 3 };
    await new PipedriveGateway(config, fetcher).createFile(22, file, "PA-digest.png", Buffer.from("abc"));
    const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1]; const body = init.body as FormData;
    expect(body.get("deal_id")).toBe("22"); const uploaded = body.get("file") as File; expect(uploaded.name).toBe("PA-digest.png"); expect(await uploaded.text()).toBe("abc");
    expect(init.headers).not.toHaveProperty("Content-Type");
  });
  it.each([{ status: "won" }, { status: "lost" }, { status: "deleted" }, { status: "open", is_archived: true }, { status: "open", is_deleted: true }])("suppresses reminders for closed or archived deals: %j", async deal => {
    expect(await new PipedriveGateway(config, vi.fn(async () => result(deal))).dealAllowsReminder(22)).toBe(false);
  });
  it("permits open deal reminders and defers when CRM status cannot be fetched", async () => {
    expect(await new PipedriveGateway(config, vi.fn().mockResolvedValueOnce(result({ status: "open", is_archived: false, is_deleted: false })).mockResolvedValueOnce(result([])).mockResolvedValueOnce(result([]))).dealAllowsReminder(22)).toBe(true);
    await expect(new PipedriveGateway(config, vi.fn(async () => new Response("private-error", { status: 503 }))).dealAllowsReminder(22)).rejects.toThrow("CRM_REMINDER_STATUS_UNAVAILABLE");
    expect(await new PipedriveGateway(config, vi.fn(async () => new Response("not found", { status: 404 }))).dealAllowsReminder(22)).toBe(false);
  });
  it("suppresses reminders for photographs uploaded directly by sales to CRM", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(result({ status: "open" })).mockResolvedValueOnce(result([{ active_flag: true, inline_flag: false, file_type: "img", name: "house.png" }]));
    expect(await new PipedriveGateway(config, fetcher).dealAllowsReminder(22)).toBe(false); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("suppresses reminders when photos are already approved in the verified CRM field", async () => {
    const fetcher = vi.fn(async () => result({ status: "open", custom_fields: { "3d8606f82d5ea8c0d16dd16cfca6bfbe04c126c7": 51 } }));
    expect(await new PipedriveGateway(config, fetcher).dealAllowsReminder(22)).toBe(false); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("suppresses reminders for an existing explicit album note; PDF and signatures alone do not qualify", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(result({ status: "open" })).mockResolvedValueOnce(result([{ file_type: "pdf" }, { file_type: "img", inline_flag: true }]))
      .mockResolvedValueOnce(result([{ content: '<p>Fotografias: <a href="https://drive.google.com/drive/folders/synthetic">Álbum</a></p>' }]));
    expect(await new PipedriveGateway(config, fetcher).dealAllowsReminder(22)).toBe(false);
  });
  it("defers instead of sending when existing CRM file evidence cannot be checked", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(result({ status: "open" })).mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    await expect(new PipedriveGateway(config, fetcher).dealAllowsReminder(22)).rejects.toThrow("CRM_REMINDER_STATUS_UNAVAILABLE");
  });
});
