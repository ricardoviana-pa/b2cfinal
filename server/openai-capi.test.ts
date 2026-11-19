import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOpenAICapiBody, sendOpenAIEvent, type OpenAICapiEvent } from "./services/openai-capi";

const event: OpenAICapiEvent = {
  eventName: "order_created", eventId: "GY-TEST", value: 1840.5,
  currency: "eur", contentId: "PROP-guesty-test", contentName: "Casa",
  signals: { fbp: "meta-only", fbc: null, userAgent: "test", clientIp: null,
    oppref: "click-test", obref: "browser-test", openaiMeasurement: true },
};

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("OpenAI CAPI", () => {
  it("uses the shared id, EUR cents and OpenAI attribution only", () => {
    vi.stubEnv("OPENAI_CAPI_VALIDATE_ONLY", "false");
    const body = buildOpenAICapiBody(event, 123);
    expect(body.events[0]).toMatchObject({
      id: "GY-TEST", type: "order_created", timestamp_ms: 123,
      oppref: "click-test", user: { obref: "browser-test" },
      data: { amount: 184050, currency: "EUR", contents: [{ id: "test" }] },
    });
    expect(JSON.stringify(body)).not.toContain("meta-only");
  });

  it("omits missing/invalid amounts and supports checkout", () => {
    const body = buildOpenAICapiBody({ ...event, eventName: "checkout_started", value: 0 });
    expect(body.events[0].type).toBe("checkout_started");
    expect(body.events[0].data).not.toHaveProperty("amount");
  });

  it("fails closed without explicit enablement, credentials or consent; validates without saving", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENAI_CAPI_ENABLED", "false");
    vi.stubEnv("OPENAI_ADS_PIXEL_ID", "pixel");
    vi.stubEnv("OPENAI_CONVERSIONS_API_KEY", "secret");
    await sendOpenAIEvent(event);
    vi.stubEnv("OPENAI_CAPI_ENABLED", "true");
    await sendOpenAIEvent({ ...event, signals: null });
    await sendOpenAIEvent({ ...event, signals: { ...event.signals!, openaiMeasurement: false } });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("OPENAI_CAPI_VALIDATE_ONLY", "true");
    await sendOpenAIEvent(event);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://bzr.openai.com/v1/events?pid=pixel");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).validate_only).toBe(true);
    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith("[OpenAI CAPI] order_created validated successfully");
  });
});
