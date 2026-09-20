import { createHmac, timingSafeEqual } from "node:crypto";

export function reservationAccessToken(id: string, secret = process.env.JWT_SECRET || ""): string {
  if (secret.length < 32 || !/^[\w-]{1,100}$/.test(id)) return "";
  return createHmac("sha256", secret).update(`booking-receipt:v1:${id}`).digest("base64url");
}

export function hasReservationAccess(id: string, token: unknown, secret = process.env.JWT_SECRET || ""): boolean {
  if (typeof token !== "string" || !/^[\w-]{43}$/.test(token)) return false;
  const expected = reservationAccessToken(id, secret);
  return !!expected && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function reservationReceiptPath(id: string, method = "card"): string {
  const token = reservationAccessToken(id);
  return `/booking/thank-you/${encodeURIComponent(id)}?method=${encodeURIComponent(method)}` +
    (token ? `#receipt=${token}` : "");
}
