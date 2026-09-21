declare global { interface Window { __PA_RECEIPTS?: Record<string, string>; } }
const key = (id: string) => `receipt_access_${id}`;

export function storeReceiptToken(id: string, token?: string) {
  if (typeof window === "undefined" || !token || !/^[\w-]{43}$/.test(token)) return;
  window.__PA_RECEIPTS ??= {};
  window.__PA_RECEIPTS[id] = token;
  try { sessionStorage.setItem(key(id), token); } catch { /* memory fallback */ }
}

export function readReceiptToken(id: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const token = new URLSearchParams(window.location.hash.slice(1)).get("receipt");
  if (token && /^[\w-]{43}$/.test(token)) {
    storeReceiptToken(id, token);
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }
  try { return window.__PA_RECEIPTS?.[id] || sessionStorage.getItem(key(id)) || undefined; }
  catch { return window.__PA_RECEIPTS?.[id]; }
}

export function receiptPath(id: string, method: string, token?: string) {
  storeReceiptToken(id, token);
  return `/booking/thank-you/${encodeURIComponent(id)}?method=${encodeURIComponent(method)}` +
    (token ? `#receipt=${encodeURIComponent(token)}` : "");
}
