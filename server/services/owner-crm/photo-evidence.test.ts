import { describe, expect, it } from "vitest";
import { crmFileHasPhotos, crmNoteHasPhotoLink } from "./photo-evidence";
describe("CRM evidence that photographs already exist", () => {
  it.each([{ file_type: "img", active_flag: true, inline_flag: false }, { mime_type: "image/jpeg" }, { name: "house.HEIC" }, { file_name: "garden.webp" }])("recognizes actual image file metadata %j", file => {
    expect(crmFileHasPhotos(file)).toBe(true);
  });
  it.each([{ file_type: "pdf", name: "photo.pdf" }, { file_type: "img", inline_flag: true }, { file_type: "img", active_flag: false }, { name: "contract.docx" }])("does not count deleted files, PDF documents or signatures %j", file => {
    expect(crmFileHasPhotos(file)).toBe(false);
  });
  it.each([
    '<p>Link de fotografias: <a href="https://example.com/owner-album?a=1&amp;b=2">Ver fotografias</a></p>',
    'Fotografias:\nhttps://www.portugalactive.com/pt/homes',
    '<p>Recebemos as fotos em https://drive.google.com/drive/folders/synthetic</p>',
    '<p>Fotos da casa em https://photos.app.goo.gl/synthetic</p>',
    '<p>As fotografias estão neste anúncio: https://www.airbnb.pt/rooms/123456789</p>',
    '<p>Fotos da propriedade: https://www.booking.com/hotel/pt/synthetic.pt-pt.html</p>',
  ])("recognizes photo-labelled submitted links or photo-context albums/listings: %s", note => {
    expect(crmNoteHasPhotoLink(note)).toBe(true);
  });
  it.each([
    '<p>Documentos do contrato https://drive.google.com/drive/folders/synthetic</p>',
    '<p>Fonte do contacto https://www.airbnb.pt/rooms/123456789</p>',
    '<p>Sem fotografias: https://drive.google.com/drive/folders/synthetic</p>',
    '<p>Solicitar fotos https://drive.google.com/drive/folders/synthetic</p>',
    '<p>Link de fotografias: https://www.portugalactive.com/management/complete/?lang=pt#token=synthetic-secret</p>',
    '<p>Link de fotografias: javascript:alert(1)</p>',
    '<p>Fotografias por pedir. Página: https://www.portugalactive.com/management/</p>',
  ])("ignores generic links, missing-photo notes and private upload CTAs: %s", note => {
    expect(crmNoteHasPhotoLink(note)).toBe(false);
  });
});
