import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { readReceiptToken, receiptPath } from "../client/src/lib/receipt-access";
const token = "s".repeat(43);
afterEach(() => vi.unstubAllGlobals());

it("removes the private fragment before analytics starts, retaining access for a reload", () => {
  const html = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  expect(html.indexOf(script)).toBeLessThan(html.indexOf("function loadGTM"));
  const values = new Map<string, string>();
  const context = { location: { pathname: "/pt/booking/thank-you/synthetic", search: "?method=card", hash: `#receipt=${token}` },
    window: {} as any, URLSearchParams, sessionStorage: { setItem: (key: string, value: string) => values.set(key, value) },
    history: { state: null, replaceState: vi.fn() } };
  runInNewContext(script, context);
  expect(context.history.replaceState).toHaveBeenCalledWith(null, "", "/pt/booking/thank-you/synthetic?method=card");
  expect(context.window.__PA_RECEIPTS.synthetic).toBe(token);
  expect(values.get("receipt_access_synthetic")).toBe(token);
});
it("keeps a new payment's proof if session storage is unavailable", () => {
  const window = { __PA_RECEIPTS: {}, location: { hash: "", pathname: "/booking/thank-you/synthetic", search: "" }, history: { replaceState: vi.fn() } };
  vi.stubGlobal("window", window);
  vi.stubGlobal("sessionStorage", { setItem: () => { throw new Error("disabled"); }, getItem: () => { throw new Error("disabled"); } });
  expect(receiptPath("synthetic", "card", token)).toContain(`#receipt=${token}`);
  expect(readReceiptToken("synthetic")).toBe(token);
  expect(readReceiptToken("other")).toBeUndefined();
});
