import type { OwnerIntakeInput } from "../../../../shared/owner-intake";
export const syntheticOwner = (): OwnerIntakeInput => ({
  schemaVersion: "owner-intake-v3", requestId: "12345678-1234-4234-8234-123456789012",
  name: "Synthetic Owner", email: "owner@example.invalid", phone: "+351 900 000 000",
  address: "Synthetic test property", postalCode: "4900123", type: "villa", bedrooms: "3",
  description: "Synthetic property used only in isolated tests.", operatedBefore: "yes", licenseStatus: "pending",
  licenseNumber: "", occupied: "no", occupiedDetails: "", forSale: "no", saleInterest: "maybe",
  launchTimeline: "3m", incomeExpectation: "30_60", incomeBasis: "annual_net_owner",
  photoMethod: "later", photosLink: "", privacyAcknowledged: true, website: "",
  context: { language: "pt", page_path: "/management/", placement: "hero", page_id: "home", page_kind: "home", region: "" }, attachments: [],
});
export const png = (size = 24) => {
  const bytes = Buffer.alloc(size);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  return { name: "synthetic.png", mimeType: "image/png", base64: bytes.toString("base64") };
};
