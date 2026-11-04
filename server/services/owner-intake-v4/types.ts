import type { OwnerIntakeContext, OwnerAttachmentMetadata } from "../../../shared/owner-intake";
import type { OwnerV4Attribution, OwnerV4Contact, OwnerV4Details, OwnerV4Status } from "../../../shared/owner-intake-v4";
import type { OwnerMail } from "../owner-intake/store";
export interface V4Record {
  id: string; startFingerprint: string; contact: OwnerV4Contact; context: OwnerIntakeContext;
  attribution: OwnerV4Attribution | null; details: Partial<OwnerV4Details> | null; status: OwnerV4Status;
  tokenHash: string; tokenExpiresAt: Date; revision: number; completedFingerprint: string | null;
  capturedAt: Date; updatedAt: Date; qualificationCompletedAt: Date | null; mediaReceivedAt: Date | null;
  privacyAcknowledgedAt: Date; privacyNoticeVersion: "owner-intake-v4";
  awaitingPhotosAt: Date | null; completionCount: number; mediaFileCount: number;
}
export interface V4OutboxPayload {
  mail: OwnerMail; fileIds: string[]; completionUrl?: string;
  // Private notification journal; the frozen provider payload is never edited.
  mediaFingerprint?: string; mediaLink?: string; notificationRevision?: number;
}
export interface V4Outbox {
  id: string; enquiryId: string; kind: string; payload: V4OutboxPayload; attachmentBytes: number;
  status: string; attempts: number; leaseAt: Date | null; firstAttemptAt: Date | null;
}
export type V4FileMetadata = OwnerAttachmentMetadata & { digest: string; active: number };
