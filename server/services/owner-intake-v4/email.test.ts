import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { managementCompletedMail, managementMediaMail, managementStartMail, sendV4Mail, welcomeMail } from "./email";
import { ownerNotificationMail } from "../owner-intake/email";
import { syntheticOwner } from "../owner-intake/__tests__/fixtures";
import { detailsInput, recordInput, SYNTHETIC_TOKEN } from "./fixtures.test-utils";
const transport = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", transport); transport.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: "synthetic-provider" })));
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_ENV", "production"); vi.stubEnv("RENDER_GIT_BRANCH", "main");
  vi.stubEnv("RENDER_SERVICE_ID", "srv-d700n5fgi27c73f9bse0"); vi.stubEnv("RESEND_API_KEY", "synthetic-key");
  vi.stubEnv("EMAIL_FROM", "Portugal Active <sender@example.invalid>");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const url = `https://www.portugalactive.com/management/complete/?lang=pt#token=${SYNTHETIC_TOKEN}`;
describe("v4 branded transactional messages", () => {
  it("uses the dedicated management sender for every v4 event without changing the booking sender", async () => {
    const bookingSender = "Portugal Active <booking@portugalactive.com>";
    vi.stubEnv("EMAIL_FROM", bookingSender);
    const r = recordInput(); r.details = detailsInput(); r.status = "awaiting_photos";
    const messages = [welcomeMail(r, url), managementStartMail(r), managementCompletedMail(r, []), managementMediaMail(r, [], "photos")];
    for (const message of messages) {
      expect(message.from).toBe("Portugal Active · Management <management@portugalactive.com>");
      await sendV4Mail(`synthetic-sender-${messages.indexOf(message)}`, message, []);
    }
    for (const [, request] of transport.mock.calls) {
      expect(JSON.parse(request.body).from).toBe("Portugal Active · Management <management@portugalactive.com>");
      expect(JSON.parse(request.body).from).not.toContain("booking@");
    }
    expect(process.env.EMAIL_FROM).toBe(bookingSender);
    expect(ownerNotificationMail(syntheticOwner(), []).from).toBe(bookingSender);
    expect(messages[0].to).toBe(r.contact.email); expect(messages[0].replyTo).toBe("management@portugalactive.com");
    expect(messages[1].to).toBe("management@portugalactive.com"); expect(messages[1].replyTo).toBe(r.contact.email);
  });
  it.each(["pt", "en", "fr", "de", "nl", "es", "it", "he", "ar", "zh"])("welcomes the owner in %s with the private continuation link", language => {
    const r = recordInput(); r.context.language = language; const mail = welcomeMail(r, url);
    expect(mail.to).toBe(r.contact.email); expect(mail.replyTo).toBe("management@portugalactive.com");
    expect(mail.html).toContain('pa-logo-dark.png'); expect(mail.html).toContain(`lang="${language}"`);
    expect(mail.text).toContain(url); expect(mail.html).toContain("PORTUGAL ACTIVE"); expect(mail.text).toContain("30");
    if (["ar", "he"].includes(language)) expect(mail.html).toContain('dir="rtl"');
    expect(new URL(url).searchParams.has("token")).toBe(false);
  });
  it("never discloses the private link in management mail or invents missing answers", () => {
    const r = recordInput(); const mail = managementStartMail(r);
    expect(mail.to).toBe("management@portugalactive.com"); expect(mail.replyTo).toBe(r.contact.email);
    expect(mail.text).toContain("informação da casa por completar"); expect(mail.text).not.toContain("30.000");
    expect(mail.text).not.toContain(SYNTHETIC_TOKEN); expect(mail.html).not.toContain("#token=");
    expect(mail.text).toContain("isolated-test");
    expect(mail.text).toContain("Novo pedido. As atualizações seguintes mantêm esta referência.");
    expect(mail.text).toContain("pode ainda estar a preencher");
    expect(mail.text).toContain("Informação em falta: Morada"); expect(mail.html).not.toContain("Por preencher");
  });
  it("explains that images are needed for assessment without asking a completed owner to repeat them", () => {
    const mail = welcomeMail(recordInput(), url);
    expect(mail.text).toContain("precisamos de fotografias ou de um link");
    expect(mail.text).toContain("apenas o envio de fotografias, sem repetir o formulário");
    expect(mail.text).toContain("não precisa repetir"); expect(mail.text).toContain("Enviar fotografias");
    expect(mail.text).not.toMatch(/consultar|acompanhar|Completar ou/);
    expect(mail.html.match(/<a /g)).toHaveLength(1);
  });
  it("completes the same reference, retains all details and clearly distinguishes optional photos", () => {
    const r = recordInput(); r.details = detailsInput(); r.status = "awaiting_photos";
    r.contact.name = "<script>synthetic</script>";
    const mail = managementCompletedMail(r, []);
    for (const value of [r.id, "4900-123", "30.000–60.000 €", "Localidade sintética", "isolated-test", "Aguarda fotografias · avaliação por iniciar"])
      expect(mail.text).toContain(value);
    expect(mail.html).not.toContain("<script>"); expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain("#token="); expect(mail.subject).toContain(r.id.slice(0, 8).toUpperCase());
    expect(mail.text).toContain("Expectativa líquida anual do proprietário");
  });
  it("keeps assessment pending for a PDF-only submission and requires checking image sufficiency", () => {
    const r = recordInput(); r.details = detailsInput(); r.status = "awaiting_photos";
    expect(managementCompletedMail(r, [{ name: "synthetic.pdf", mimeType: "application/pdf" }]).text).toContain("avaliação por iniciar");
    r.status = "complete";
    expect(managementCompletedMail(r, [{ name: "synthetic.png", mimeType: "image/png" }]).text).toContain("confirmar suficiência antes de avaliar");
  });
  it("keeps one request subject and clearly identifies each notice, status, next action and snapshot version", () => {
    const r = recordInput(); r.revision = 4;
    const captured = managementStartMail(r);
    const photos = managementMediaMail(r, [{ name: "casa.png", mimeType: "image/png" }], "photos");
    const documents = managementMediaMail(r, [{ name: "planta.pdf", mimeType: "application/pdf" }], "documents");
    expect(photos.subject).toBe(captured.subject); expect(documents.subject).toBe(captured.subject);
    expect(photos.text).toContain("Fotografias recebidas"); expect(documents.text).toContain("Documentos recebidos");
    expect(photos.text).toContain("Imagens recebidas · informação da casa por completar");
    expect(photos.text).toContain("Próxima ação:"); expect(photos.text).toContain("Versão do pedido 4");
    expect(photos.text).toContain("use a versão mais alta"); expect(photos.text).toContain("qualidade ou suficiência");
    expect(photos.html).toContain("pa-logo-dark.png"); expect(photos.html).not.toContain("#token=");
    expect(documents.text).toContain("Fotografias em falta"); expect(documents.html).not.toContain("Por preencher");
  });
  it("retries the same frozen body/key and respects provider Retry-After", async () => {
    const mail = welcomeMail(recordInput(), url);
    await sendV4Mail("synthetic-welcome", mail, []); await sendV4Mail("synthetic-welcome", mail, []);
    expect(transport.mock.calls[0][1].body).toBe(transport.mock.calls[1][1].body);
    expect(transport.mock.calls[0][1].headers["Idempotency-Key"]).toBe("owner-v4-synthetic-welcome");
    transport.mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "600" } }));
    await expect(sendV4Mail("synthetic-welcome", mail, [])).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED", retryAfterSeconds: 600, permanent: false });
  });
  it("halts permanent provider rejections for review and never sends in preview", async () => {
    const mail = welcomeMail(recordInput(), url);
    transport.mockResolvedValueOnce(new Response("{}", { status: 422 }));
    await expect(sendV4Mail("synthetic-welcome", mail, [])).rejects.toMatchObject({ permanent: true });
    transport.mockClear(); vi.stubEnv("APP_ENV", "preview");
    await expect(sendV4Mail("synthetic-welcome", mail, [])).rejects.toThrow("EMAIL_UNAVAILABLE");
    expect(transport).not.toHaveBeenCalled();
  });
  it("keeps daily quota exhaustion queued until after the next UTC reset", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2099-01-01T01:00:00Z"));
    try {
      transport.mockResolvedValueOnce(new Response(JSON.stringify({ name: "daily_quota_exceeded" }), { status: 429 }));
      await expect(sendV4Mail("synthetic-quota", welcomeMail(recordInput(), url), [])).rejects.toMatchObject({
        code: "PROVIDER_DAILY_QUOTA", retryAfterSeconds: 23 * 3600 + 60, confirmedRejected: true, permanent: false });
    } finally { vi.useRealTimers(); }
  });
});
