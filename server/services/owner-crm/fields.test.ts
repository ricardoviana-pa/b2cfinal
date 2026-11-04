import { describe, expect, it, vi } from "vitest";
import { currentPropertyFields, desiredPropertyFields, emptyFieldState, planPropertyFields, PROPERTY_FIELDS as F, reconcileFieldState, syncPropertyFields } from "./fields";
import { CrmError, type CrmEnquiry, type CrmFields, type CrmFieldState, type CrmGateway, type CrmLedger } from "./types";
const enquiry = (): CrmEnquiry => ({ source: "v4", id: "synthetic", sourceKey: "v4:synthetic", name: "Synthetic owner", email: "synthetic@example.com", phone: "+351900000000", type: "villa", locality: "Synthetic town", details: { address: "Synthetic address", postalCode: "0000-000", bedrooms: "4" }, context: {}, attribution: {}, files: [], status: "complete", qualified: true, capturedAt: new Date(), modifiedAt: new Date() });
function harness(initial: CrmFields = {}, initialState = emptyFieldState()) {
  let current = { ...initial }; let state = structuredClone(initialState);
  const ledger = { checkpoint: vi.fn(async () => {}), operation: vi.fn(async key => ({ key, status: "done", remoteId: 11 })), fieldState: vi.fn(async () => structuredClone(state)), saveFieldState: vi.fn(async (_key: string, value: CrmFieldState) => { state = structuredClone(value); }) } as unknown as CrmLedger;
  const gateway = { readDealFields: vi.fn(async () => ({ ...current })), updateDealFields: vi.fn(async (_id: number, patch: CrmFields) => { Object.assign(current, patch); }) } as unknown as CrmGateway;
  return { ledger, gateway, state: () => state, current: () => current, edit: (values: CrmFields) => { Object.assign(current, values); } };
}
describe("dedicated property field mapping", () => {
  it("maps supplied address, postcode, municipality, property type and exact bedroom count", () => {
    expect(desiredPropertyFields(enquiry())).toEqual({ [F.address]: "Synthetic address", [F.postalCode]: "0000-000", [F.locality]: "Synthetic town", [F.propertyType]: 151, [F.typology]: 140, [F.bedrooms]: "4" });
  });
  it("preserves 6+ as text and never translates it to the enum's exactly six", () => {
    const e = enquiry(); e.details.bedrooms = "6+"; const desired = desiredPropertyFields(e);
    expect(desired[F.bedrooms]).toBe("6+"); expect(desired[F.typology]).toBeNull(); expect(desired[F.typology]).not.toBe(142);
  });
  it("does not invent unknown enum counts or derive municipality from a v3 street address", () => {
    const e = enquiry(); e.source = "v3"; e.type = "unmapped"; e.details.bedrooms = "many";
    const desired = desiredPropertyFields(e); expect(desired).not.toHaveProperty(F.locality); expect(desired).not.toHaveProperty(F.typology); expect(desired).not.toHaveProperty(F.bedrooms); expect(desired).not.toHaveProperty(F.propertyType);
  });
  it("normalizes primitive enum strings and supported id objects without treating unknown values as empty", () => {
    const values = currentPropertyFields({ [F.typology]: "140", [F.propertyType]: { id: 151 }, [F.address]: { unknown: "private" } });
    expect(values[F.typology]).toBe(140); expect(values[F.propertyType]).toBe(151); expect(values[F.address]).toBe("[unrecognised CRM value]");
  });
});
describe("commercial edits are preserved", () => {
  it("fills empty dedicated fields once; a replay makes no further PATCH", async () => {
    const h = harness(); await syncPropertyFields(enquiry(), 11, h.ledger, h.gateway); await syncPropertyFields(enquiry(), 11, h.ledger, h.gateway);
    expect(h.current()).toMatchObject(desiredPropertyFields(enquiry())); expect(h.gateway.updateDealFields).toHaveBeenCalledTimes(1);
  });
  it("keeps the commercial address and typology even if the form disagrees", async () => {
    const h = harness({ [F.address]: "Address corrected by salesperson", [F.typology]: 138 });
    await syncPropertyFields(enquiry(), 11, h.ledger, h.gateway);
    expect(h.current()[F.address]).toBe("Address corrected by salesperson"); expect(h.current()[F.typology]).toBe(138);
    expect(h.state().protected).toContain(F.address); expect(h.state().lastWritten).not.toHaveProperty(F.address);
  });
  it("a pre-existing value equal to the form is not silently claimed as integration owned", async () => {
    const h = harness({ [F.address]: "Synthetic address" }); await syncPropertyFields(enquiry(), 11, h.ledger, h.gateway);
    const changed = enquiry(); changed.details.address = "New address from form"; await syncPropertyFields(changed, 11, h.ledger, h.gateway);
    expect(h.current()[F.address]).toBe("Synthetic address"); expect(h.state().protected).toContain(F.address);
  });
  it("updates its own last-written value while retaining human changes to another field", async () => {
    const h = harness(); await syncPropertyFields(enquiry(), 11, h.ledger, h.gateway);
    h.edit({ [F.postalCode]: "9999-999" }); const changed = enquiry(); changed.details.address = "Owner corrected address"; changed.details.postalCode = "1111-111";
    await syncPropertyFields(changed, 11, h.ledger, h.gateway);
    expect(h.current()[F.address]).toBe("Owner corrected address"); expect(h.current()[F.postalCode]).toBe("9999-999");
  });
  it("preserves a field intentionally cleared by a salesperson across later retries", async () => {
    const h = harness(); await syncPropertyFields(enquiry(), 11, h.ledger, h.gateway); h.edit({ [F.address]: null });
    await syncPropertyFields(enquiry(), 11, h.ledger, h.gateway); await syncPropertyFields(enquiry(), 11, h.ledger, h.gateway);
    expect(h.current()[F.address]).toBeNull(); expect(h.state().protected).toContain(F.address);
  });
  it("clears only an integration-owned stale exact typology when the new declaration is 6+", async () => {
    const h = harness(); await syncPropertyFields(enquiry(), 11, h.ledger, h.gateway);
    const changed = enquiry(); changed.details.bedrooms = "6+"; await syncPropertyFields(changed, 11, h.ledger, h.gateway);
    expect(h.current()[F.typology]).toBeNull(); expect(h.current()[F.bedrooms]).toBe("6+");
  });
  it("detects a commercial edit between the first read and pre-write recheck", async () => {
    const h = harness(); vi.mocked(h.gateway.readDealFields).mockResolvedValueOnce({}).mockImplementation(async () => ({ [F.address]: "Just edited by sales" }));
    await syncPropertyFields(enquiry(), 11, h.ledger, h.gateway);
    expect(vi.mocked(h.gateway.updateDealFields).mock.calls[0][1]).not.toHaveProperty(F.address); expect(h.state().protected).toContain(F.address);
  });
});
describe("durable field write recovery", () => {
  it("a verified v3 continuation retains the integration's field ownership on the same CRM deal", async () => {
    const e = enquiry(); e.privacyNoticeVersion = "owner-crm-photo-followup"; e.originalSourceKey = "v3:00000000-0000-4000-8000-000000000001";
    e.details.address = "New owner address"; const h = harness({ [F.address]: "Old integration address" });
    vi.mocked(h.ledger.fieldState).mockImplementation(async key => key.includes(e.originalSourceKey!) ? { ...emptyFieldState(), lastWritten: { [F.address]: "Old integration address" } } : structuredClone(h.state()));
    await syncPropertyFields(e, 11, h.ledger, h.gateway); expect(h.current()[F.address]).toBe("New owner address");
  });
  it("does not inherit field ownership from a different CRM deal or untrusted public context", async () => {
    const e = enquiry(); e.privacyNoticeVersion = "owner-crm-photo-followup"; e.originalSourceKey = "v3:00000000-0000-4000-8000-000000000001";
    const h = harness({ [F.address]: "Commercial address" }); vi.mocked(h.ledger.operation).mockResolvedValue({ key: "original", status: "done", remoteId: 999 });
    await syncPropertyFields(e, 11, h.ledger, h.gateway); expect(h.current()[F.address]).toBe("Commercial address");
    const normal = enquiry(); normal.context.page_kind = "crm-photo-followup"; normal.originalSourceKey = e.originalSourceKey;
    const untrusted = harness({ [F.address]: "Commercial address" }); await syncPropertyFields(normal, 11, untrusted.ledger, untrusted.gateway); expect(untrusted.ledger.operation).not.toHaveBeenCalled();
  });
  it("records intent before PATCH and reconciles a lost response without repeating the write", async () => {
    const h = harness(); vi.mocked(h.gateway.updateDealFields).mockImplementationOnce(async (_id, patch) => { expect(h.state().pending?.desired).toEqual(patch); h.edit(patch); throw new CrmError("PIPEDRIVE_UNAVAILABLE"); });
    await expect(syncPropertyFields(enquiry(), 11, h.ledger, h.gateway)).rejects.toThrow("PIPEDRIVE_UNAVAILABLE");
    expect(h.state().pending).not.toBeNull(); await syncPropertyFields(enquiry(), 11, h.ledger, h.gateway);
    expect(h.gateway.updateDealFields).toHaveBeenCalledTimes(1); expect(h.state().pending).toBeNull(); expect(h.state().lastWritten[F.address]).toBe("Synthetic address");
  });
  it("recovers ownership of fields set in the original CREATE from its durable intent", () => {
    const desired = desiredPropertyFields(enquiry()); const state = reconcileFieldState(desired, { ...emptyFieldState(), pending: { before: {}, desired } });
    expect(state.lastWritten).toEqual(desired); expect(state.protected).toEqual([]); expect(planPropertyFields(desired, desired, state).patch).toEqual({});
  });
  it("does not claim ownership after a rejected PATCH", async () => {
    const h = harness(); vi.mocked(h.gateway.updateDealFields).mockRejectedValue(new CrmError("PIPEDRIVE_HTTP_400", true, true));
    await expect(syncPropertyFields(enquiry(), 11, h.ledger, h.gateway)).rejects.toThrow("PIPEDRIVE_HTTP_400"); expect(h.state().pending).toBeNull(); expect(h.state().lastWritten).toEqual({});
  });
});
