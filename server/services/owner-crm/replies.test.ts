import { describe, expect, it, vi } from "vitest";
import { replyNoteContent, syncEmailReply, type CrmEmailReply } from "./replies";
import { CrmError, type CrmLedger, type CrmOperation } from "./types";
const reply: CrmEmailReply = { messageKey: 'a'.repeat(64), sourceKey: 'v4:11111111-1111-4111-8111-111111111111', dealId: 22, personId: 11,
  senderEmail: 'owner@synthetic.test', subject: 'Re: Pedido', receivedAt: new Date('2099-01-01T10:00:00Z'), bodyText: 'Já não pretendo vender.\nhttps://airbnb.pt/rooms/123' };
function fixture() {
  let op: CrmOperation = { key: '', status: 'ready', remoteId: null };
  const ledger = { checkpoint: vi.fn(), operation: vi.fn(async () => ({...op})), attempting: vi.fn(async () => { op.status='attempting'; return true; }),
    confirmed: vi.fn(async (_key, id) => { op.remoteId=id; op.status='done'; }), rejected: vi.fn(async () => { op.status='ready'; }) } as unknown as CrmLedger;
  const gateway = { verifyReplyOwner: vi.fn(), findNotes: vi.fn(async () => [] as number[]), createReplyNote: vi.fn(async () => 99) };
  const verifyLocal = vi.fn(); return { ledger, gateway, verifyLocal };
}
describe('idempotent owner reply notes', () => {
  it('creates one note on the existing deal for a reply with a public URL, and no duplicate on replay', async () => {
    const f = fixture(); expect(await syncEmailReply(reply, f.ledger, f.gateway, f.verifyLocal)).toBe(99);
    expect(await syncEmailReply(reply, f.ledger, f.gateway, f.verifyLocal)).toBe(99);
    expect(f.gateway.createReplyNote).toHaveBeenCalledTimes(1); expect(f.gateway.createReplyNote).toHaveBeenCalledWith(22, expect.stringContaining('Já não pretendo vender.'));
    expect(f.gateway.verifyReplyOwner).toHaveBeenCalledWith(22,11,'owner@synthetic.test'); expect(f.verifyLocal).toHaveBeenCalledTimes(3);
    expect(f.gateway.createReplyNote.mock.calls[0][1]).toContain('https://airbnb.pt/rooms/123');
  });
  it('reconciles a lost create response rather than posting another note', async () => {
    const f = fixture(); f.gateway.createReplyNote.mockRejectedValueOnce(new CrmError('CREATE_UNCONFIRMED',true));
    await expect(syncEmailReply(reply,f.ledger,f.gateway,f.verifyLocal)).rejects.toThrow('CREATE_UNCONFIRMED');
    f.gateway.findNotes.mockResolvedValue([99]); expect(await syncEmailReply(reply,f.ledger,f.gateway,f.verifyLocal)).toBe(99);
    expect(f.gateway.createReplyNote).toHaveBeenCalledTimes(1);
  });
  it('holds ambiguous notes and remote/local ownership changes without a create', async () => {
    const f = fixture(); f.gateway.findNotes.mockResolvedValue([98,99]);
    await expect(syncEmailReply(reply,f.ledger,f.gateway,f.verifyLocal)).rejects.toThrow('MULTIPLE_REMOTE_MATCHES');
    f.gateway.verifyReplyOwner.mockRejectedValue(new CrmError('REPLY_OWNER_CHANGED',true));
    await expect(syncEmailReply(reply,f.ledger,f.gateway,f.verifyLocal)).rejects.toThrow('REPLY_OWNER_CHANGED');
    f.gateway.verifyReplyOwner.mockResolvedValue(undefined); f.verifyLocal.mockRejectedValue(new CrmError('REPLY_BINDING_OR_LEASE_CHANGED',true));
    await expect(syncEmailReply(reply,f.ledger,f.gateway,f.verifyLocal)).rejects.toThrow('REPLY_BINDING_OR_LEASE_CHANGED');
    expect(f.gateway.createReplyNote).not.toHaveBeenCalled();
  });
  it('renders escaped text without private continuation tokens or raw HTML', () => {
    const note=replyNoteContent({...reply,bodyText:`<p>Casa & terreno</p> https://www.portugalactive.com/management/complete/#token=${'z'.repeat(43)}`});
    expect(note).toContain('Casa &amp; terreno'); expect(note).not.toContain('z'.repeat(43)); expect(note).not.toContain('/management/complete');
  });
  it('makes safe public links clickable and bounds the expanded HTML below the provider limit', () => {
    const content=replyNoteContent(reply); expect(content).toContain('<a href="https://airbnb.pt/rooms/123"');
    const worst=replyNoteContent({...reply,bodyText:'https://example.test/?q=&&&&&&&&&&&&&& '.repeat(500),subject:"'".repeat(500)});
    expect(Buffer.byteLength(worst,'utf8')).toBeLessThan(100000); expect(worst).not.toContain('href="https://example.test/?q=&&');
  });

  it('directs a reply without extractable text to the original Management email and associated attachments', () => {
    expect(replyNoteContent({...reply,bodyText:''})).toContain('Consulte o email original em management@portugalactive.com e os anexos associados.');
  });

});
