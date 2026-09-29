import { describe, expect, it, vi } from "vitest";
import { countLimitedCalls, newsletterRateGuard, trpcProcedures } from "./newsletter-rate-limit";

const run = (path: string) => {
  const limiter = vi.fn((_req, _res, next) => next());
  const next = vi.fn();
  const res: any = { status: vi.fn(() => res), json: vi.fn(() => res) };
  newsletterRateGuard(limiter as any)({ path } as any, res, next);
  return { limiter, next, res };
};

describe("newsletter rate limit inside tRPC batches", () => {
  it("reads the procedures of a batched path", () => {
    expect(trpcProcedures("/newsletter.subscribe,properties.list")).toEqual(["newsletter.subscribe", "properties.list"]);
    expect(trpcProcedures("/newsletter.subscribe%2Cnewsletter.subscribe")).toEqual(["newsletter.subscribe", "newsletter.subscribe"]);
    expect(countLimitedCalls("/newsletter.subscribe,newsletter.interest")).toBe(1);
  });

  it("limits a single sign-up, alone or batched with other procedures", () => {
    expect(run("/newsletter.subscribe").limiter).toHaveBeenCalledTimes(1);
    expect(run("/properties.list,newsletter.subscribe").limiter).toHaveBeenCalledTimes(1);
    expect(run("/newsletter.interest").limiter).toHaveBeenCalledTimes(1);
  });

  it("refuses a batch with the same mutation twice", () => {
    const { limiter, next, res } = run("/newsletter.subscribe,newsletter.subscribe");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(limiter).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("leaves every other request alone", () => {
    const { limiter, next } = run("/properties.list,newsletter.config");
    expect(limiter).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
