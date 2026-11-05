import type { Request, RequestHandler } from "express";

const KiB = 1024;
const MiB = KiB * KiB;
export type OwnerBodyKind = "start" | "draft" | "file" | "v3" | "legacy" | "email_metadata" | "email_file" | "email_event";
type Lane = "small" | "media";
export interface OwnerBodyPolicy {
  format: "json" | "raw";
  maxBytes: number;
  memoryFactor: number;
  maxRequests: number;
  maxWindowBytes: number;
  timeoutMs: number;
  lane: Lane | "auto";
}
export const OWNER_BODY_POLICIES: Record<OwnerBodyKind, OwnerBodyPolicy> = {
  email_event: {
    format: "raw", maxBytes: 64 * KiB, memoryFactor: 8,
    maxRequests: 600, maxWindowBytes: 16 * MiB, timeoutMs: 15_000, lane: "small",
  },
  email_metadata: {
    format: "raw", maxBytes: 256 * KiB, memoryFactor: 8,
    maxRequests: 900, maxWindowBytes: 64 * MiB, timeoutMs: 15_000, lane: "small",
  },
  email_file: {
    format: "raw", maxBytes: 15 * MiB, memoryFactor: 3,
    maxRequests: 600, maxWindowBytes: 600 * MiB, timeoutMs: 60_000, lane: "media",
  },
  start: {
    format: "json",
    maxBytes: 16 * KiB,
    memoryFactor: 8,
    maxRequests: 300,
    maxWindowBytes: 16 * MiB,
    timeoutMs: 15_000,
    lane: "small",
  },
  draft: {
    format: "json",
    maxBytes: 32 * KiB,
    memoryFactor: 8,
    maxRequests: 900,
    maxWindowBytes: 32 * MiB,
    timeoutMs: 15_000,
    lane: "small",
  },
  file: {
    format: "raw",
    maxBytes: 5 * MiB,
    memoryFactor: 3,
    maxRequests: 600,
    maxWindowBytes: 180 * MiB,
    timeoutMs: 60_000,
    lane: "media",
  },
  // Retained for already-loaded forms. JSON/base64 parsing needs substantially
  // more memory than the binary v4 route; it must share the same media pool.
  v3: {
    format: "json",
    maxBytes: 21 * MiB,
    memoryFactor: 8,
    maxRequests: 60,
    maxWindowBytes: 180 * MiB,
    timeoutMs: 60_000,
    lane: "auto",
  },
  legacy: {
    format: "json",
    maxBytes: 50 * KiB,
    memoryFactor: 8,
    maxRequests: 60,
    maxWindowBytes: 3 * MiB,
    timeoutMs: 15_000,
    lane: "small",
  },
};
export interface OwnerAdmissionLimits {
  windowMs: number;
  smallActive: number;
  mediaActive: number;
  smallMemoryBytes: number;
  mediaMemoryBytes: number;
  smallBodyThreshold: number;
  busyRetrySeconds: number;
  maxDiscarding: number;
  rejectDrainMs: number;
}
const DEFAULT_LIMITS: OwnerAdmissionLimits = {
  windowMs: 10 * 60_000,
  smallActive: 16,
  mediaActive: 2,
  smallMemoryBytes: 8 * MiB,
  mediaMemoryBytes: 192 * MiB,
  smallBodyThreshold: 256 * KiB,
  busyRetrySeconds: 5,
  maxDiscarding: 16,
  rejectDrainMs: 5_000,
};
interface WindowUsage {
  started: number;
  requests: number;
  bytes: number;
}
export interface OwnerAdmissionOptions {
  now?: () => number;
  limits?: Partial<OwnerAdmissionLimits>;
  policies?: Partial<Record<OwnerBodyKind, Partial<OwnerBodyPolicy>>>;
}
const bodyLeases = new WeakMap<Request, () => void>();
/** Call in a handler's finally, including when the client disconnected mid-write. */
export function releaseOwnerBody(req: Request) {
  bodyLeases.get(req)?.();
}
export function ownerBodyHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next)
      .finally(() => releaseOwnerBody(req));
  };
}

/**
 * A process-local admission controller, not a production throughput guarantee.
 * Counts actual received traffic, and reserves conservative parser memory until
 * the response ends. Small JSON has its own pool so media cannot starve capture.
 * Call only after origin, production and (where needed) token authentication.
 */
