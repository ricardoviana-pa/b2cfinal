import type { OwnerV4Start, OwnerV4Details } from "../../../shared/owner-intake-v4";
import { syntheticOwner } from "../owner-intake/__tests__/fixtures";
import type { V4Record } from "./types";
import { tokenHash } from "./validation";
export const SYNTHETIC_TOKEN = "a".repeat(43);
export const testNow = new Date("2099-01-01T00:00:00Z");
export function startInput(): OwnerV4Start { const old = syntheticOwner(); return { requestId: old.requestId, name: old.name, email: old.email,
  phone: old.phone, type: old.type, locality: "Localidade sintética", privacyAcknowledged: true, context: old.context, website: "" }; }
export function detailsInput(): OwnerV4Details { const old = syntheticOwner(); return { address: old.address, postalCode: "4900-123", bedrooms: old.bedrooms,
  description: old.description, operatedBefore: old.operatedBefore, licenseStatus: old.licenseStatus, licenseNumber: old.licenseNumber,
  occupied: old.occupied, occupiedDetails: old.occupiedDetails, forSale: old.forSale, saleInterest: old.saleInterest,
  launchTimeline: old.launchTimeline, incomeExpectation: old.incomeExpectation, incomeBasis: old.incomeBasis, photosLink: "" }; }
export function recordInput(): V4Record { const p = startInput(); return { id: p.requestId, startFingerprint: "synthetic", contact: { name: p.name, email: p.email, phone: p.phone, type: p.type, locality: p.locality }, context: p.context,
  attribution: { source: "synthetic", campaign: "isolated-test" }, details: null, status: "awaiting_details", tokenHash: tokenHash(SYNTHETIC_TOKEN),
  tokenExpiresAt: new Date("2099-02-01T00:00:00Z"), revision: 0, completedFingerprint: null, capturedAt: testNow, updatedAt: testNow,
  privacyAcknowledgedAt: testNow, privacyNoticeVersion: "owner-intake-v4",
  qualificationCompletedAt: null, mediaReceivedAt: null, awaitingPhotosAt: null, completionCount: 0, mediaFileCount: 0 }; }
export function pngBytes(size = 24) { const b = Buffer.alloc(size); b.set([137, 80, 78, 71, 13, 10, 26, 10]); return b; }
