import type { InboundPhotoMetadata } from "./protocol";
export const syntheticMetadata = (): InboundPhotoMetadata => ({
  schemaVersion: "owner-email-photos-v1", source: "gmail", mailbox: "ricardo.viana@portugalactive.com",
  providerId: "synthetic-provider-message", threadId: "synthetic-thread", messageId: "<incoming@synthetic.test>", inReplyTo: [], references: [],
  from: "owner@synthetic.test", to: ["management@portugalactive.com"], cc: [], subject: "Re: Fotografias para avaliar a sua propriedade", text: "As fotografias seguem em anexo.",
  automatic: false, receivedAt: "2099-01-04T12:00:00Z", attachments: [],
  authentication: { googleAuthserv: true, dkimPassDomains: ["synthetic.test"], dmarcPassDomains: ["synthetic.test"], spfPassDomains: [], arcPass: false, groupVerified: false, fromVerified: true, originalSenderVerified: false },
});
