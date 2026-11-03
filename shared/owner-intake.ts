/** Public intake contract. Saved records and attachment bytes have no public read endpoint. */
export const OWNER_INTAKE_VERSION = "owner-intake-v3" as const;
export const OWNER_SALES_EMAIL = "management@portugalactive.com";
export const OWNER_FILE_LIMIT = 5 * 1024 * 1024;
export const OWNER_TOTAL_FILE_LIMIT = 15 * 1024 * 1024;
export const OWNER_FILE_COUNT_LIMIT = 8;
export const OWNER_PROPERTY_TYPES = ["villa", "apartment", "farmhouse", "hostel", "guesthouse", "boutiqueHotel", "other"] as const;
export const OWNER_BEDROOMS = ["1", "2", "3", "4", "5", "6+"] as const;
export const OWNER_TIMELINES = ["now", "1m", "3m", "6m", "12m"] as const;
export const OWNER_INCOME_EXPECTATIONS = ["0_15", "15_30", "30_60", "60_90", "90_150", "150_plus"] as const;
export const OWNER_STATUSES = ["new", "contacted", "qualified", "proposal", "won", "archived"] as const;
export type OwnerEnquiryStatus = typeof OWNER_STATUSES[number];
export type OwnerNotificationStatus = "pending" | "sending" | "sent" | "failed" | "needs_review";
export interface OwnerAttachmentInput { name: string; mimeType: string; base64: string }
export interface OwnerAttachmentMetadata { id: string; name: string; mimeType: string; size: number }
export interface OwnerIntakeContext {
  language: string;
  page_path: string;
  placement: string;
  page_id: string;
  page_kind: string;
  region: string;
}
export interface OwnerIntakeInput {
  schemaVersion: typeof OWNER_INTAKE_VERSION;
  requestId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  type: typeof OWNER_PROPERTY_TYPES[number];
  bedrooms: typeof OWNER_BEDROOMS[number];
  description: string;
  operatedBefore: "yes" | "no";
  licenseStatus: "yes" | "pending" | "no" | "unknown";
  licenseNumber: string;
  occupied: "yes" | "no";
  occupiedDetails: string;
  forSale: "yes" | "no";
  saleInterest: "yes" | "maybe" | "no";
  launchTimeline: typeof OWNER_TIMELINES[number];
  incomeExpectation: typeof OWNER_INCOME_EXPECTATIONS[number];
  incomeBasis: "annual_net_owner";
  photoMethod: "link" | "files" | "both" | "later";
  photosLink: string;
  privacyAcknowledged: true;
  website: string;
  context: OwnerIntakeContext;
  attachments: OwnerAttachmentInput[];
}
export interface OwnerLegacyFields {
  schemaVersion: "owner-intake-legacy";
  requestId: string;
  qualificationIncomplete: true;
  name: string;
  email: string;
  phone: string;
  address: string;
  type: string;
  bedrooms: string;
  legacyLicense: string;
  photosLink: string;
  legacyNotes: string;
  language: string;
}
export type OwnerStoredFields = Omit<OwnerIntakeInput, "attachments" | "website"> | OwnerLegacyFields;
export const OWNER_INCOME_LABELS: Record<OwnerIntakeInput["incomeExpectation"], string> = {
  "0_15": "0–15.000 €", "15_30": "15.000–30.000 €", "30_60": "30.000–60.000 €",
  "60_90": "60.000–90.000 €", "90_150": "90.000–150.000 €", "150_plus": "150.000 €+",
};
export const OWNER_TIMELINE_LABELS: Record<OwnerIntakeInput["launchTimeline"], string> = {
  now: "Imediatamente", "1m": "1 mês", "3m": "3 meses", "6m": "6 meses", "12m": "1 ano",
};
