import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ownerNotificationMail, sendOwnerNotification } from "./email";
import { validateLegacyOwnerIntake, validateOwnerIntake } from "./validation";
import { syntheticOwner } from "./__tests__/fixtures";

const transport = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", transport);
  transport.mockReset().mockResolvedValue(new Response(JSON.stringify({ id: "synthetic-provider-id" }), { status: 200 }));
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("RENDER_SERVICE_ID", "srv-d700n5fgi27c73f9bse0"); vi.stubEnv("RENDER_GIT_BRANCH", "main");
  vi.stubEnv("SITE_URL", "https://www.portugalactive.com"); vi.stubEnv("RESEND_API_KEY", "synthetic-mocked-key");
  vi.stubEnv("EMAIL_FROM", "Portugal Active <sender@example.invalid>");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("single structured management notification", () => {
  it("contains every qualification answer, escaped HTML, clickable photo/contact links, and no portal", () => {
    const input = { ...syntheticOwner(), name: "<script>Synthetic</script>", description: "Synthetic description <img src=x onerror=alert(1)>",
      photoMethod: "link", photosLink: "https://example.invalid/photos?q=one&other=two", licenseNumber: "Synthetic license", occupiedDetails: "Synthetic detail" };
    const mail = ownerNotificationMail(validateOwnerIntake(input).fields, []);
    expect(mail.to).toBe("management@portugalactive.com"); expect(mail.replyTo).toBe(input.email);
    expect(mail.html).toContain("&lt;script&gt;"); expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain('href="https://example.invalid/photos?q=one&amp;other=two"');
    expect(mail.html).toContain('href="mailto:owner@example.invalid"');
    expect(mail.html).toContain('href="tel:+351900000000"');
    for (const value of ["4900-123", "Moradia", "3 meses", "30.000–60.000 €", "rendimento", "Synthetic license", "Synthetic detail", "Já operou", "licença", "Vive alguém", "à venda", "Interesse em vender", "líquido anual", "Sem ficheiros anexados"])
      expect(mail.text.toLowerCase()).toContain(value.toLowerCase());
    expect(mail.html).not.toContain("sales/owners");
    expect(mail.html).not.toContain("enviará mais tarde");
    expect(mail).not.toHaveProperty("cc"); expect(mail).not.toHaveProperty("bcc");
  });
  it("marks an old form incomplete without fabricated choices", () => {
    const mail = ownerNotificationMail(validateLegacyOwnerIntake({ name: "Synthetic", email: "old@example.invalid", address: "Synthetic property", type: "villa", bedrooms: "2" }).fields, []);
    expect(mail.subject).toContain("Qualificação pendente"); expect(mail.text).toContain("não foram recolhidos");
    expect(mail.text).not.toContain("30.000");
  });
  it("uses the official PNG logo with readable branding when images are blocked", () => {
    const mail = ownerNotificationMail(validateOwnerIntake(syntheticOwner()).fields, []);
    expect(mail.html).toContain('src="https://www.portugalactive.com/brand/pa-logo-dark.png"');
    expect(mail.html).toContain('alt="Portugal Active"');
    expect(mail.html).toContain("PORTUGAL ACTIVE · EQUIPA COMERCIAL");
    expect(mail.html).toContain('width="166" height="104"');
    expect(mail.html).not.toMatch(/<script|<iframe|<form/i);
  });
  it("puts qualification before detailed copy without repeating a long description", () => {
    const input = { ...syntheticOwner(), description: "A unique synthetic description that should appear only once in HTML.", forSale: "yes", saleInterest: "yes" };
    const mail = ownerNotificationMail(validateOwnerIntake(input).fields, []);
    expect(mail.html.indexOf("Entrada no mercado")).toBeLessThan(mail.html.indexOf("Contacto do proprietário"));
    expect(mail.html.indexOf("Contacto do proprietário")).toBeLessThan(mail.html.indexOf("Sobre a casa"));
    expect(mail.html.split(input.description)).toHaveLength(2);
    expect(mail.html).toContain("À venda: Sim");
    expect(mail.html).toContain("Interesse em vender com a PA: Sim");
    expect(mail.html).not.toContain("Número de licença:");
    expect(mail.html).not.toContain("Ocupação — detalhes:");
  });
  it("keeps optional photos neutral and attachment names readable and escaped", () => {
    const noPhotos = ownerNotificationMail(validateOwnerIntake(syntheticOwner()).fields, []);
    expect(noPhotos.text).toContain("Sem fotografias ou documentos — envio opcional");
    expect(noPhotos.text).not.toMatch(/pretende enviar|enviará mais tarde/i);
    const withFiles = ownerNotificationMail(validateOwnerIntake(syntheticOwner()).fields, ["Planta & áreas.pdf", "Piscina <exemplo>.jpg"]);
    expect(withFiles.html).toContain("Planta &amp; áreas.pdf");
    expect(withFiles.html).toContain("Piscina &lt;exemplo&gt;.jpg");
    expect(withFiles.text).toContain("Planta & áreas.pdf, Piscina <exemplo>.jpg");
  });
  it("sends real bounded file bytes only to management, with stable provider idempotency and a timeout", async () => {
    transport.mockImplementation(async () => new Response(JSON.stringify({ id: "synthetic-provider-id" }), { status: 200 }));
    const input = validateOwnerIntake(syntheticOwner());
    const mail = ownerNotificationMail(input.fields, ["synthetic.pdf"]);
    const files = [{ name: "synthetic.pdf", mimeType: "application/pdf", content: Buffer.from("synthetic private bytes") }];
    expect(await sendOwnerNotification(input.fields.requestId, mail, files)).toBe("synthetic-provider-id");
    await sendOwnerNotification(input.fields.requestId, mail, files);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers["Idempotency-Key"]).toBe(`owner-enquiry-${input.fields.requestId}-team-v1`);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.body).toBe(transport.mock.calls[1][1].body);
    expect(JSON.parse(options.body)).toMatchObject({ to: "management@portugalactive.com", reply_to: input.fields.email,
      attachments: [{ filename: "synthetic.pdf", content_type: "application/pdf", content: files[0].content.toString("base64") }] });
  });
  it.each(["preview", "missing-key", "wrong-service", "development"])("never sends from %s", async mode => {
    if (mode === "preview") vi.stubEnv("APP_ENV", "preview");
    if (mode === "missing-key") vi.stubEnv("RESEND_API_KEY", "");
    if (mode === "wrong-service") vi.stubEnv("RENDER_SERVICE_ID", "synthetic-other-service");
    if (mode === "development") vi.stubEnv("NODE_ENV", "development");
    await expect(sendOwnerNotification(syntheticOwner().requestId, ownerNotificationMail(validateOwnerIntake(syntheticOwner()).fields, []), [])).rejects.toThrow("OWNER_EMAIL_UNAVAILABLE");
    expect(transport).not.toHaveBeenCalled();
  });
  it("treats provider rejection or missing acceptance ID as unconfirmed", async () => {
    const mail = ownerNotificationMail(validateOwnerIntake(syntheticOwner()).fields, []);
    transport.mockResolvedValueOnce(new Response(JSON.stringify({ message: "synthetic error" }), { status: 500 }));
    await expect(sendOwnerNotification(syntheticOwner().requestId, mail, [])).rejects.toThrow("OWNER_EMAIL_UNCONFIRMED");
    transport.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await expect(sendOwnerNotification(syntheticOwner().requestId, mail, [])).rejects.toThrow("OWNER_EMAIL_UNCONFIRMED");
  });
});
