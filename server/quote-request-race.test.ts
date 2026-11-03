import { describe, expect, it } from "vitest";
import { QuoteRequestGate } from "../client/src/lib/quoteRequest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("quotes only update the stay they were requested for", () => {
  it("a response during the new guest selection's debounce cannot show the old price or cancel the new request", async () => {
    const gate = new QuoteRequestGate();
    const twoGuests = deferred<number>();
    const current = gate.begin("home|2027-05-10|2027-05-17|2");
    const screen = { price: null as number | null, step: "dates" };
    const response = twoGuests.promise.then(price => {
      if (!current()) return;
      screen.price = price;
      screen.step = "quote";
    });
    // The guest changes to four. The new fetch has not begun yet (450 ms).
    gate.select("home|2027-05-10|2027-05-17|4");
    twoGuests.resolve(1000);
    await response;
    expect(screen).toEqual({ price: null, step: "dates" });
    const fourGuests = gate.begin("home|2027-05-10|2027-05-17|4");
    if (fourGuests()) { screen.price = 1200; screen.step = "quote"; }
    expect(screen).toEqual({ price: 1200, step: "quote" });
  });

  it("an older checkout refresh cannot overwrite a newer price or clear its loading state", async () => {
    const gate = new QuoteRequestGate();
    const old = deferred<number>();
    const next = deferred<number>();
    const screen = { price: null as number | null, loading: true };
    const read = async (request: ReturnType<typeof deferred<number>>, key: string) => {
      const current = gate.begin(key);
      try {
        const price = await request.promise;
        if (current()) screen.price = price;
      } finally {
        if (current()) screen.loading = false;
      }
    };
    const first = read(old, "2027-05-10|2027-05-17|2");
    const second = read(next, "2027-06-10|2027-06-17|2");
    old.resolve(1000);
    await first;
    expect(screen).toEqual({ price: null, loading: true });
    next.resolve(1500);
    await second;
    expect(screen).toEqual({ price: 1500, loading: false });
  });

  it("a late failure on an abandoned selection does not replace the confirmed price with an error", async () => {
    const gate = new QuoteRequestGate();
    const old = deferred<number>();
    const current = gate.begin("old stay");
    let error = false;
    const response = old.promise.catch(() => { if (current()) error = true; });
    gate.select("new stay");
    old.reject(new Error("timeout"));
    await response;
    expect(error).toBe(false);
  });

  it("returning to the same dates does not revive the first request or its scheduled retry", () => {
    const gate = new QuoteRequestGate();
    const first = gate.begin("stay A");
    gate.select("stay B");
    gate.select("stay A");
    expect(first()).toBe(false);
    const retry = gate.begin("stay A");
    gate.invalidate(); // page left before retry fires
    expect(retry()).toBe(false);
  });

  it("a late coupon cannot overwrite the price of a newly selected stay", async () => {
    const quotes = new QuoteRequestGate();
    quotes.begin("stay A");
    const coupon = deferred<number>();
    const quoteStillCurrent = quotes.capture();
    let total = 1000;
    const response = coupon.promise.then(discounted => { if (quoteStillCurrent()) total = discounted; });
    const next = quotes.begin("stay B");
    if (next()) total = 1500;
    coupon.resolve(900);
    await response;
    expect(total).toBe(1500);
  });

  it("Reserve cannot navigate to the old intent after dates or guests change", async () => {
    const quotes = new QuoteRequestGate();
    quotes.begin("home|dates|2");
    const intent = deferred<string>();
    const selectionStillCurrent = quotes.capture();
    let destination = "property";
    const response = intent.promise.then(id => { if (selectionStillCurrent()) destination = `/checkout/${id}`; });
    quotes.select("home|dates|4");
    intent.resolve("old-two-guest-intent");
    await response;
    expect(destination).toBe("property");
  });
});
