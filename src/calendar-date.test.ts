import {describe, expect, it} from "vitest";
import {hasActualCalendarDate, isActualCalendarDate} from "./calendar-date.js";

describe("calendar dates", () => {
  it("accepts real YYYY-MM-DD dates including leap days", () => {
    expect(isActualCalendarDate("2026-08-14")).toBe(true);
    expect(isActualCalendarDate("2024-02-29")).toBe(true);
  });

  it("rejects impossible, year-zero, and malformed dates", () => {
    expect(isActualCalendarDate("2025-02-29")).toBe(false);
    expect(isActualCalendarDate("0000-01-01")).toBe(false);
    expect(isActualCalendarDate("2026-8-14")).toBe(false);
  });

  it("finds a real YYYY-MM-DD inside a longer citation", () => {
    expect(hasActualCalendarDate(
      "https://partner.steamgames.com/doc/store/releasing accessedAt 2026-08-19",
    )).toBe(true);
    expect(hasActualCalendarDate("https://partner.steamgames.com/doc/store/releasing")).toBe(false);
    expect(hasActualCalendarDate("accessedAt 2025-02-29")).toBe(false);
  });
});
