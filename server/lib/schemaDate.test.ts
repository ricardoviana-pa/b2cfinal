import { describe, it, expect } from "vitest";
import { toSchemaDateTime } from "../../client/src/lib/schemaDate";

describe("toSchemaDateTime", () => {
  it("gives a summer date Lisbon's +01:00", () => {
    // Both dates the Q&A capsules actually carry.
    expect(toSchemaDateTime("2026-04-17")).toBe("2026-04-17T12:00:00+01:00");
    expect(toSchemaDateTime("2026-05-02")).toBe("2026-05-02T12:00:00+01:00");
  });

  it("gives a winter date +00:00 — the offset is not hardcoded", () => {
    expect(toSchemaDateTime("2026-01-15")).toBe("2026-01-15T12:00:00+00:00");
    expect(toSchemaDateTime("2026-12-24")).toBe("2026-12-24T12:00:00+00:00");
  });

  it("leaves an already-zoned date-time alone", () => {
    expect(toSchemaDateTime("2026-04-17T09:30:00+01:00")).toBe("2026-04-17T09:30:00+01:00");
    expect(toSchemaDateTime("2026-04-17T09:30:00Z")).toBe("2026-04-17T09:30:00Z");
  });

  it("returns nothing when there is no date to give", () => {
    expect(toSchemaDateTime(undefined)).toBeNull();
    expect(toSchemaDateTime("")).toBeNull();
    expect(toSchemaDateTime("April 2026")).toBeNull();
    expect(toSchemaDateTime("17/04/2026")).toBeNull();
  });

  it("rejects a day the calendar does not hold", () => {
    // Date() would roll this into March; the caller must not emit it.
    expect(toSchemaDateTime("2026-02-31")).toBeNull();
    expect(toSchemaDateTime("2026-04-31")).toBeNull();
    expect(toSchemaDateTime("2026-02-29")).toBeNull();
    expect(toSchemaDateTime("2028-02-29")).toBe("2028-02-29T12:00:00+00:00");
  });
});