export function createOwnerAdmission(options: OwnerAdmissionOptions = {}) {
  const now = options.now ?? Date.now;
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const policies = Object.fromEntries(
    Object.entries(OWNER_BODY_POLICIES).map(([kind, policy]) => [
      kind,
      { ...policy, ...options.policies?.[kind as OwnerBodyKind] },
    ])
  ) as Record<OwnerBodyKind, OwnerBodyPolicy>;
  for (const value of Object.values(limits))
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error("Invalid owner admission limit");
  for (const policy of Object.values(policies)) {
    for (const key of [
      "maxBytes",
      "memoryFactor",
      "maxRequests",
      "maxWindowBytes",
      "timeoutMs",
    ] as const)
      if (!Number.isSafeInteger(policy[key]) || policy[key] <= 0)
        throw new Error("Invalid owner body policy");
  }
  const active = { small: 0, media: 0 };
  const memory = { small: 0, media: 0 };
  const peak = { small: 0, media: 0, smallMemory: 0, mediaMemory: 0 };
  const windows = new Map<OwnerBodyKind, WindowUsage>();
  let discarding = 0;
  const totals = {
    admitted: 0,
    parsed: 0,
    receivedBytes: 0,
    rejected429: 0,
    rejected413: 0,
    invalid: 0,
    timedOut: 0,
    aborted: 0,
  };
  function usage(kind: OwnerBodyKind) {
    let bucket = windows.get(kind);
    if (!bucket || now() - bucket.started >= limits.windowMs) {
      bucket = { started: now(), requests: 0, bytes: 0 };
      windows.set(kind, bucket);
    }
    return bucket;
  }
  const available = (lane: Lane, extraActive: number, extraMemory: number) =>
    active[lane] + extraActive <=
      (lane === "small" ? limits.smallActive : limits.mediaActive) &&
    memory[lane] + extraMemory <=
      (lane === "small" ? limits.smallMemoryBytes : limits.mediaMemoryBytes);
  const updatePeak = () => {
    peak.small = Math.max(peak.small, active.small);
    peak.media = Math.max(peak.media, active.media);
    peak.smallMemory = Math.max(peak.smallMemory, memory.small);
    peak.mediaMemory = Math.max(peak.mediaMemory, memory.media);
  };
  function body(kind: OwnerBodyKind): RequestHandler {
    const policy = policies[kind];
    return (req, res, next) => {
      let finished = false,
        released = false,
        received = 0;
      let chunks: Buffer[] = [];
      let lane: Lane = policy.lane === "media" ? "media" : "small";
      let reserved = 0,
        admitted = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanupReader = () => {
        if (timer) clearTimeout(timer);
        req.off("data", onData);
        req.off("end", onEnd);
        req.off("error", onError);
      };
      const release = () => {
        if (released) return;
        released = true;
        // Idle keep-alive sockets must not retain the previous private body
        // after the response / awaited handler has finished using it.
        if (bodyLeases.has(req)) req.body = undefined;
        bodyLeases.delete(req);
        if (admitted) {
          active[lane]--;
          memory[lane] -= reserved;
        }
        res.off("finish", release);
        res.off("close", onClose);
        req.off("aborted", onAborted);
      };
      const reject = (status: number, code: string, retrySeconds?: number) => {
        if (finished) return;
        finished = true;
        cleanupReader();
        chunks = [];
        if (status === 429) totals.rejected429++;
        else if (status === 413) totals.rejected413++;
        else if (status === 408) totals.timedOut++;
        else totals.invalid++;
        if (res.headersSent || res.destroyed) {
          release();
          return;
        }
        if (retrySeconds)
          res.setHeader(
            "Retry-After",
            String(Math.max(1, Math.ceil(retrySeconds)))
          );
        // Immediately closing a socket with a large body in flight can replace
        // the429 with a TCP reset. Discard without retaining/parsing, bounded by
        // a short deadline and a separate socket count; never call next().
        if (
          !req.readableEnded &&
          !req.complete &&
          discarding < limits.maxDiscarding
        ) {
          discarding++;
          let drained = false;
          const done = () => {
            if (drained) return;
            drained = true;
            discarding--;
            clearTimeout(deadline);
            req.off("end", done);
            req.off("close", done);
            req.off("error", done);
          };
          const deadline = setTimeout(() => {
            done();
            req.destroy();
          }, limits.rejectDrainMs);
          deadline.unref?.();
          req.once("end", done);
          req.once("close", done);
          req.once("error", done);
          req.resume();
        } else if (!req.readableEnded && !req.complete) {
          res.setHeader("Connection", "close");
          req.pause();
          req.once("error", () => {});
        }
        res.status(status).json({ success: false, code });
        if (!admitted) release();
      };
      function onAborted() {
        if (bodyLeases.has(req)) return;
        if (!finished) totals.aborted++;
        finished = true;
        cleanupReader();
        chunks = [];
        release();
      }
      function onClose() {
        if (!finished) {
          finished = true;
          cleanupReader();
          chunks = [];
        }
        // A parsed body may still be owned by an in-flight database write.
        // The wrapped handler releases it when that work settles.
        else if (bodyLeases.has(req)) return;
        release();
      }
      function onError() {
        reject(400, "BODY_READ_FAILED");
      }
      function onData(chunk: Buffer | string) {
        if (finished) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const size = received + buffer.length;
        totals.receivedBytes += buffer.length;
        if (size > policy.maxBytes) return reject(413, "PAYLOAD_TOO_LARGE");
        const bucket = usage(kind);
        if (bucket.bytes + buffer.length > policy.maxWindowBytes)
          return reject(
            429,
            "RATE_LIMITED",
            (limits.windowMs - (now() - bucket.started)) / 1000
          );
        const targetLane: Lane =
          policy.lane === "auto" && size > limits.smallBodyThreshold
            ? "media"
            : lane;
        const targetReservation = Math.max(
          reserved,
          size * policy.memoryFactor
        );
        if (targetLane !== lane) {
          if (!available(targetLane, 1, targetReservation))
            return reject(429, "RATE_LIMITED", limits.busyRetrySeconds);
          active[lane]--;
          memory[lane] -= reserved;
          lane = targetLane;
          active[lane]++;
          memory[lane] += targetReservation;
        } else {
          const extra = targetReservation - reserved;
          if (!available(lane, 0, extra))
            return reject(429, "RATE_LIMITED", limits.busyRetrySeconds);
          memory[lane] += extra;
        }
        reserved = targetReservation;
        bucket.bytes += buffer.length;
        received = size;
        chunks.push(buffer);
        updatePeak();
      }
      function onEnd() {
        if (finished) return;
        if (declared !== undefined && declared !== received)
          return reject(400, "INVALID_BODY_LENGTH");
        try {
          const raw = Buffer.concat(chunks, received);
          chunks = [];
          if (policy.format === "raw") req.body = raw;
          else {
            const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
            if (!/^[\s]*[\[{]/.test(text)) return reject(400, "INVALID_JSON");
            req.body = JSON.parse(text);
          }
        } catch {
          return reject(400, "INVALID_JSON");
        }
        finished = true;
        cleanupReader();
        totals.parsed++;
        bodyLeases.set(req, release);
        next();
      }
      const encoding = req.headers["content-encoding"];
      if (encoding && encoding !== "identity")
        return reject(415, "ENCODING_NOT_ALLOWED");
      const length = req.headers["content-length"];
      const declared =
        typeof length === "string" && /^\d+$/.test(length)
          ? Number(length)
          : undefined;
      if (
        length !== undefined &&
        (!Number.isSafeInteger(declared) || declared! < 0)
      )
        return reject(400, "INVALID_BODY_LENGTH");
      if (declared !== undefined && declared > policy.maxBytes)
        return reject(413, "PAYLOAD_TOO_LARGE");
      if (policy.lane === "auto" && (declared ?? 0) > limits.smallBodyThreshold)
        lane = "media";
      reserved = (declared ?? 0) * policy.memoryFactor;
      const bucket = usage(kind);
      if (
        bucket.requests >= policy.maxRequests ||
        (declared !== undefined &&
          bucket.bytes + declared > policy.maxWindowBytes)
      )
        return reject(
          429,
          "RATE_LIMITED",
          (limits.windowMs - (now() - bucket.started)) / 1000
        );
      if (!available(lane, 1, reserved))
        return reject(429, "RATE_LIMITED", limits.busyRetrySeconds);
      bucket.requests++;
      active[lane]++;
      memory[lane] += reserved;
      admitted = true;
      totals.admitted++;
      updatePeak();
      res.once("finish", release);
      res.once("close", onClose);
      req.once("aborted", onAborted);
      req.on("data", onData);
      req.once("end", onEnd);
      req.once("error", onError);
      timer = setTimeout(() => reject(408, "BODY_TIMEOUT"), policy.timeoutMs);
      timer.unref?.();
    };
  }
  return {
    body,
    snapshot: () => ({
      active: { ...active },
      discarding,
      estimatedMemory: { ...memory },
      peak: { ...peak },
      totals: { ...totals },
      windows: Object.fromEntries(
        [...windows].map(([kind, value]) => [kind, { ...value }])
      ),
    }),
  };
}
export type OwnerAdmission = ReturnType<typeof createOwnerAdmission>;
/** Both route versions import this same process-wide controller. */
export const ownerAdmission = createOwnerAdmission();
export const parseOwnerBody = (kind: OwnerBodyKind) =>
  ownerAdmission.body(kind);
