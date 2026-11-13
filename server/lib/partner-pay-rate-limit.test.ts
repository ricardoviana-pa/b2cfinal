import { describe, expect, it, vi } from "vitest";
import { isPartnerPayTrpcPath, partnerPayTrpcLimiter } from "./partner-pay-rate-limit";

describe("isPartnerPayTrpcPath", () => {
  it("apanha os dois procedimentos do pagamento, sozinhos ou num batch, com ou sem prefixo", () => {
    expect(isPartnerPayTrpcPath("/api/trpc/booking.partnerPayStart")).toBe(true);
    expect(isPartnerPayTrpcPath("/booking.partnerPayStatus")).toBe(true);
    expect(isPartnerPayTrpcPath("/booking.partnerQuote,booking.partnerPayStart")).toBe(true);
    expect(isPartnerPayTrpcPath("/booking.partnerQuote%2Cbooking.partnerPayStatus?input=x")).toBe(true);
    expect(isPartnerPayTrpcPath("/x/booking.partnerPayStart")).toBe(true);
  });

  it("deixa passar o resto da API das reservas e os outros routers", () => {
    expect(isPartnerPayTrpcPath("/booking.partnerQuote")).toBe(false);
    expect(isPartnerPayTrpcPath("/booking.partnerCalendar,booking.partnerPrices")).toBe(false);
    expect(isPartnerPayTrpcPath("/leads.create")).toBe(false);
    expect(isPartnerPayTrpcPath("/booking.partnerPayStart/booking.partnerQuote")).toBe(false);
    expect(isPartnerPayTrpcPath(undefined)).toBe(false);
  });
});

describe("partnerPayTrpcLimiter", () => {
  it("só conta os pedidos do pagamento", () => {
    const limiter = vi.fn((_req: any, _res: any, next: any) => next());
    const mw = partnerPayTrpcLimiter(limiter as any);
    const next = vi.fn();
    mw({ path: "/booking.partnerPayStart" } as any, {} as any, next);
    mw({ path: "/booking.partnerQuote" } as any, {} as any, next);
    expect(limiter).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
