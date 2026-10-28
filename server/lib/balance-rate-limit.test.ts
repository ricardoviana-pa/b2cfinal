import { describe, expect, it, vi } from "vitest";
import { balanceTrpcLimiter, isBalanceTrpcPath } from "./balance-rate-limit";

describe("isBalanceTrpcPath", () => {
  it("apanha os procedimentos do saldo, com ou sem o prefixo /api/trpc", () => {
    expect(isBalanceTrpcPath("/api/trpc/balance.view")).toBe(true);
    expect(isBalanceTrpcPath("/api/trpc/balance.resendLink")).toBe(true);
    expect(isBalanceTrpcPath("/api/trpc/balance.help")).toBe(true);
    // Montado em /api/trpc, o Express passa o caminho relativo.
    expect(isBalanceTrpcPath("/balance.view")).toBe(true);
    expect(isBalanceTrpcPath("balance.finishCardChange")).toBe(true);
  });

  it("batch: basta um procedimento do saldo (vírgula crua ou %2C)", () => {
    expect(isBalanceTrpcPath("/api/trpc/checkout.getIntent,balance.view")).toBe(true);
    expect(isBalanceTrpcPath("/api/trpc/checkout.getIntent%2Cbalance.help")).toBe(true);
    expect(isBalanceTrpcPath("/balance.view,balance.help")).toBe(true);
  });

  it("um segmento a mais não passa ao lado: o tRPC lê o procedimento depois da última /", () => {
    expect(isBalanceTrpcPath("/api/trpc/x/balance.help")).toBe(true);
    expect(isBalanceTrpcPath("/x/balance.view")).toBe(true);
    expect(isBalanceTrpcPath("/a/b/checkout.getIntent,balance.resendLink")).toBe(true);
    expect(isBalanceTrpcPath("/balance.x/checkout.getIntent")).toBe(false);
  });

  it("ignora a query string (o batch do tRPC leva ?batch=1&input=…)", () => {
    expect(isBalanceTrpcPath("/api/trpc/balance.view?batch=1")).toBe(true);
    expect(isBalanceTrpcPath("/api/trpc/checkout.x?input=balance.view")).toBe(false);
  });

  it("não apanha outros routers, nem o admin do saldo", () => {
    expect(isBalanceTrpcPath("/api/trpc/checkout.createIntent")).toBe(false);
    expect(isBalanceTrpcPath("/api/trpc/balanceAdmin.list")).toBe(false);
    expect(isBalanceTrpcPath("/api/trpc/balanceAdmin.detail,balanceAdmin.list")).toBe(false);
    expect(isBalanceTrpcPath("/api/trpc/booking.quote")).toBe(false);
    expect(isBalanceTrpcPath("/api/trpc")).toBe(false);
    expect(isBalanceTrpcPath("")).toBe(false);
    expect(isBalanceTrpcPath(undefined)).toBe(false);
  });

  it("codificação inválida não lança", () => {
    expect(isBalanceTrpcPath("/api/trpc/balance.view%E0%A4%A")).toBe(true);
    expect(isBalanceTrpcPath("/api/trpc/%E0%A4%A")).toBe(false);
  });
});

describe("balanceTrpcLimiter", () => {
  it("só passa pelo limitador os pedidos do saldo", () => {
    const limiter = vi.fn((_req: any, _res: any, next: any) => next());
    const mw = balanceTrpcLimiter(limiter as any);
    const next = vi.fn();
    mw({ path: "/balance.view" } as any, {} as any, next);
    expect(limiter).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    mw({ path: "/checkout.createIntent" } as any, {} as any, next);
    expect(limiter).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
