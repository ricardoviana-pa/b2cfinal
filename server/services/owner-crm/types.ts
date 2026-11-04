export type CrmSource = "v3" | "v4";
export interface CrmFile { id: string; name: string; mimeType: string; size: number; digest: string }
export interface CrmEnquiry {
  source: CrmSource; id: string; sourceKey: string; modifiedAt: Date; capturedAt: Date;
  name: string; email: string; phone: string; locality: string; type: string;
  details: Record<string, unknown>; context: Record<string, unknown>; attribution: Record<string, unknown>;
  status: string; qualified: boolean; files: CrmFile[];
}
export interface CrmOperation { key: string; status: "ready" | "attempting" | "done"; remoteId: number | null }
export interface CrmLedger {
  operation(key: string): Promise<CrmOperation>;
  attempting(key: string): Promise<boolean>;
  confirmed(key: string, remoteId: number): Promise<void>;
  rejected(key: string): Promise<void>;
  checkpoint(): Promise<void>;
}
export interface CrmGateway {
  findPersons(email: string): Promise<number[]>;
  createPerson(e: CrmEnquiry): Promise<number>;
  findDeals(marker: string, personId: number): Promise<number[]>;
  otherOpenDeals(personId: number, marker: string): Promise<Array<number | string>>;
  createDeal(e: CrmEnquiry, personId: number, marker: string): Promise<number>;
  findNotes(dealId: number, marker: string): Promise<number[]>;
  createNote(dealId: number, content: string): Promise<number>;
  updateNote(noteId: number, content: string): Promise<void>;
  findFiles(dealId: number, filename: string): Promise<number[]>;
  createFile(dealId: number, file: CrmFile, filename: string, bytes: Buffer): Promise<number>;
}
export class CrmError extends Error {
  constructor(public code: string, public review = false, public confirmedRejected = false) { super(code); }
}
