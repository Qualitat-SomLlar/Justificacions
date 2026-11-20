import { describe, expect, it } from "vitest";
import { formatDateCa, formatPeriode, isOutsidePeriode, parsePeriode } from "@/lib/periode";

describe("parsePeriode", () => {
  it("reads the usual format", () => {
    expect(parsePeriode("01/01/2026-31/12/2026")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(parsePeriode("01/05/2025-30/04/2026")).toEqual({ from: "2025-05-01", to: "2026-04-30" });
  });

  it("accepts spaces, dots, dashes and single-digit days or months", () => {
    expect(parsePeriode("1/1/2026 - 31/12/2026")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(parsePeriode("01.02.2026 - 28.02.2026")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(parsePeriode("01-01-2026-31-12-2026")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("accepts a one-day period and a leap day", () => {
    expect(parsePeriode("15/03/2026-15/03/2026")).toEqual({ from: "2026-03-15", to: "2026-03-15" });
    expect(parsePeriode("01/02/2028-29/02/2028")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("rejects anything that is not two valid dates in order", () => {
    expect(parsePeriode("")).toBeNull();
    expect(parsePeriode(undefined)).toBeNull();
    expect(parsePeriode("tot l'any")).toBeNull();
    expect(parsePeriode("01/01/2026")).toBeNull();
    expect(parsePeriode("31/12/2026-01/01/2026")).toBeNull(); // reversed
    expect(parsePeriode("01/01/2026-31/02/2026")).toBeNull(); // 31 February
    expect(parsePeriode("01/01/2026-31/04/2026")).toBeNull(); // 31 April
    expect(parsePeriode("01/02/2027-29/02/2027")).toBeNull(); // not a leap year
    expect(parsePeriode("01/13/2026-31/12/2026")).toBeNull(); // month 13
    expect(parsePeriode("01/01/2026-31/12/2026-01/01/2027")).toBeNull(); // three dates
  });
});

describe("isOutsidePeriode", () => {
  const p = { from: "2026-01-01", to: "2026-06-30" };

  it("includes both ends of the period", () => {
    expect(isOutsidePeriode("2026-01-01", p)).toBe(false);
    expect(isOutsidePeriode("2026-06-30", p)).toBe(false);
    expect(isOutsidePeriode("2026-03-15", p)).toBe(false);
  });

  it("flags dates before and after", () => {
    expect(isOutsidePeriode("2025-12-31", p)).toBe(true);
    expect(isOutsidePeriode("2026-07-01", p)).toBe(true);
  });

  it("never flags without a period or with an unreadable date", () => {
    expect(isOutsidePeriode("2030-01-01", null)).toBe(false);
    expect(isOutsidePeriode("", p)).toBe(false);
    expect(isOutsidePeriode(undefined, p)).toBe(false);
    expect(isOutsidePeriode("15/03/2026", p)).toBe(false);
  });
});

describe("formatting", () => {
  it("formats dates and periods for display", () => {
    expect(formatDateCa("2026-03-05")).toBe("05/03/2026");
    expect(formatDateCa("")).toBe("-");
    expect(formatDateCa("no és data")).toBe("no és data");
    expect(formatPeriode({ from: "2026-01-01", to: "2026-12-31" })).toBe("01/01/2026 – 31/12/2026");
    expect(formatPeriode(null)).toBe("sense període definit");
  });
});
