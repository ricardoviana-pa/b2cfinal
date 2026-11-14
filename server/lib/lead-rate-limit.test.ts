import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { leadCreateCalls, leadTrpcLimiter } from "./lead-rate-limit";

describe("leadCreateCalls", () => {
  it("conta o formulário sozinho ou num batch, com ou sem prefixo", () => {
    expect(leadCreateCalls("/api/trpc/leads.create")).toBe(1);
    expect(leadCreateCalls("/leads.create?batch=1")).toBe(1);
    expect(leadCreateCalls("/properties.localities,leads.create")).toBe(1);
    expect(leadCreateCalls("/properties.localities%2Cleads.create?batch=1&input=x")).toBe(1);
    expect(leadCreateCalls("/leads.create,leads.create,leads.create")).toBe(3);
  });

  it("não conta o resto da API", () => {
    expect(leadCreateCalls("/leads.list")).toBe(0);
    expect(leadCreateCalls("/booking.getQuote,checkout.promoBanner")).toBe(0);
    expect(leadCreateCalls("/leads.create/booking.getQuote")).toBe(0);
    expect(leadCreateCalls(undefined)).toBe(0);
  });
});

describe("leadTrpcLimiter", () => {
  const res = () => {
    const r: any = { status: vi.fn(() => r), json: vi.fn(() => r) };
    return r;
  };

  it("só conta os pedidos que enviam um formulário", () => {
    const limiter = vi.fn((_req: any, _res: any, next: any) => next());
    const mw = leadTrpcLimiter(limiter as any);
    const next = vi.fn();
    mw({ path: "/leads.create" } as any, res(), next);
    mw({ path: "/properties.localities,leads.create" } as any, res(), next);
    mw({ path: "/booking.getQuote" } as any, res(), next);
    expect(limiter).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("recusa um pedido com vários formulários, sem chegar à API", () => {
    const limiter = vi.fn((_req: any, _res: any, next: any) => next());
    const next = vi.fn();
    const r = res();
    leadTrpcLimiter(limiter as any)({ path: "/leads.create,leads.create" } as any, r, next);
    expect(r.status).toHaveBeenCalledWith(429);
    expect(limiter).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("o servidor monta o limite pelo nome do procedimento, não pelo caminho exato", () => {
    const index = fs.readFileSync("server/_core/index.ts", "utf8");
    expect(index).toMatch(/app\.use\("\/api\/trpc", leadTrpcLimiter\(leadLimiter\)\)/);
    expect(index).not.toMatch(/app\.use\("\/api\/trpc\/leads\.create"/);
  });
});
