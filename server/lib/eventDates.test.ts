import { describe, it, expect } from "vitest";
import { parseEventDates } from "../../client/src/lib/eventDates";

describe("parseEventDates", () => {
  it("reads the day ranges the copy actually uses", () => {
    // En-dash, as authored in destinations.json.
    expect(parseEventDates("15–23 August 2026")).toEqual({
      startDate: "2026-08-15",
      endDate: "2026-08-23",
    });
    expect(parseEventDates("6–8 August 2026")).toEqual({
      startDate: "2026-08-06",
      endDate: "2026-08-08",
    });
  });

  it("handles a plain hyphen and a single day", () => {
    expect(parseEventDates("1-3 May 2027")).toEqual({ startDate: "2027-05-01", endDate: "2027-05-03" });
    expect(parseEventDates("9 September 2026")).toEqual({ startDate: "2026-09-09" });
  });

  it("returns nothing for prose a calendar cannot hold", () => {
    // Every one of these is real copy from destinations.json.
    for (const s of [
      "Last weekend of May",
      "September into early October",
      "Early December through early January",
      "February (movable)",
    ]) {
      expect(parseEventDates(s)).toBeNull();
    }
  });

  it("rejects a day the month does not have", () => {
    expect(parseEventDates("31 February 2026")).toBeNull();
    expect(parseEventDates("31 April 2026")).toBeNull();
    expect(parseEventDates("29 February 2026")).toBeNull(); // 2026 is not a leap year
    expect(parseEventDates("29 February 2028")).toEqual({ startDate: "2028-02-29" });
  });

  it("rejects an unknown month and empty input", () => {
    expect(parseEventDates("15 Augosto 2026")).toBeNull();
    expect(parseEventDates("")).toBeNull();
    expect(parseEventDates(undefined)).toBeNull();
  });
});
