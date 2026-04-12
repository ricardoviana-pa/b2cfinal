/**
 * Bókun API client.
 * - HMAC-SHA1 request signing per Bókun auth spec
 * - Structured logs (method, endpoint, status, duration)
 * - Graceful no-op when credentials are not configured
 */

import crypto from "node:crypto";

type BokunMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const BOKUN_BASE_URL = "https://api.bokun.io";
const BOKUN_ACCESS_KEY = process.env.BOKUN_ACCESS_KEY || "";
const BOKUN_SECRET_KEY = process.env.BOKUN_SECRET_KEY || "";
const BOKUN_VENDOR_ID = process.env.BOKUN_VENDOR_ID || "";
const BOKUN_TIMEOUT_MS = 10_000;

export function isBokunConfigured(): boolean {
  return !!(BOKUN_ACCESS_KEY && BOKUN_SECRET_KEY && BOKUN_VENDOR_ID);
}

export class BokunClientError extends Error {
  status: number;
  method: BokunMethod;
  endpoint: string;
  details: unknown;

  constructor(input: {
    message: string;
    status: number;
    method: BokunMethod;
    endpoint: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "BokunClientError";
    this.status = input.status;
    this.method = input.method;
    this.endpoint = input.endpoint;
    this.details = input.details ?? null;
  }
}

function buildSignature(date: string, accessKey: string, secretKey: string, method: BokunMethod, path: string): string {
  const message = `${date}${accessKey}${method}${path}`;
  return crypto.createHmac("sha1", secretKey).update(message).digest("base64");
}

function bokunDate(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "");
}

class BokunClient {
  private async request<T>(method: BokunMethod, path: string, body?: unknown): Promise<T> {
    if (!isBokunConfigured()) {
      throw new BokunClientError({
        message: "Bókun is not configured. Set BOKUN_ACCESS_KEY, BOKUN_SECRET_KEY, and BOKUN_VENDOR_ID.",
        status: 503,
        method,
        endpoint: path,
      });
    }

    const date = bokunDate();
    const signature = buildSignature(date, BOKUN_ACCESS_KEY, BOKUN_SECRET_KEY, method, path);
    const url = `${BOKUN_BASE_URL}${path}`;
    const start = Date.now();

    const headers: Record<string, string> = {
      "X-Bokun-Date": date,
      "X-Bokun-AccessKey": BOKUN_ACCESS_KEY,
      "X-Bokun-Signature": signature,
      "Accept": "application/json",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BOKUN_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const duration = Date.now() - start;

      console.info(JSON.stringify({
        source: "bokun.client",
        method,
        path,
        status: res.status,
        durationMs: duration,
      }));

      if (!res.ok) {
        let details: unknown = null;
        try {
          details = await res.json();
        } catch {
          details = await res.text().catch(() => null);
        }
        throw new BokunClientError({
          message: `Bókun API error: ${method} ${path} → ${res.status}`,
          status: res.status,
          method,
          endpoint: path,
          details,
        });
      }

      return res.json() as Promise<T>;
    } catch (err) {
      if (err instanceof BokunClientError) throw err;
      const duration = Date.now() - start;
      console.error(JSON.stringify({
        source: "bokun.client.error",
        method,
        path,
        durationMs: duration,
        error: (err as Error).message,
      }));
      throw new BokunClientError({
        message: `Bókun request failed: ${(err as Error).message}`,
        status: 0,
        method,
        endpoint: path,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** List all vendor activities */
  async getActivities(): Promise<any[]> {
    const data = await this.request<any>("GET", `/activity.json/vendor/${BOKUN_VENDOR_ID}/list`);
    return Array.isArray(data) ? data : data?.results ?? data?.items ?? [];
  }

  /** Single activity details */
  async getActivity(activityId: number): Promise<any> {
    return this.request<any>("GET", `/activity.json/${activityId}`);
  }

  /** Available time slots + capacity for a single date */
  async getAvailability(activityId: number, date: string): Promise<any> {
    return this.request<any>("GET", `/activity.json/${activityId}/availabilities?startDate=${date}&endDate=${date}`);
  }

  /** Range availability across multiple dates */
  async getAvailabilities(activityId: number, startDate: string, endDate: string): Promise<any> {
    return this.request<any>("GET", `/activity.json/${activityId}/availabilities?startDate=${startDate}&endDate=${endDate}`);
  }

  /** Price breakdown for a given date + participant counts */
  async getPricing(
    activityId: number,
    date: string,
    participants: { adults: number; children?: number }
  ): Promise<any> {
    const body = {
      date,
      activityId,
      passengers: [
        { passengerType: "ADULT", count: participants.adults },
        ...(participants.children
          ? [{ passengerType: "CHILD", count: participants.children }]
          : []),
      ],
    };
    return this.request<any>("POST", "/activity.json/pricing", body);
  }

  /** Create a booking reservation */
  async createBooking(params: {
    activityId: number;
    date: string;
    timeSlot: string;
    participants: { adults: number; children?: number };
    customer: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    };
  }): Promise<any> {
    const body = {
      activityId: params.activityId,
      startDate: params.date,
      startTime: params.timeSlot,
      passengers: [
        { passengerType: "ADULT", count: params.participants.adults },
        ...(params.participants.children
          ? [{ passengerType: "CHILD", count: params.participants.children }]
          : []),
      ],
      customer: {
        firstName: params.customer.firstName,
        lastName: params.customer.lastName,
        email: params.customer.email,
        phoneNumber: params.customer.phone,
      },
    };
    return this.request<any>("POST", "/booking.json/activity-booking", body);
  }

  /** Retrieve booking details */
  async getBooking(bookingId: number): Promise<any> {
    return this.request<any>("GET", `/booking.json/${bookingId}`);
  }
}

export const bokunClient = new BokunClient();
