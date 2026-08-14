import {describe, expect, it} from "vitest";
import {isActualCalendarDate} from "./calendar-date.js";

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
});
