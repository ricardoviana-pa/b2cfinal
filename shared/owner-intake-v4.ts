import type { OwnerIntakeContext, OwnerIntakeInput, OwnerAttachmentMetadata } from "./owner-intake";

export const OWNER_V4_VERSION = "owner-intake-v4" as const;
export const OWNER_V4_TOKEN_DAYS = 30;
// Removed files may belong to an immutable email snapshot; cap that private history too.
export const OWNER_V4_FILE_HISTORY_COUNT = 32;
export const OWNER_V4_FILE_HISTORY_BYTES = 60 * 1024 * 1024;
export type OwnerV4Status = "awaiting_details" | "awaiting_photos" | "complete";
export type OwnerV4Contact = Pick<OwnerIntakeInput, "name" | "email" | "phone" | "type"> & { locality: string };
export type OwnerV4ContactEdit = Partial<Omit<OwnerV4Contact, "email">>;
export type OwnerV4Details = Pick<OwnerIntakeInput, "address" | "postalCode" | "bedrooms" | "description" |
  "operatedBefore" | "licenseStatus" | "licenseNumber" | "occupied" | "occupiedDetails" | "forSale" |
  "saleInterest" | "launchTimeline" | "incomeExpectation" | "incomeBasis" | "photosLink">;
export interface OwnerV4Attribution { source?: string; medium?: string; campaign?: string; content?: string; landing_path?: string }
export interface OwnerV4Start extends OwnerV4Contact {
  requestId: string; privacyAcknowledged: true; context: OwnerIntakeContext; attribution?: OwnerV4Attribution; website?: string;
}
export interface OwnerV4Mutation {
  mutationId: string; contact?: OwnerV4ContactEdit; details?: Partial<OwnerV4Details>;
}
/** Follow-up only: never edits contact details or completes qualification. */
export interface OwnerV4MediaMutation { mutationId: string; photosLink?: string }
export interface OwnerV4Receipt {
  success: true; reference: string; status: OwnerV4Status; duplicate: boolean;
}
export interface OwnerV4StartReceipt extends OwnerV4Receipt { continuationToken: string; completionUrl: string }
export interface OwnerV4Draft {
  success: true; reference: string; status: OwnerV4Status; contact: OwnerV4Contact;
  details: Partial<OwnerV4Details> | null; files: OwnerAttachmentMetadata[];
  /** Confirmed email attachments are read-only and separate from editable form uploads. */
  emailMedia?: { photoCount: number; fileCount: number };
  /** Material is stored, but its current snapshot has not been queued for the team. */
  mediaConfirmationRequired: boolean;
  context: OwnerIntakeContext; attribution?: OwnerV4Attribution; expiresAt: string;
}
